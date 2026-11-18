/**
 * The run on the server (RUN-01, RUN-02, RUN-03, RUN-11; docs/backend.md, docs/client-server.md):
 *   P#<playerId> / RUN           the open run: id, hero, round, lives, wins, shop seed of the round, version
 *   P#<playerId> / DONE#<runId>  the booked end of a run with the complete answer that was sent
 *
 * At most one run is open per player. The server hands out the shop seed of every round; the app builds the shop with
 * the core. The gold, loose items and pinned offers live only on the device, so a run cannot move to another device:
 * an app without a local copy reports that, and the run is ended and booked with the standing the server knows.
 */
import type {
  FinishReason,
  RunBody,
  RunCurrentResponse,
  RunFinishRequest,
  RunFinishResponse,
  RunResult,
  RunStartRequest,
  RunStartResponse,
} from "@backpack-space/api";
import { bookRun } from "@backpack-space/core";
import type { Item, Write } from "../ports/index.js";
import { ApiError, type DomainContext, type Game } from "./context.js";
import { dataMajor } from "./matching.js";
import { logEvent, type EventFields } from "./log.js";
import { loadProfile, playerKey, profileWrites } from "./players.js";

export const RUN = "RUN";
export const doneKey = (runId: string) => `DONE#${runId}`;
export const roundKey = (runId: string, round: number) => `ROUND#${runId}#${String(round).padStart(2, "0")}`;

/** The RUN item. `version` counts every write; a write only succeeds on the version it read. */
export interface StoredRun {
  runId: string;
  hero: string;
  round: number;
  lives: number;
  wins: number;
  shopSeed: number;
  /** the last round is fought or the lives are gone */
  over: boolean;
  /** owners of the opponents met so far (nobody twice in a run) */
  met: string[];
  simVersion: string;
  /** the data version the run started with (missing on runs from before it was stored: counts as current) */
  dataVersion?: string;
  /** milliseconds since 1970 */
  startedAt: number;
  version: number;
}

export const toBody = (r: StoredRun): RunBody => ({
  runId: r.runId,
  hero: r.hero,
  round: r.round,
  lives: r.lives,
  wins: r.wins,
  shopSeed: r.shopSeed,
  over: r.over,
});

export async function readRun(ctx: DomainContext, playerId: string): Promise<StoredRun | null> {
  return (await ctx.ports.players.get(playerKey(playerId), RUN)) as unknown as StoredRun | null;
}

/**
 * The simulation build the request names (CORE-03): the current one, or during a rollout the previous one. App and
 * server must compute with the same core and data, so any other version gets `update_required`.
 */
export function gameFor(ctx: DomainContext, simVersion: string): Game {
  const { game, previousGame } = ctx.ports;
  if (simVersion === game.data.simVersion) return game;
  if (previousGame && simVersion === previousGame.data.simVersion) return previousGame;
  throw new ApiError("update_required");
}

/**
 * RUN-13: a run is not tied to the version it started with; every fight is computed with the build the request
 * names. Only when the data's major version changed (an item removed or reshaped) the stored standing no longer
 * fits, and the run is ended and booked as it stands.
 */
export function majorChanged(run: StoredRun, game: Game): boolean {
  return dataMajor(run.dataVersion ?? game.data.dataVersion) !== dataMajor(game.data.dataVersion);
}

/** GET /runs/current: the open run, or null. A run that is over, or whose data major is gone, is booked now. */
export async function runCurrent(ctx: DomainContext): Promise<RunCurrentResponse> {
  const run = await readRun(ctx, ctx.playerId!);
  if (run?.over) return { run: null, finished: await finishRun(ctx, run.runId, "finished") };
  if (run && majorChanged(run, ctx.ports.game)) return { run: null, finished: await finishRun(ctx, run.runId, "data_major") };
  return { run: run ? toBody(run) : null };
}

/** POST /runs: starts a run with a shop seed for round 1; while one is open, that one comes back unchanged. */
export async function runStart(ctx: DomainContext, body: unknown): Promise<RunStartResponse> {
  const { hero, simVersion } = body as RunStartRequest;
  const playerId = ctx.playerId!;
  const game = gameFor(ctx, simVersion);
  const open = await readRun(ctx, playerId);
  if (open && !open.over && !majorChanged(open, game)) return { run: toBody(open) };
  // an open run that is over or of an old data major is booked first, then the new run starts
  if (open) await finishRun(ctx, open.runId, open.over ? "finished" : "data_major");

  const { data } = game;
  const { meta } = ctx.ports.game;
  const stored = await loadProfile(ctx, playerId);
  if (!stored) throw new Error("signed-in player without profile");
  const playable = data.heroes.has(hero) && (meta.startHeroes.includes(hero) || stored.profile.heroes.includes(hero));
  if (!playable) throw new ApiError("bad_request");

  const { random, clock, players } = ctx.ports;
  const run: StoredRun = {
    runId: random.id(),
    hero,
    round: 1,
    lives: data.rules.lives,
    wins: 0,
    shopSeed: random.uint32(),
    over: false,
    met: [],
    simVersion,
    dataVersion: data.dataVersion,
    startedAt: clock.now(),
    version: 1,
  };
  if (!(await players.transact([{ put: { pk: playerKey(playerId), sk: RUN, ...run }, ifNotExists: true }]))) {
    // two starts at the same time: the other one won, hand out its run
    const winner = await readRun(ctx, playerId);
    if (!winner) throw new Error("open run missing after a failed start");
    return { run: toBody(winner) };
  }
  logEvent(ctx, "run_started", { runId: run.runId, hero, simVersion });
  return { run: toBody(run) };
}

/** Why a run ends, as the app names it, or "data_major": the server ended it after a data major change (RUN-13). */
type EndReason = FinishReason | "data_major";
const EVENT_REASON: Record<EndReason, EventFields["run_finished"]["reason"]> = {
  finished: "finished",
  gave_up: "gave_up",
  no_local_copy: "abandoned",
  data_major: "data_major",
};

/** How long `ROUND#` and `DONE#` entries are kept for repeats (proposal in docs/backend.md); DynamoDB removes them after. */
export const ROUNDS_KEEP_DAYS = 30;
export const expiresIn = (nowMs: number, days: number) => Math.floor(nowMs / 1000) + days * 86400;

/**
 * POST /runs/finish: ends the open run and books the standing the server knows, once. The profile write (on its
 * version), the DONE# entry (only if new) and removing RUN (only at the version that was booked) are one
 * transaction; a repeat gets the stored answer.
 */
export async function runFinish(ctx: DomainContext, body: unknown): Promise<RunFinishResponse> {
  const { runId, reason } = body as RunFinishRequest;
  return finishRun(ctx, runId, reason);
}

async function finishRun(ctx: DomainContext, runId: string, asked: EndReason): Promise<RunFinishResponse> {
  const playerId = ctx.playerId!;
  const pk = playerKey(playerId);
  const { players, game, clock } = ctx.ports;
  for (let attempt = 0; attempt < 5; attempt++) {
    const done = await players.get(pk, doneKey(runId));
    if (done) return done.answer as RunFinishResponse;
    const run = await readRun(ctx, playerId);
    if (!run || run.runId !== runId) throw new ApiError("run_conflict");
    const stored = await loadProfile(ctx, playerId);
    if (!stored) throw new Error("signed-in player without profile");
    // the app may only call a run finished that is over; otherwise it gave up
    const reason: EndReason = asked === "finished" && !run.over ? "gave_up" : asked;

    const summary = { hero: run.hero, wins: run.wins, livesLeft: run.lives, roundsPlayed: run.over ? run.round : run.round - 1 };
    // the core's profile carries Credits; on the server they live at RevenueCat (earned Credits: STORE issues)
    const booking = bookRun(game.meta, { ...stored.profile, credits: 0 }, summary);
    const { credits: _credits, ...profile } = booking.profile;
    const result: RunResult = {
      runId,
      ...summary,
      galaxies: booking.galaxies,
      xp: booking.xp,
      level: booking.level,
      points: booking.points,
      league: booking.league,
      pass: booking.pass,
      rewards: booking.rewards,
    };
    const answer: RunFinishResponse = { result, profile };
    const now = clock.now();
    const writes: Write[] = [
      ...profileWrites(playerId, profile, stored, now, "run", stored.profile),
      { put: { pk, sk: doneKey(runId), reason, answer, at: now, expiresAt: expiresIn(now, ROUNDS_KEEP_DAYS) } satisfies Item, ifNotExists: true },
      { delete: { pk, sk: RUN }, ifVersion: run.version },
    ];
    if (await players.transact(writes)) {
      logEvent(ctx, "run_finished", { runId, reason: EVENT_REASON[reason], wins: run.wins, livesLeft: run.lives });
      return answer;
    }
    // another request changed the profile or the run in between: read again
  }
  throw new Error("run finish kept colliding");
}
