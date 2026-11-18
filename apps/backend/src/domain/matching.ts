/**
 * Matching and the backpack pool (MM-01, MM-02, MM-05, MM-07; docs/matchmaking.md, docs/backend.md table `backpacks`).
 *
 *   pk  <origin>#<dataMajor>#R<round>#L<lives>   one partition per bucket: origin (bot or player), data major,
 *                                                round and run standing (lives left before the fight)
 *   sk  G<league>#<random>#<id>                  the league first, then a random value: a random pick inside a
 *                                                league range is one small read from a random starting point
 *
 * The search runs in steps, each relaxing one criterion; the round is never relaxed:
 *   1. same lives, same league
 *   2. same lives, league +-1
 *   3. lives +-1, league +-1
 *   4. lives +-1, any league
 *   5. any lives, any league
 * Bot players belong to a league group, so for bot backpacks "same league" and "league +-1" mean the player's group.
 * Always: never the player's own backpack, nobody twice in a run, only backpacks valid under the player's data version.
 */
import { canMatch, leagueGroup, parseDataVersion, type Build } from "@backpack-space/core";
import type { Item } from "../ports/index.js";
import type { DomainContext } from "./context.js";

export type PoolOrigin = "bot" | "player";

/** One stored backpack of the pool. */
export interface PoolEntry extends Item {
  /** unique id of this backpack */
  id: string;
  /** whose backpack: the player id, or the bot player's id; "nobody twice in a run" goes by this */
  owner: string;
  origin: PoolOrigin;
  build: Build;
  /** shown in the fight */
  name: string;
  patch: string | null;
  league: number;
  /** the data version the backpack was stored under (major.minor) */
  dataVersion: string;
  /** "YYYY-MM-DD" */
  at: string;
  /** only for player backpacks: the second index finds all backpacks of a player */
  playerId?: string;
  /** bots for the first runs of a new player (MM-06) */
  easy?: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, "0");

export function dataMajor(dataVersion: string): number {
  const v = parseDataVersion(dataVersion);
  if (!v) throw new Error(`bad data version ${dataVersion}`);
  return v.major;
}
export const bucketKey = (origin: PoolOrigin, major: number, round: number, lives: number) => `${origin}#${major}#R${pad2(round)}#L${lives}`;
export const poolSortKey = (league: number, random: number, id: string) => `G${pad2(league)}#${hex8(random)}#${id}`;

/** The keys of a new pool entry: its bucket, and a sort key with a fresh random value. */
export function poolKeys(ctx: DomainContext, e: { origin: PoolOrigin; round: number; lives: number; league: number; dataVersion: string; id: string }) {
  return { pk: bucketKey(e.origin, dataMajor(e.dataVersion), e.round, e.lives), sk: poolSortKey(e.league, ctx.ports.random.uint32(), e.id) };
}

export interface MatchRequest {
  playerId: string;
  round: number;
  /** lives left before this fight (the run standing) */
  lives: number;
  /** the player's league (0 = lowest) */
  league: number;
  /** owners already met in this run */
  met: readonly string[];
}
export interface Match {
  entry: PoolEntry;
  /** the step of the matching rules that found it (1 to 5) */
  step: number;
}

/** Entries read per range read; a bucket holds about 50 bot backpacks per league group. */
const READ = 20;

export async function findOpponent(ctx: DomainContext, req: MatchRequest): Promise<Match | null> {
  const { data, meta } = ctx.ports.game;
  const major = dataMajor(data.dataVersion);
  const maxLives = data.rules.lives;
  const lowest = Math.max(1, maxLives - (req.round - 1));
  const lives = (d: number | null) => {
    const out: number[] = [];
    for (let l = lowest; l <= maxLives; l++) if (d === null || Math.abs(l - req.lives) <= d) out.push(l);
    return out;
  };
  const top = meta.leagues.ids.length - 1;
  const group = leagueGroup(meta, req.league);
  const leagues = (origin: PoolOrigin, d: number | null): [number, number] => {
    if (d === null) return [0, top];
    if (origin === "bot") return [group.from, group.to];
    return [Math.max(0, req.league - d), Math.min(top, req.league + d)];
  };
  const steps: [number | null, number | null][] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, null],
    [null, null],
  ];
  const origins: PoolOrigin[] = (ctx.settings.matchingPhase ?? 1) === 1 ? ["bot"] : ["player", "bot"];
  const ok = (e: PoolEntry) =>
    e.owner !== req.playerId && e.playerId !== req.playerId && !req.met.includes(e.owner) && canMatch(e.dataVersion, data.dataVersion);
  const tried = new Set<string>();

  for (const [n, [dLives, dLeague]] of steps.entries()) {
    for (const origin of origins) {
      const [lo, hi] = leagues(origin, dLeague);
      for (const l of shuffle(ctx, lives(dLives))) {
        const pk = bucketKey(origin, major, req.round, l);
        const key = `${pk}|${lo}|${hi}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const entry = await pick(ctx, pk, lo, hi, ok);
        if (entry) return { entry, step: n + 1 };
      }
    }
  }
  return null;
}

/** A random acceptable entry of a league range: read from a random point to the end, then from the start up to it. */
async function pick(ctx: DomainContext, pk: string, lo: number, hi: number, ok: (e: PoolEntry) => boolean): Promise<PoolEntry | null> {
  const { backpacks, random } = ctx.ports;
  const league = lo + (random.uint32() % (hi - lo + 1));
  const start = `G${pad2(league)}#${hex8(random.uint32())}`;
  const first = `G${pad2(lo)}#`;
  const last = `G${pad2(hi)}#~`;
  const after = (await backpacks.range(pk, start, last, READ)) as PoolEntry[];
  const found = after.find(ok);
  if (found) return found;
  const before = (await backpacks.range(pk, first, start, READ)) as PoolEntry[];
  return before.find(ok) ?? null;
}

function shuffle<T>(ctx: DomainContext, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = ctx.ports.random.uint32() % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
