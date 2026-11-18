/**
 * Meta progress between runs (docs/retention.md): hero XP and levels, Galaxies, the planet track,
 * the season pass, leagues, Credits and cosmetics. Source of all numbers: data/meta.json.
 *
 * Everything here is pure: a profile goes in, a new profile and what changed come out. Storage
 * (the device for now, a server later) and the clock belong to the caller; the current date only
 * comes in as an ISO string.
 */
import { z } from "zod";
import { parseOrThrow, type GameData } from "./gamedata.js";
import { checkQuests, QuestsData } from "./quests.js";

const Int = z.number().int().min(0);

/** the longest player name */
export const NAME_MAX = 16;

/** What a step of a track gives. One kind per reward. */
export const Reward = z.union([
  z.object({ credits: z.number().int().positive() }).strict(),
  z.object({ cosmetic: z.string() }).strict(),
  z.object({ hero: z.string() }).strict(),
]);
export type Reward = z.infer<typeof Reward>;

export const COSMETIC_KINDS = ["background", "grid", "skin", "heroCosmetic", "patch", "picture"] as const;
export type CosmeticKind = (typeof COSMETIC_KINDS)[number];

export const MetaData = z.object({
  $comment: z.string().optional(),
  /** what a new profile starts with */
  start: z.object({ name: z.string().min(1).max(NAME_MAX), credits: Int, cosmetics: z.array(z.string()), background: z.string(), picture: z.string() }).strict(),
  /** opponents: a new player meets the easier bot backpacks in this many first runs (docs/matchmaking.md) */
  matching: z.object({ easyRuns: Int }).strict(),
  /**
   * Player names (ACC-07): a name is refused when, written in plain letters (lower case, umlauts spelled out, digits
   * read as letters, everything else dropped), it contains a `blocked` part or one of its words is a `blockedWord`.
   * Offensive and political words in English and German; short or ambiguous ones only as whole words.
   */
  names: z.object({
    blocked: z.array(z.string().regex(/^[a-z0-9]{3,}$/)),
    blockedWords: z.array(z.string().regex(/^[a-z]{2,}$/)),
  }).strict(),
  /** daily and weekly quests: a whole run with one special rule each (quests.ts) */
  quests: QuestsData,
  /** what a finished run pays */
  run: z.object({
    galaxies: z.object({ perWin: Int, perLifeLeft: Int }).strict(),
    heroXp: z.object({ perRound: Int, perWin: Int }).strict(),
  }).strict(),
  heroLevels: z.object({
    /** total XP needed for level 2, 3, ... (level 1 needs none); strictly rising */
    xp: z.array(z.number().int().positive()).min(1),
    /** levels that give the hero a cosmetic (placeholders `<hero>_lv<level>` until the cosmetics are designed) */
    cosmeticAt: z.array(z.number().int().min(2)),
  }).strict(),
  /** permanent, across seasons: total Galaxies ever earned unlock each step */
  planetTrack: z.array(z.object({ galaxies: z.number().int().positive(), reward: Reward }).strict()).min(1),
  leagues: z.object({
    /** ids from the lowest to the highest league; the names are drafts (locales `league.<id>`) */
    ids: z.array(z.string()).min(2),
    /**
     * league groups from the lowest up, as the number of leagues in each (docs/matchmaking.md "League groups"):
     * Amateur, Intermediate, Pro, Elite. Bot players belong to a group, not to a single league. A new season starts in the
     * highest league of the next lower group; the lowest group keeps its league.
     */
    groups: z.array(z.number().int().positive()).min(1),
    pointsPerLeague: z.number().int().positive(),
    /** league points for a run by its wins: index = wins (0 ... rounds) */
    pointsByWins: z.array(z.number().int()),
  }).strict(),
  cosmetics: z.array(z.object({ id: z.string(), kind: z.enum(COSMETIC_KINDS), hero: z.string().optional(), /** backgrounds: the place of lore/planets.json it shows */ planet: z.string().optional() }).strict()),
  seasons: z.array(z.object({
    id: z.number().int().positive(),
    /** first day of the season, YYYY-MM-DD */
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** the hero this season brings (premium pass level 1), if any */
    hero: z.string().optional(),
    pass: z.object({
      galaxiesPerLevel: z.number().int().positive(),
      /** level 1, 2, ...; level 1 is open from the start of the season */
      levels: z.array(z.object({ free: Reward.optional(), premium: Reward.optional() }).strict()).min(1),
    }).strict(),
  }).strict()).min(1),
}).strict();
export type MetaData = z.infer<typeof MetaData>;

export interface Cosmetic { id: string; kind: CosmeticKind; hero?: string; /** backgrounds: the place of lore/planets.json it shows */ planet?: string; /** patches: the season and league they stand for */ season?: number; league?: string }

export interface Meta extends MetaData {
  cosmeticById: Map<string, Cosmetic>;
  /** heroes everyone owns from the start: every hero that no season brings */
  startHeroes: string[];
}

export const heroCosmeticId = (hero: string, level: number) => `${hero}_lv${level}`;
export const patchId = (season: number, league: string) => `patch_s${season}_${league}`;

/** Validates data/meta.json against the game data. */
export function buildMeta(raw: unknown, data: GameData): Meta {
  const m = parseOrThrow(MetaData, raw, "meta.json");
  const problems: string[] = [];
  const cosmeticById = new Map<string, Cosmetic>();
  const add = (c: Cosmetic) => { if (cosmeticById.has(c.id)) problems.push(`cosmetic ${c.id} is listed twice`); cosmeticById.set(c.id, c); };
  for (const c of m.cosmetics) {
    if (c.planet && c.kind !== "background") problems.push(`cosmetic ${c.id}: only backgrounds show a planet`);
    if (c.kind === "heroCosmetic" || c.kind === "patch") problems.push(`cosmetic ${c.id}: ${c.kind} cosmetics are made from the hero levels and leagues, do not list them`);
    if (c.hero && !data.heroes.has(c.hero)) problems.push(`cosmetic ${c.id}: unknown hero ${c.hero}`);
    add(c);
  }
  for (const h of data.heroList) for (const lv of m.heroLevels.cosmeticAt) add({ id: heroCosmeticId(h.id, lv), kind: "heroCosmetic", hero: h.id });
  for (const s of m.seasons) for (const l of m.leagues.ids) add({ id: patchId(s.id, l), kind: "patch", season: s.id, league: l });

  problems.push(...checkQuests(m.quests, data));
  const rising = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);
  if (!rising(m.heroLevels.xp)) problems.push("heroLevels.xp must rise from level to level");
  const maxLevel = m.heroLevels.xp.length + 1;
  for (const lv of m.heroLevels.cosmeticAt) if (lv > maxLevel) problems.push(`heroLevels.cosmeticAt ${lv}: the highest level is ${maxLevel}`);
  if (!rising(m.planetTrack.map((s) => s.galaxies))) problems.push("planetTrack: the Galaxies of the steps must rise");
  if (m.leagues.pointsByWins.length !== data.rules.rounds + 1) problems.push(`leagues.pointsByWins needs ${data.rules.rounds + 1} entries (0 to ${data.rules.rounds} wins)`);
  if (new Set(m.leagues.ids).size !== m.leagues.ids.length) problems.push("leagues.ids: duplicate id");
  if (m.leagues.groups.reduce((a, b) => a + b, 0) !== m.leagues.ids.length) problems.push("leagues.groups must add up to the number of leagues");
  if (!rising(m.seasons.map((s) => s.id))) problems.push("seasons: ids must rise");
  if (!m.seasons.every((s, i) => i === 0 || s.start > m.seasons[i - 1]!.start)) problems.push("seasons: start dates must rise");

  const seasonHeroes = new Set<string>();
  const checkReward = (r: Reward | undefined, where: string) => {
    if (!r) return;
    if ("cosmetic" in r && !cosmeticById.has(r.cosmetic)) problems.push(`${where}: unknown cosmetic ${r.cosmetic}`);
    if ("hero" in r && !data.heroes.has(r.hero)) problems.push(`${where}: unknown hero ${r.hero}`);
  };
  for (const s of m.seasons) {
    if (s.hero) {
      if (!data.heroes.has(s.hero)) problems.push(`season ${s.id}: unknown hero ${s.hero}`);
      seasonHeroes.add(s.hero);
      const first = s.pass.levels[0]?.premium;
      if (!first || !("hero" in first) || first.hero !== s.hero) problems.push(`season ${s.id}: the premium pass must give ${s.hero} at level 1`);
    }
    s.pass.levels.forEach((l, i) => {
      checkReward(l.free, `season ${s.id} pass level ${i + 1} free`);
      checkReward(l.premium, `season ${s.id} pass level ${i + 1} premium`);
      if (l.free && "hero" in l.free) problems.push(`season ${s.id} pass level ${i + 1}: the free pass gives no hero`);
    });
  }
  m.planetTrack.forEach((s, i) => checkReward(s.reward, `planetTrack step ${i + 1}`));
  for (const c of m.start.cosmetics) if (!cosmeticById.has(c)) problems.push(`start: unknown cosmetic ${c}`);
  if (cosmeticById.get(m.start.background)?.kind !== "background" || !m.start.cosmetics.includes(m.start.background)) problems.push("start.background must be a background in start.cosmetics");
  if (cosmeticById.get(m.start.picture)?.kind !== "picture" || !m.start.cosmetics.includes(m.start.picture)) problems.push("start.picture must be a picture in start.cosmetics");
  if (problems.length) throw new Error(`meta.json:\n- ${problems.join("\n- ")}`);
  return { ...m, cosmeticById, startHeroes: data.heroList.filter((h) => !seasonHeroes.has(h.id)).map((h) => h.id) };
}

// ---------------------------------------------------------------------------------------------
// The profile

export interface SeasonState {
  id: number;
  /** Galaxies earned this season: they move the pass */
  galaxies: number;
  premium: boolean;
  /** league points; the league is points / pointsPerLeague */
  points: number;
  /** the highest league reached this season: a floor you cannot drop below */
  peak: number;
}

export interface Profile {
  /** the name on the player's banner */
  name: string;
  /** Galaxies earned in total, across seasons: they move the planet track */
  galaxies: number;
  credits: number;
  /** XP per hero id */
  heroXp: Record<string, number>;
  /** heroes owned on top of the start heroes (season heroes) */
  heroes: string[];
  cosmetics: string[];
  /** what is worn: menu background, league patch, player picture, and a skin per hero (none = the hero's own look) */
  /** grid: the backpack grid background (null = the plain grid) */
  equipped: { background: string; patch: string | null; picture: string; grid: string | null; skins: Record<string, string> };
  season: SeasonState;
  runs: number;
}

export function newProfile(meta: Meta, seasonId = meta.seasons[0]!.id): Profile {
  const p: Profile = {
    name: meta.start.name, galaxies: 0, credits: meta.start.credits, heroXp: {}, heroes: [], cosmetics: [...meta.start.cosmetics],
    equipped: { background: meta.start.background, patch: null, picture: meta.start.picture, grid: null, skins: {} },
    season: { id: seasonId, galaxies: 0, premium: false, points: 0, peak: 0 }, runs: 0,
  };
  grant(p, passRewardsUpTo(meta, p.season, 1, 0));
  return p;
}

const clone = (p: Profile): Profile => JSON.parse(JSON.stringify(p)) as Profile;

/** Puts rewards into the profile; returns those that were new (a cosmetic or hero already owned is skipped). */
function grant(p: Profile, rewards: Reward[]): Reward[] {
  const out: Reward[] = [];
  for (const r of rewards) {
    if ("credits" in r) { p.credits += r.credits; out.push(r); }
    else if ("cosmetic" in r) { if (!p.cosmetics.includes(r.cosmetic)) { p.cosmetics.push(r.cosmetic); out.push(r); } }
    else if (!p.heroes.includes(r.hero)) { p.heroes.push(r.hero); out.push(r); }
  }
  return out;
}

/** The number on the player's picture: the levels of all owned heroes added up. */
export function profileLevel(meta: Meta, p: Profile): number {
  return [...meta.startHeroes, ...p.heroes].reduce((sum, h) => sum + heroLevel(meta, p.heroXp[h] ?? 0).level, 0);
}

export function ownsHero(meta: Meta, p: Profile, hero: string): boolean { return meta.startHeroes.includes(hero) || p.heroes.includes(hero); }

// --- hero levels

export interface Level { level: number; max: number; /** XP into this level */ into: number; /** XP this level needs to the next; 0 at the top */ need: number }

export function heroLevel(meta: Meta, xp: number): Level {
  const t = meta.heroLevels.xp;
  let level = 1;
  while (level - 1 < t.length && xp >= t[level - 1]!) level++;
  const from = level === 1 ? 0 : t[level - 2]!;
  const to = t[level - 1];
  return { level, max: t.length + 1, into: xp - from, need: to === undefined ? 0 : to - from };
}

export function heroLevelRewards(meta: Meta, hero: string, from: number, to: number): Reward[] {
  return meta.heroLevels.cosmeticAt.filter((lv) => lv > from && lv <= to).map((lv) => ({ cosmetic: heroCosmeticId(hero, lv) }));
}

// --- planet track and pass

/** Which track a reward of a booked run comes from: a hero level, the planet track or the season pass. */
export function rewardTrack(meta: Meta, r: Reward): "level" | "planet" | "pass" {
  if ("cosmetic" in r && meta.cosmeticById.get(r.cosmetic)?.kind === "heroCosmetic") return "level";
  if (meta.planetTrack.some((s) => JSON.stringify(s.reward) === JSON.stringify(r))) return "planet";
  return "pass";
}

export function planetRewards(meta: Meta, from: number, to: number): Reward[] {
  return meta.planetTrack.filter((s) => s.galaxies > from && s.galaxies <= to).map((s) => s.reward);
}

export function seasonData(meta: Meta, id: number) {
  const s = meta.seasons.find((x) => x.id === id);
  if (!s) throw new Error(`unknown season ${id}`);
  return s;
}

/** Pass level for Galaxies earned this season: level 1 at 0, then one level per `galaxiesPerLevel`. */
export function passLevel(meta: Meta, s: { id: number; galaxies: number }): number {
  const pass = seasonData(meta, s.id).pass;
  return Math.min(pass.levels.length, 1 + Math.floor(s.galaxies / pass.galaxiesPerLevel));
}

function passRewardsUpTo(meta: Meta, s: SeasonState, to: number, from: number): Reward[] {
  const out: Reward[] = [];
  seasonData(meta, s.id).pass.levels.forEach((l, i) => {
    const lv = i + 1;
    if (lv <= from || lv > to) return;
    if (l.free) out.push(l.free);
    if (l.premium && s.premium) out.push(l.premium);
  });
  return out;
}

/** Opens the premium pass of the current season and hands out its rewards up to the reached level. Paying for it is not built. */
export function unlockPremium(meta: Meta, p0: Profile): { profile: Profile; rewards: Reward[] } {
  const p = clone(p0);
  if (p.season.premium) return { profile: p, rewards: [] };
  p.season.premium = true;
  const lv = passLevel(meta, p.season);
  const premium = seasonData(meta, p.season.id).pass.levels.slice(0, lv).flatMap((l) => (l.premium ? [l.premium] : []));
  return { profile: p, rewards: grant(p, premium) };
}

// --- leagues

export function leagueOf(meta: Meta, points: number): number {
  return Math.min(meta.leagues.ids.length - 1, Math.floor(Math.max(0, points) / meta.leagues.pointsPerLeague));
}

/** The league group of a league (0 = the lowest group) and the leagues it spans, lowest and highest. */
export function leagueGroup(meta: Meta, league: number): { group: number; from: number; to: number } {
  let from = 0;
  for (const [group, size] of meta.leagues.groups.entries()) {
    if (league < from + size) return { group, from, to: from + size - 1 };
    from += size;
  }
  throw new Error(`league ${league} is in no group`);
}

/** Points after a run: never below the start of the highest league reached this season. */
export function addLeaguePoints(meta: Meta, s: { points: number; peak: number }, delta: number): { points: number; peak: number } {
  const points = Math.max(s.peak * meta.leagues.pointsPerLeague, s.points + delta);
  return { points, peak: Math.max(s.peak, leagueOf(meta, points)) };
}

// --- seasons

/** The season running on a date (YYYY-MM-DD): the last one that has started; the first before any has. */
export function seasonAt(meta: Meta, date: string): number {
  let id = meta.seasons[0]!.id;
  for (const s of meta.seasons) if (s.start <= date.slice(0, 10)) id = s.id;
  return id;
}

export interface SeasonChange {
  profile: Profile;
  /** the patch for the league reached in the season that ended */
  patch: string | null;
  /** league before and after the drop */
  league: [number, number];
  rewards: Reward[];
}

/** The league a new season starts in: the highest league of the next lower group; in the lowest group the same one. */
export function seasonStartLeague(meta: Meta, league: number): number {
  const { group, from } = leagueGroup(meta, league);
  return group === 0 ? league : from - 1;
}

/**
 * Moves the profile into a later season: the ended season pays its league patch, the league drops to
 * `seasonStartLeague` (that league is the new floor), the pass starts again. Nothing happens for the same or an earlier season.
 */
export function enterSeason(meta: Meta, p0: Profile, seasonId: number): SeasonChange | null {
  if (seasonId <= p0.season.id) return null;
  const p = clone(p0);
  const before = p.season.peak;
  const patch = patchId(p.season.id, meta.leagues.ids[before]!);
  const rewards = grant(p, [{ cosmetic: patch }]);
  const after = seasonStartLeague(meta, before);
  p.season = { id: seasonId, galaxies: 0, premium: false, points: after * meta.leagues.pointsPerLeague, peak: after };
  rewards.push(...grant(p, passRewardsUpTo(meta, p.season, 1, 0)));
  return { profile: p, patch, league: [before, after], rewards };
}

// --- after a run

/** What a finished run brings, before it is booked. */
export interface RunSummary { hero: string; wins: number; livesLeft: number; roundsPlayed: number }

export function runGalaxies(meta: Meta, r: RunSummary): number {
  return r.wins * meta.run.galaxies.perWin + Math.max(0, r.livesLeft) * meta.run.galaxies.perLifeLeft;
}

export function runHeroXp(meta: Meta, r: RunSummary): number {
  return r.roundsPlayed * meta.run.heroXp.perRound + r.wins * meta.run.heroXp.perWin;
}

export function runLeaguePoints(meta: Meta, r: RunSummary): number {
  const t = meta.leagues.pointsByWins;
  return t[Math.min(t.length - 1, Math.max(0, r.wins))]!;
}

export interface RunBooking {
  profile: Profile;
  galaxies: number;
  xp: number;
  level: [number, number];
  /** league points as booked (a floor can make them smaller than the run earned) */
  points: number;
  league: [number, number];
  pass: [number, number];
  /** everything newly unlocked: hero levels, planet track, pass */
  rewards: Reward[];
}

/**
 * Books a finished run: hero XP, Galaxies (season pass and planet track), league points. A quest run (`quest`) books
 * no league points: its special rule makes it unlike a normal run.
 */
export function bookRun(meta: Meta, p0: Profile, r: RunSummary, opts: { quest?: boolean } = {}): RunBooking {
  const p = clone(p0);
  const galaxies = runGalaxies(meta, r), xp = runHeroXp(meta, r);
  const xp0 = p.heroXp[r.hero] ?? 0;
  const lv0 = heroLevel(meta, xp0).level, lv1 = heroLevel(meta, xp0 + xp).level;
  p.heroXp[r.hero] = xp0 + xp;
  const pass0 = passLevel(meta, p.season);
  const total0 = p.galaxies;
  p.galaxies += galaxies;
  p.season.galaxies += galaxies;
  const pass1 = passLevel(meta, p.season);
  const league0 = leagueOf(meta, p.season.points), points0 = p.season.points;
  if (!opts.quest) Object.assign(p.season, addLeaguePoints(meta, p.season, runLeaguePoints(meta, r)));
  p.runs++;
  const rewards = grant(p, [
    ...heroLevelRewards(meta, r.hero, lv0, lv1),
    ...planetRewards(meta, total0, p.galaxies),
    ...passRewardsUpTo(meta, p.season, pass1, pass0),
  ]);
  return { profile: p, galaxies, xp, level: [lv0, lv1], points: p.season.points - points0, league: [league0, leagueOf(meta, p.season.points)], pass: [pass0, pass1], rewards };
}

// --- equipping

export const EQUIP_SLOTS = ["background", "patch", "picture", "grid"] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/**
 * Equips an owned background, patch, player picture or grid background (`null` takes the patch or the grid off).
 * Returns null when it cannot be equipped.
 */
export function equip(meta: Meta, p0: Profile, slot: EquipSlot, id: string | null): Profile | null {
  if (id === null) {
    if (slot !== "patch" && slot !== "grid") return null;
    const p = clone(p0);
    p.equipped[slot] = null;
    return p;
  }
  const c = meta.cosmeticById.get(id);
  if (!c || c.kind !== slot || !p0.cosmetics.includes(id)) return null;
  const p = clone(p0);
  p.equipped[slot] = id;
  return p;
}

/** Puts an owned skin (bought or from a hero level) on its hero; `null` goes back to the hero's own look. Null when it cannot be worn. */
export function equipSkin(meta: Meta, p0: Profile, hero: string, id: string | null): Profile | null {
  if (id !== null) {
    const c = meta.cosmeticById.get(id);
    if (!c || (c.kind !== "skin" && c.kind !== "heroCosmetic") || c.hero !== hero || !p0.cosmetics.includes(id)) return null;
  }
  const p = clone(p0);
  if (id === null) delete p.equipped.skins[hero]; else p.equipped.skins[hero] = id;
  return p;
}

const SPELLED: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "i" };
/** Each run of the same letter as one letter, so stretched words ("fuuuck") are found too. */
const squeeze = (s: string) => s.replace(/(.)\1+/g, "$1");

/** Whether a name passes the filter of `meta.names` (it says nothing about the length). */
export function nameAllowed(meta: Meta, name: string): boolean {
  const lower = name.toLowerCase().replace(/[äöüß]/g, (c) => SPELLED[c]!).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const plain = lower.replace(/[0-9@$!|]/g, (c) => LEET[c]!);
  const words = plain.split(/[^a-z]+/).filter(Boolean);
  const joined = words.join("");
  const digits = lower.replace(/[^a-z0-9]/g, "");
  const blockedPart = (f: string) =>
    joined.includes(f) || digits.includes(f) || (squeeze(f).length >= 4 && squeeze(joined).includes(squeeze(f)));
  if (meta.names.blocked.some(blockedPart)) return false;
  return !words.some((w) => meta.names.blockedWords.includes(w) || meta.names.blockedWords.includes(squeeze(w)));
}

/** A tidied player name, or null when it is empty, too long or refused by the filter. */
export function playerName(meta: Meta, raw: string): string | null {
  const n = raw.replace(/\s+/g, " ").trim();
  return n.length >= 1 && [...n].length <= NAME_MAX && nameAllowed(meta, n) ? n : null;
}

/** Renames the player; null when the name is not allowed. */
export function rename(meta: Meta, p0: Profile, raw: string): Profile | null {
  const n = playerName(meta, raw);
  if (n === null) return null;
  const p = clone(p0);
  p.name = n;
  return p;
}

/** Repairs a stored profile against the current data (removed cosmetics, unknown season); null when it is unusable. */
export function fitProfile(meta: Meta, raw: unknown): Profile | null {
  const p = raw as Profile;
  if (!p || typeof p !== "object" || typeof p.galaxies !== "number" || typeof p.credits !== "number" || !p.season || !Array.isArray(p.cosmetics)) return null;
  if (!meta.seasons.some((s) => s.id === p.season.id)) return null;
  const q = clone(p);
  q.cosmetics = q.cosmetics.filter((c) => meta.cosmeticById.has(c));
  for (const c of meta.start.cosmetics) if (!q.cosmetics.includes(c)) q.cosmetics.push(c);
  q.equipped = { background: q.equipped?.background, patch: q.equipped?.patch ?? null, picture: q.equipped?.picture, grid: q.equipped?.grid ?? null, skins: { ...(q.equipped?.skins ?? {}) } };
  if (!q.cosmetics.includes(q.equipped.background)) q.equipped.background = meta.start.background;
  if (!q.cosmetics.includes(q.equipped.picture)) q.equipped.picture = meta.start.picture;
  if (q.equipped.patch && !q.cosmetics.includes(q.equipped.patch)) q.equipped.patch = null;
  if (q.equipped.grid && !q.cosmetics.includes(q.equipped.grid)) q.equipped.grid = null;
  for (const [hero, id] of Object.entries(q.equipped.skins)) if (!q.cosmetics.includes(id) || meta.cosmeticById.get(id)?.hero !== hero) delete q.equipped.skins[hero];
  q.heroXp ??= {};
  if (typeof q.name !== "string" || !q.name.trim()) q.name = meta.start.name;
  q.heroes = (q.heroes ?? []).filter((h) => meta.seasons.some((s) => s.hero === h));
  return q;
}
