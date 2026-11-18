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
import { ApiError, type DomainContext } from "./context.js";
import { logEvent, type EventFields } from "./log.js";
import { loadProfile, playerKey, profileWrites } from "./players.js";

export const RUN = "RUN";
export const doneKey = (runId: string) => `DONE#${runId}`;

/** The RUN item. `version` counts every write; a write only succeeds on the version it read. */
export interface StoredRun {
  runId: string;
  hero: string;
  round: number;
  lives: number;
  wins: number;
  shopSeed: number;
  simVersion: string;
  /** milliseconds since 1970 */
  startedAt: number;
  version: number;
}

const toBody = (r: StoredRun): RunBody => ({ runId: r.runId, hero: r.hero, round: r.round, lives: r.lives, wins: r.wins, shopSeed: r.shopSeed });

export async function readRun(ctx: DomainContext, playerId: string): Promise<StoredRun | null> {
  return (await ctx.ports.players.get(playerKey(playerId), RUN)) as unknown as StoredRun | null;
}

/** App and server must compute with the same core and data (CORE-03). */
export function checkSimVersion(ctx: DomainContext, simVersion: string): void {
  if (simVersion !== ctx.ports.game.data.simVersion) throw new ApiError("update_required");
}

/** GET /runs/current: the open run, or null. */
export async function runCurrent(ctx: DomainContext): Promise<RunCurrentResponse> {
  const run = await readRun(ctx, ctx.playerId!);
  return { run: run ? toBody(run) : null };
}

/** POST /runs: starts a run with a shop seed for round 1; while one is open, that one comes back unchanged. */
export async function runStart(ctx: DomainContext, body: unknown): Promise<RunStartResponse> {
  const { hero, simVersion } = body as RunStartRequest;
  const playerId = ctx.playerId!;
  checkSimVersion(ctx, simVersion);
  const open = await readRun(ctx, playerId);
  if (open) return { run: toBody(open) };

  const { data, meta } = ctx.ports.game;
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
    simVersion,
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

const EVENT_REASON: Record<FinishReason, EventFields["run_finished"]["reason"]> = { gave_up: "gave_up", no_local_copy: "abandoned" };

/**
 * POST /runs/finish: ends the open run and books the standing the server knows, once. The profile write (on its
 * version), the DONE# entry (only if new) and removing RUN (only at the version that was booked) are one
 * transaction; a repeat gets the stored answer.
 */
export async function runFinish(ctx: DomainContext, body: unknown): Promise<RunFinishResponse> {
  const { runId, reason } = body as RunFinishRequest;
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

    const summary = { hero: run.hero, wins: run.wins, livesLeft: run.lives, roundsPlayed: run.round - 1 };
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
      { put: { pk, sk: doneKey(runId), reason, answer, at: now } satisfies Item, ifNotExists: true },
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
