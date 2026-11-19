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
import { bookRun, questData, questRule, questsOn, rewardTrack, type Meta, type Reward } from "@backpack-space/core";
import type { Item, Write } from "../ports/index.js";
import { ApiError, type DomainContext, type Game } from "./context.js";
import { dataMajor } from "./matching.js";
import { logEvent, type EventFields } from "./log.js";
import { loadProfile, playerKey, profileWrites, type Origin } from "./players.js";
import { isoDay } from "./config.js";

export const RUN = "RUN";
export const doneKey = (runId: string) => `DONE#${runId}`;
export const roundKey = (runId: string, round: number) => `ROUND#${runId}#${String(round).padStart(2, "0")}`;
/** P#<playerId> / QUEST#<questId>: the player finished a run of this quest (one per quest and period, META-06) */
export const questKey = (questId: string) => `QUEST#${questId}`;
/** how long a played quest is remembered: longer than its period (a week at most) */
export const QUESTS_KEEP_DAYS = 14;

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
  /** a quest run: the quest id (its special rule changes the rules of the run) */
  quest?: string;
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
  ...(r.quest ? { quest: r.quest } : {}),
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

/** The build a run plays with: the one the request names, with the rules of its quest, if it is a quest run (CORE-07). */
export function runGame(ctx: DomainContext, simVersion: string, quest: string | undefined): Game {
  const game = gameFor(ctx, simVersion);
  if (!quest) return game;
  const rule = questRule(game.meta.quests, quest);
  if (!rule) throw new ApiError("quest_unavailable");
  return { ...game, data: questData(game.data, rule) };
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
  const { hero, simVersion, quest } = body as RunStartRequest;
  const playerId = ctx.playerId!;
  const game = runGame(ctx, simVersion, quest);
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
  // a quest can be started on the days it is open, once per player (META-06)
  if (quest) {
    const open = questsOn(meta.quests, isoDay(ctx.ports.clock.now())).some((q) => q.id === quest);
    if (!open || (await ctx.ports.players.get(playerKey(playerId), questKey(quest)))) throw new ApiError("quest_unavailable");
  }

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
    ...(quest ? { quest } : {}),
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

/** How long `ROUND#` and `DONE#` entries are kept: they only serve repeated requests of a run (decided 2026-11-18); DynamoDB removes them after. */
export const ROUNDS_KEEP_DAYS = 7;
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

/** The origin of each thing a booking unlocked, by the track its reward came from. */
function originOf(meta: Meta, rewards: Reward[]): (id: string) => Origin {
  const by = new Map<string, Origin>();
  for (const r of rewards) if (!("credits" in r)) by.set("cosmetic" in r ? r.cosmetic : r.hero, rewardTrack(meta, r));
  return (id) => by.get(id) ?? "pass";
}

async function finishRun(ctx: DomainContext, runId: string, asked: EndReason): Promise<RunFinishResponse> {
  const playerId = ctx.playerId!;
  const pk = playerKey(playerId);
  const { players, game, clock } = ctx.ports;
  for (let attempt = 0; attempt < 5; attempt++) {
    const done = await players.get(pk, doneKey(runId));
    if (done) return done.answer as RunFinishResponse;
    const run = await readRun(ctx, playerId);
    if (!run || run.runId !== runId) {
      // a request at the same time may have booked it between the two reads: its answer is the answer
      const booked = await players.get(pk, doneKey(runId));
      if (booked) return booked.answer as RunFinishResponse;
      throw new ApiError("run_conflict");
    }
    const stored = await loadProfile(ctx, playerId);
    if (!stored) throw new Error("signed-in player without profile");
    // the app may only call a run finished that is over; otherwise it gave up
    const reason: EndReason = asked === "finished" && !run.over ? "gave_up" : asked;

    // completed: every round played with a life left; a run given up or lost is not
    const summary = {
      hero: run.hero,
      wins: run.wins,
      livesLeft: run.lives,
      roundsPlayed: run.over ? run.round : run.round - 1,
      completed: run.over && run.lives > 0,
    };
    // the core's profile carries Credits; on the server they live at RevenueCat (earned Credits: STORE issues)
    // a quest run books no league points (its special rule makes it unlike a normal run)
    const booking = bookRun(game.meta, { ...stored.profile, credits: 0 }, summary, { quest: !!run.quest });
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
      ...(run.quest ? { quest: run.quest } : {}),
    };
    const answer: RunFinishResponse = { result, profile };
    const now = clock.now();
    const writes: Write[] = [
      // each unlocked thing is owned with the track it came from (hero level, planet track, pass)
      ...profileWrites(playerId, profile, stored, now, originOf(game.meta, booking.rewards), stored.profile),
      { put: { pk, sk: doneKey(runId), reason, answer, at: now, expiresAt: expiresIn(now, ROUNDS_KEEP_DAYS) } satisfies Item, ifNotExists: true },
      { delete: { pk, sk: RUN }, ifVersion: run.version },
      // the quest counts as played; a second start of it is refused
      ...(run.quest ? [{ put: { pk, sk: questKey(run.quest), runId, at: now, expiresAt: expiresIn(now, QUESTS_KEEP_DAYS) } }] : []),
    ];
    if (await players.transact(writes)) {
      logEvent(ctx, "run_finished", { runId, reason: EVENT_REASON[reason], wins: run.wins, livesLeft: run.lives });
      return answer;
    }
    // another request changed the profile or the run in between: read again
  }
  throw new Error("run finish kept colliding");
}
