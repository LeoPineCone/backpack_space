/**
 * Measuring the ways to win: lobbies in which every bot commits to one path of its hero (or to none, "open").
 * One lobby gives one SeatStat per bot; the reports add them up. Shares come with a standard error from
 * blocks of lobbies (batch means): fights of one bot, and bots of one lobby, are not independent, so the
 * error over single fights would look far too small.
 */
import { onPath, type BattleResult, type Build, type GameData, type ItemDef } from "@backpack-space/core";
import { playLobby } from "./lobby";

export const SOURCES = ["weapon", "direct", "burn", "toxin", "spikes"] as const;
export type Source = (typeof SOURCES)[number];

/**
 * Path profile: damage by mechanic instead of by battle source. Item damage (weapon hits and effect damage) goes to
 * the class of the item that dealt it; Burn, Toxin and Spikes are not tied to an item.
 */
export const MECHANICS = ["weapon", "pet", "shield", "count", "debuff", "direct", "burn", "toxin", "spikes"] as const;
export type Mechanic = (typeof MECHANICS)[number];
export const MECHANIC_TEXT: Record<Mechanic, string> = {
  weapon: "weapon hits", pet: "pet hits", shield: "Shield ram (damage per own Shield)", count: "count damage (per item in the backpack)",
  debuff: "debuff damage (per enemy debuff)", direct: "other item damage", burn: "Burn", toxin: "Toxin", spikes: "Spikes",
};
/** the mechanic an item's damage counts as */
export function mechanicOf(def: ItemDef): Mechanic {
  if (def.damage) return (def.tags as string[]).includes("pet") ? "pet" : "weapon";
  const dmg = def.effects.find((e) => e.do === "damage");
  if (dmg?.per?.buff === "shield") return "shield";
  if (dmg?.per?.ship || dmg?.per?.stars) return "count";
  if (dmg?.per?.debuff) return "debuff";
  return "direct";
}
const emptyMech = (): Record<Mechanic, number> => Object.fromEntries(MECHANICS.map((m) => [m, 0])) as Record<Mechanic, number>;

/** what one bot did in one lobby, against bots of other heroes */
export interface SeatStat {
  /** "<hero>/<path>", "" path = open bot */
  key: string;
  /** fights won / fought, all rounds and from the late round on */
  w: number; n: number; lw: number; ln: number;
  /** late rounds: damage by source, healed+shielded in hero health, fights, seconds */
  dmg: Record<Source, number>; kept: number; fights: number; secs: number;
  /** share of the final build's item cost on the path (null for open bots) */
  commit: number | null;
  /** run wins and whether lives were left, by the real rules */
  wins: number; alive: boolean;
  /** late rounds, path profile: damage by mechanic; damage of the single best item, of path items, from the third phase on;
   *  items that dealt damage (summed over fights), weapon attacks, fight seconds */
  mech: Record<Mechanic, number>; top: number; onPath: number; lateDmg: number; dealers: number; attacks: number;
}

/** first round of the last third of the run */
export const lateRound = (data: GameData) => Math.ceil((data.rules.rounds * 2) / 3) + 1;

/** seat i plays hero i mod heroes, with its k-th path (k = i div heroes); past the paths the bot is open */
export function pathOfSeat(data: GameData, seat: number): string {
  const h = data.heroList[seat % data.heroList.length]!;
  return h.paths[Math.floor(seat / data.heroList.length)]?.id ?? "";
}

/** What a measurement keeps of one fight (attacker's view): enough to add up every fight-level number again. */
export interface FightRec {
  /** attacker won */
  w: 0 | 1;
  secs: number;
  /** the fight reached the Supernova */
  nova: boolean;
  /** attacker: maximum health, healed + shielded, damage by source (order of SOURCES), per item, from the third phase on, weapon attacks */
  hp: number; kept: number; dmg: number[]; items: number[]; late: number; attacks: number;
}
export function recOf(res: BattleResult): FightRec {
  const st = res.stats[0];
  return { w: res.winner === 0 ? 1 : 0, secs: res.seconds, nova: res.supernova, hp: res.maxHp[0], kept: st.healed + st.shielded, dmg: SOURCES.map((k) => st[k]), items: [...st.itemDamage], late: st.late, attacks: st.attacks };
}
/** A bot of a played lobby: its hero, path and build per round (index 0 = round 1). */
export interface LobbySeat { hero: string; path: string; builds: Build[] }
export interface LobbyFight { round: number; a: number; b: number; rec: FightRec }

/** One SeatStat per bot from the fights of a lobby (attacker's results; mirror fights do not count for the shares). */
export function seatStats(data: GameData, seats: readonly LobbySeat[], fights: readonly LobbyFight[]): SeatStat[] {
  const late = lateRound(data);
  const cost = (id: string) => Math.max(1, data.items.get(id)!.cost);
  const lives = seats.map(() => data.rules.lives);
  const out: SeatStat[] = seats.map((s) => {
    const path = data.heroes.get(s.hero)!.paths.find((p) => p.id === s.path);
    const last = s.builds[s.builds.length - 1]!;
    const all = last.items.reduce((x, p) => x + cost(p.item), 0);
    const commit = path ? last.items.filter((p) => onPath(data.items.get(p.item)!, path)).reduce((x, p) => x + cost(p.item), 0) / Math.max(1, all) : null;
    return { key: `${s.hero}/${s.path}`, w: 0, n: 0, lw: 0, ln: 0, dmg: { weapon: 0, direct: 0, burn: 0, toxin: 0, spikes: 0 }, kept: 0, fights: 0, secs: 0, commit, wins: 0, alive: false, mech: emptyMech(), top: 0, onPath: 0, lateDmg: 0, dealers: 0, attacks: 0 };
  });
  for (const f of fights) {
    const a = seats[f.a]!, b = seats[f.b]!;
    const g = out[f.a]!;
    // the run by the real rules: wins until the lives are gone (fights are listed in round order)
    if (lives[f.a]! > 0) { if (f.rec.w) g.wins++; else lives[f.a]!--; }
    if (a.hero === b.hero) continue;
    g.n++; g.w += f.rec.w;
    if (f.round < late) continue;
    g.ln++; g.lw += f.rec.w;
    SOURCES.forEach((k, i) => { g.dmg[k] += f.rec.dmg[i]!; });
    g.kept += f.rec.kept / f.rec.hp;
    g.fights++; g.secs += f.rec.secs;
    // path profile: which mechanic and which items did the damage
    const build = a.builds[f.round - 1]!;
    const path = data.heroes.get(a.hero)!.paths.find((p) => p.id === a.path);
    let top = 0;
    f.rec.items.forEach((d, k) => {
      if (d <= 0) return;
      const def = data.items.get(build.items[k]!.item)!;
      g.mech[mechanicOf(def)] += d;
      if (path && onPath(def, path)) g.onPath += d;
      top = Math.max(top, d); g.dealers++;
    });
    g.mech.burn += f.rec.dmg[2]!; g.mech.toxin += f.rec.dmg[3]!; g.mech.spikes += f.rec.dmg[4]!;
    g.top += top; g.lateDmg += f.rec.late; g.attacks += f.rec.attacks;
  }
  out.forEach((g, i) => { g.alive = lives[i]! > 0; });
  return out;
}

/** One lobby of the paths measurement. Lobby i of seed s is the same lobby wherever it is played. */
export function measurePathLobby(data: GameData, seed: number, i: number): SeatStat[] {
  const l = playLobby(data, seed * 100003 + i, { path: (s) => pathOfSeat(data, s), immortal: true });
  return seatStats(data, l.seats.map((s) => ({ hero: s.bot.hero, path: s.bot.path, builds: s.builds })), l.fights.map((f) => ({ round: f.round, a: f.a, b: f.b, rec: recOf(f.res) })));
}

/** a share with its standard error and the share in every block of lobbies */
export interface Measured { p: number; se: number; blocks: number[] }
export interface PathGroup {
  key: string;
  all: Measured; late: Measured;
  dmg: Record<Source, number>; kept: number; fights: number; secs: number;
  commit: number[]; wins: number[]; alive: number; seats: number;
  mech: Record<Mechanic, number>; top: number; onPath: number; lateDmg: number; dealers: number; attacks: number;
}

/** how many blocks of lobbies the standard error uses */
export const blockCount = (lobbies: number) => (lobbies >= 30 ? 10 : Math.max(2, Math.floor(lobbies / 3)));

const sd = (xs: readonly number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
/** standard error of the mean of block values */
export const blockSe = (blocks: readonly number[]) => (blocks.length > 1 ? sd(blocks) / Math.sqrt(blocks.length) : NaN);

/**
 * Adds the seats up per "<hero>/<path>" and per "<hero>/*" (all bots of the hero).
 * Blocks: lobbies are cut into blockCount() runs in lobby order, the share is taken per block.
 */
export function aggregatePaths(lobbies: readonly SeatStat[][]): Map<string, PathGroup> {
  const K = blockCount(lobbies.length);
  const groups = new Map<string, PathGroup & { bw: [number, number, number, number][] }>();
  const get = (key: string) => {
    let g = groups.get(key);
    if (!g) { g = { key, all: { p: 0, se: 0, blocks: [] }, late: { p: 0, se: 0, blocks: [] }, dmg: { weapon: 0, direct: 0, burn: 0, toxin: 0, spikes: 0 }, kept: 0, fights: 0, secs: 0, commit: [], wins: [], alive: 0, seats: 0, mech: emptyMech(), top: 0, onPath: 0, lateDmg: 0, dealers: 0, attacks: 0, bw: Array.from({ length: K }, (): [number, number, number, number] => [0, 0, 0, 0]) }; groups.set(key, g); }
    return g;
  };
  lobbies.forEach((seats, i) => {
    const b = Math.min(K - 1, Math.floor((i * K) / lobbies.length));
    for (const s of seats) {
      for (const key of [s.key, `${s.key.split("/")[0]}/*`]) {
        const g = get(key);
        const bw = g.bw[b]!;
        bw[0] += s.w; bw[1] += s.n; bw[2] += s.lw; bw[3] += s.ln;
        for (const k of SOURCES) g.dmg[k] += s.dmg[k];
        g.kept += s.kept; g.fights += s.fights; g.secs += s.secs;
        for (const m of MECHANICS) g.mech[m] += s.mech[m];
        g.top += s.top; g.onPath += s.onPath; g.lateDmg += s.lateDmg; g.dealers += s.dealers; g.attacks += s.attacks;
        if (s.commit !== null) g.commit.push(s.commit);
        g.wins.push(s.wins); g.alive += s.alive ? 1 : 0; g.seats++;
      }
    }
  });
  for (const g of groups.values()) {
    const m = (wi: number, ni: number): Measured => {
      const w = g.bw.reduce((x, v) => x + v[wi]!, 0), n = g.bw.reduce((x, v) => x + v[ni]!, 0);
      const blocks = g.bw.map((v) => (v[ni]! ? v[wi]! / v[ni]! : w / Math.max(1, n)));
      return { p: w / Math.max(1, n), se: blockSe(blocks), blocks };
    };
    g.all = m(0, 1); g.late = m(2, 3);
  }
  return groups;
}

/**
 * Self-test helper: makes the hero's own items of one path stronger by pct percent (weapon damage and every
 * effect number), in this data only. "venn/jungle".
 */
export function boostPath(data: GameData, key: string, pct: number): string[] {
  const [hero, id] = key.split("/");
  const path = data.heroes.get(hero!)?.paths.find((p) => p.id === id);
  if (!path) throw new Error(`no path ${key}`);
  const f = 1 + pct / 100;
  const touched: string[] = [];
  for (const it of data.itemList) {
    if (it.hero !== hero || !onPath(it, path)) continue;
    if (it.damage) it.damage = [Math.round(it.damage[0] * f), Math.round(it.damage[1] * f)];
    for (const e of it.effects) if (e.n !== undefined) e.n = Math.max(e.n + 1, Math.round(e.n * f));
    touched.push(it.id);
  }
  return touched;
}

/** a path's profile from its group: shares of the damage, carry, rhythm */
export interface Profile { mix: Record<Mechanic, number>; main: Mechanic; carry: number; dealers: number; late: number; attacksPerSec: number; pathDamage: number }
export function profileOf(g: PathGroup): Profile {
  const total = MECHANICS.reduce((x, m) => x + g.mech[m], 0) || 1;
  const mix = Object.fromEntries(MECHANICS.map((m) => [m, g.mech[m] / total])) as Record<Mechanic, number>;
  const main = [...MECHANICS].sort((a, b) => mix[b] - mix[a])[0]!;
  const f = Math.max(1, g.fights);
  return { mix, main, carry: g.top / total, dealers: g.dealers / f, late: g.lateDmg / total, attacksPerSec: g.attacks / Math.max(1, g.secs), pathDamage: g.onPath / total };
}
/** how different two profiles are: 1 - cosine similarity of their damage mix (0 = same, 1 = nothing shared) */
export function profileDistance(a: Profile, b: Profile): number {
  let ab = 0, aa = 0, bb = 0;
  for (const m of MECHANICS) { ab += a.mix[m] * b.mix[m]; aa += a.mix[m] ** 2; bb += b.mix[m] ** 2; }
  return aa && bb ? 1 - ab / Math.sqrt(aa * bb) : 0;
}
