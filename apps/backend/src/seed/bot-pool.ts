/**
 * The bot backpacks of the opponent pool (MM-03, MM-04, MM-06, DEV-06; docs/matchmaking.md "Bot backpacks").
 *
 * Invented bot players (name, league group, league, patch, skill) play whole runs against each other with the core's
 * bots. Every round of every run gives one backpack, filed under the round and the lives left before the fight. More
 * runs are played than needed, then `perBucket` backpacks are chosen per bucket. Standings that runs rarely reach
 * (all wins late in a run) borrow builds of the same round from the nearest standing.
 *
 * Two tiers: "bot" for everybody, and "easy" (bots that buy and lay out at random) for the first runs of a new
 * player. Pure: no clock, no Node APIs; randomness only from the seed.
 */
import {
  botBuild,
  botMerge,
  botShop,
  botSpecial,
  compile,
  leagueGroup,
  newBot,
  patchId,
  playerName,
  Rng,
  simulate,
  type Bot,
  type BotOpts,
  type Build,
  type GameData,
  type Meta,
} from "@backpack-space/core";
import { z } from "zod";
import { bucketKey, dataMajor, poolKeys, type PoolEntry } from "../domain/matching.js";
import type { BackpackPool } from "../ports/index.js";

export const BotNames = z
  .object({ $comment: z.string().optional(), first: z.array(z.string().min(1)).min(1), second: z.array(z.string().min(1)).min(1) })
  .strict();
export type BotNames = z.infer<typeof BotNames>;

export type Tier = "bot" | "easy";
export type Skill = "easy" | "normal" | "strong";

export interface BotPlayer {
  id: string;
  name: string;
  /** league group (0 = lowest) and a league inside it */
  group: number;
  league: number;
  /** the equipped league patch of the season */
  patch: string;
  skill: Skill;
}

export interface SeedEntry {
  tier: Tier;
  round: number;
  /** lives left before the fight of this round */
  lives: number;
  owner: BotPlayer;
  build: Build;
  /** filed under a standing its run did not have (a short bucket borrowed it from the nearest one) */
  borrowed?: true;
}

export interface SeedOptions {
  seed: number;
  /** backpacks per round and standing for the "bot" tier (launch: 50) */
  perBucket: number;
  /** backpacks per bucket of the "easy" tier (default: a fifth of perBucket, at least 1) */
  perEasyBucket?: number;
  /** bot players per league group (default 50) */
  playersPerGroup?: number;
  /** the season whose league patches the bots wear */
  season: number;
  /** measured item ratings for the bots (data/sim/ratings.json) */
  ratings?: Record<string, number>;
  /** stop after this many lobbies per tier even if buckets are short (they then borrow) */
  maxLobbies?: number;
}

const SKILL_OPTS: Record<Skill, (ratings: Record<string, number>) => BotOpts> = {
  strong: (ratings) => ({ ratings }),
  normal: (ratings) => ({ ratings, arrange: { moves: 80, tries: 2 } }),
  easy: () => ({ randomBuys: true, layout: "random", noCraft: true }),
};

/** Bot players of every league group; the lowest group plays a little weaker. */
export function makeBotPlayers(meta: Meta, names: BotNames, perGroup: number, season: number, rng: Rng): BotPlayer[] {
  const out: BotPlayer[] = [];
  const used = new Set<string>();
  const groups = meta.leagues.groups.length;
  for (let group = 0; group < groups; group++) {
    const { from, to } = leagueGroup(meta, from0(meta, group));
    for (let i = 0; i < perGroup; i++) {
      const league = from + rng.int(to - from + 1);
      out.push({
        id: `bot-${group}-${String(i).padStart(3, "0")}`,
        name: uniqueName(names, rng, used),
        group,
        league,
        patch: patchId(season, meta.leagues.ids[league]!),
        skill: group === 0 && i % 2 === 0 ? "normal" : "strong",
      });
    }
  }
  return out;
}
/** The easy bots: same names and patches as the lowest group. */
function easyPlayers(meta: Meta, names: BotNames, count: number, season: number, rng: Rng, used: Set<string>): BotPlayer[] {
  const { from, to } = leagueGroup(meta, 0);
  return Array.from({ length: count }, (_, i) => {
    const league = from + rng.int(to - from + 1);
    return {
      id: `bot-easy-${String(i).padStart(3, "0")}`,
      name: uniqueName(names, rng, used),
      group: 0,
      league,
      patch: patchId(season, meta.leagues.ids[league]!),
      skill: "easy" as const,
    };
  });
}

const from0 = (meta: Meta, group: number) => meta.leagues.groups.slice(0, group).reduce((a, b) => a + b, 0);

function uniqueName(names: BotNames, rng: Rng, used: Set<string>): string {
  for (let tries = 0; tries < 200; tries++) {
    const raw = `${rng.pick(names.first)} ${rng.pick(names.second)}${tries >= 50 ? ` ${2 + rng.int(98)}` : ""}`;
    const n = playerName(raw);
    if (n && !used.has(n)) {
      used.add(n);
      return n;
    }
  }
  throw new Error("bot names: not enough distinct names");
}

/** One lobby of 16 bot players playing a whole run each; every round of every run gives an entry. */
function playLobby(data: GameData, tier: Tier, players: BotPlayer[], rng: Rng, ratings: Record<string, number>): SeedEntry[] {
  interface Seat {
    p: BotPlayer;
    bot: Bot;
    opts: BotOpts;
    lives: number;
    last: Build | null;
    out: boolean;
  }
  const seats: Seat[] = players.map((p, i) => ({
    p,
    bot: newBot(data, data.heroList[i % data.heroList.length]!.id, rng),
    opts: SKILL_OPTS[p.skill](ratings),
    lives: data.rules.lives,
    last: null,
    out: false,
  }));
  const entries: SeedEntry[] = [];
  for (let round = 1; round <= data.rules.rounds; round++) {
    const active = seats.filter((s) => !s.out);
    if (active.length === 0) break;
    for (const s of active) {
      botShop(data, s.bot, round, rng, s.opts);
      s.last = botBuild(s.bot, round);
      entries.push({ tier, round, lives: s.lives, owner: s.p, build: s.last });
    }
    // opponents: the other active bots, or the last builds of bots already out (as in async play)
    const pool = active.length >= 2 ? active : seats.filter((s) => s.last);
    for (const s of active) {
      const others = pool.filter((o) => o !== s);
      if (others.length === 0) break;
      const o = rng.pick(others);
      const res = simulate(compile(s.last!, data), compile(o.last!, data), data.rules, rng.int(2 ** 31));
      if (res.winner !== 0) s.lives--;
      if (s.lives <= 0) s.out = true;
      botMerge(data, s.bot, s.opts);
      botSpecial(data, s.bot, round, rng, s.opts);
    }
  }
  return entries;
}

/** Every bucket of a tier: round 1..rounds, lives from the lowest possible in the round up to full. */
export function buckets(data: GameData): { round: number; lives: number }[] {
  const out: { round: number; lives: number }[] = [];
  for (let round = 1; round <= data.rules.rounds; round++)
    for (let lives = Math.max(1, data.rules.lives - (round - 1)); lives <= data.rules.lives; lives++) out.push({ round, lives });
  return out;
}

export function seedPool(data: GameData, meta: Meta, names: BotNames, o: SeedOptions): { players: BotPlayer[]; entries: SeedEntry[] } {
  const rng = new Rng(o.seed);
  const ratings = o.ratings ?? {};
  const players = makeBotPlayers(meta, names, o.playersPerGroup ?? 50, o.season, rng);
  const used = new Set(players.map((p) => p.name));
  const easy = easyPlayers(meta, names, 16, o.season, rng, used);
  const perEasy = o.perEasyBucket ?? Math.max(1, Math.ceil(o.perBucket / 5));
  const entries: SeedEntry[] = [
    ...fillTier(data, "bot", players, o.perBucket, rng, ratings, o.maxLobbies),
    ...fillTier(data, "easy", easy, perEasy, rng, ratings, o.maxLobbies),
  ];
  return { players: [...players, ...easy], entries };
}

function fillTier(data: GameData, tier: Tier, players: BotPlayer[], per: number, rng: Rng, ratings: Record<string, number>, maxLobbies?: number): SeedEntry[] {
  const all = buckets(data);
  const key = (round: number, lives: number) => `${round}/${lives}`;
  const found = new Map<string, SeedEntry[]>(all.map((b) => [key(b.round, b.lives), []]));
  // a bucket counts as full when it has enough from distinct owners
  const full = () => all.every((b) => new Set(found.get(key(b.round, b.lives))!.map((e) => e.owner.id)).size >= per);
  const cap = maxLobbies ?? Math.max(8, per * 2);
  for (let n = 0; n < cap && !full(); n++) {
    const seated = rng.shuffle([...players]).slice(0, 16);
    for (const e of playLobby(data, tier, seated, rng, ratings)) found.get(key(e.round, e.lives))!.push(e);
  }
  const out: SeedEntry[] = [];
  for (const b of all) {
    let picked = rng.shuffle([...found.get(key(b.round, b.lives))!]).slice(0, per);
    // short bucket: borrow builds of the same round from the nearest standing, filed under this one
    for (let d = 1; picked.length < per && d < data.rules.lives; d++)
      for (const l of [b.lives + d, b.lives - d]) {
        const near = found.get(key(b.round, l));
        if (!near) continue;
        picked = [
          ...picked,
          ...rng
            .shuffle([...near])
            .slice(0, per - picked.length)
            .map((e) => ({ ...e, lives: b.lives, borrowed: true as const })),
        ];
      }
    out.push(...picked);
  }
  return out;
}

/**
 * Replaces the bot backpacks of the current data major in the pool: empties every bot and easy bucket, then writes
 * the new entries. Player backpacks are not touched. Returns how many were removed and written.
 */
export async function replaceBotPool(
  pool: BackpackPool,
  data: GameData,
  entries: SeedEntry[],
  o: { today: string; seed: number },
): Promise<{ removed: number; written: number }> {
  const rng = new Rng(o.seed);
  const major = dataMajor(data.dataVersion);
  let removed = 0;
  for (const tier of ["bot", "easy"] as const)
    for (const b of buckets(data)) {
      const pk = bucketKey(tier, major, b.round, b.lives);
      for (;;) {
        const old = await pool.range(pk, "G", "G~", 100);
        if (old.length === 0) break;
        await Promise.all(old.map((i) => pool.remove(i.pk, i.sk)));
        removed += old.length;
      }
    }
  const items: PoolEntry[] = entries.map((e, i) => {
    const id = `${e.owner.id}-${o.seed}-${i}`;
    return {
      ...poolKeys({ origin: e.tier, round: e.round, lives: e.lives, league: e.owner.league, dataVersion: data.dataVersion, id }, rng.int(2 ** 32)),
      id,
      owner: e.owner.id,
      origin: e.tier,
      build: e.build,
      name: e.owner.name,
      patch: e.owner.patch,
      league: e.owner.league,
      dataVersion: data.dataVersion,
      at: o.today,
    };
  });
  for (let i = 0; i < items.length; i += 25) await Promise.all(items.slice(i, i + 25).map((it) => pool.put(it)));
  return { removed, written: items.length };
}
