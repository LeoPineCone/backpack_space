/**
 * POST /runs/fight (RUN-04, RUN-05, RUN-07, RUN-08, RUN-09, RUN-12): the one request of a round, in the order of
 * docs/backend.md "The fight request, step by step":
 *   1. load the run          2. a stored answer for this round wins     3. run, round and simulation version fit
 *   4. plausibility          5. opponent from the pool                  6. fight seed and next shop seed
 *   7. compute the fight     8. one transaction: ROUND# entry (only if new) + moved-on RUN (only at its version)
 *   9. afterwards: the player's backpack into the pool, the actions into `actions` (a failure is logged only)
 *  10. the answer
 * A transaction that loses against a faster request starts again at step 1 and ends at step 2. So a round has exactly
 * one backpack, one opponent and one answer, whatever is sent afterwards.
 *
 * The server does not merge: the gold, loose items and pins live on the device. It only needs lives and wins.
 */
import type { RunFightRequest, RunFightResponse } from "@backpack-space/api";
import { checkBackpack, compile, leagueOf, simulate, type Build } from "@backpack-space/core";
import { ApiError, type DomainContext } from "./context.js";
import { logEvent } from "./log.js";
import { findOpponent, poolKeys, type PoolEntry } from "./matching.js";
import { loadProfile, playerKey } from "./players.js";
import { checkSimVersion, readRun, roundKey, RUN, toBody, type StoredRun } from "./runs.js";
import { isoDay } from "./config.js";

/** How long recorded actions are kept (RUN-14, proposal): long enough for the planned analysis after some weeks. */
export const ACTIONS_KEEP_DAYS = 180;

export async function runFight(ctx: DomainContext, body: unknown): Promise<RunFightResponse> {
  const req = body as RunFightRequest;
  const playerId = ctx.playerId!;
  const pk = playerKey(playerId);
  const { players, game, random, clock } = ctx.ports;
  const { data, meta } = game;

  for (let attempt = 0; attempt < 5; attempt++) {
    // 1., 2.
    const stored = await players.get(pk, roundKey(req.runId, req.round));
    if (stored) return stored.answer as RunFightResponse;
    // 3.
    checkSimVersion(ctx, req.simVersion);
    const run = await readRun(ctx, playerId);
    if (!run || run.runId !== req.runId || run.round !== req.round || run.over) throw new ApiError("run_conflict");
    // 4.
    const build = req.backpack as Build;
    const plausible = build.hero === run.hero ? checkBackpack(data, build, run.round) : ({ ok: false, reason: "other_hero" } as const);
    if (!plausible.ok) {
      logEvent(ctx, "plausibility_rejected", { runId: run.runId, round: run.round, reason: plausible.reason });
      throw new ApiError("invalid_backpack");
    }
    // 5.
    const profile = await loadProfile(ctx, playerId);
    if (!profile) throw new Error("signed-in player without profile");
    const league = leagueOf(meta, profile.profile.season.points);
    const match = await findOpponent(ctx, {
      playerId,
      round: run.round,
      lives: run.lives,
      league,
      met: run.met,
      newPlayer: profile.profile.runs < meta.matching.easyRuns,
    });
    if (!match) throw new Error(`no opponent for round ${run.round} with ${run.lives} lives`);
    const opp = match.entry;
    // 6.
    const fightSeed = random.uint32();
    const shopSeed = random.uint32();
    // 7. (the opponent was valid under its data major; a minor change can still make it fail to compile)
    const res = simulate(compile(build, data), compile(opp.build, data), data.rules, fightSeed);
    const result = res.winner === 0 ? "win" : res.winner === 1 ? "loss" : "draw";
    const won = result === "win";
    const lives = won ? run.lives : run.lives - 1;
    const wins = won ? run.wins + 1 : run.wins;
    const over = lives <= 0 || run.round >= data.rules.rounds;
    const next: StoredRun = {
      ...run,
      lives,
      wins,
      over,
      round: over ? run.round : run.round + 1,
      shopSeed: over ? run.shopSeed : shopSeed,
      met: [...run.met, opp.owner],
      version: run.version + 1,
    };
    const answer: RunFightResponse = {
      opponent: { backpack: opp.build, name: opp.name, patch: opp.patch },
      fightSeed,
      result,
      run: toBody(next),
    };
    // 8.
    const now = clock.now();
    const committed = await players.transact([
      {
        put: { pk, sk: roundKey(run.runId, run.round), backpack: build, opponent: opp.id, owner: opp.owner, fightSeed, result, answer, at: now },
        ifNotExists: true,
      },
      { put: { pk, sk: RUN, ...next }, ifVersion: run.version },
    ]);
    if (!committed) continue;
    logEvent(ctx, "fight", { runId: run.runId, round: run.round, result, simVersion: req.simVersion });
    // 9.
    await afterCommit(ctx, {
      playerId,
      run,
      build,
      league,
      name: profile.profile.name,
      patch: profile.profile.equipped.patch,
      actions: req.actions,
      shopSeed: run.shopSeed,
      now,
    });
    // 10.
    return answer;
  }
  throw new Error("fight request kept colliding");
}

/** Pool and actions are written after the commit; the fight counts even when they fail (the failure is logged). */
async function afterCommit(
  ctx: DomainContext,
  o: { playerId: string; run: StoredRun; build: Build; league: number; name: string; patch: string | null; actions: string[]; shopSeed: number; now: number },
): Promise<void> {
  const { data } = ctx.ports.game;
  const id = `${o.run.runId}-${String(o.run.round).padStart(2, "0")}`;
  const entry: PoolEntry = {
    ...poolKeys({ origin: "player", round: o.run.round, lives: o.run.lives, league: o.league, dataVersion: data.dataVersion, id }, ctx.ports.random.uint32()),
    id,
    owner: o.playerId,
    playerId: o.playerId,
    origin: "player",
    build: o.build,
    name: o.name,
    patch: o.patch,
    league: o.league,
    dataVersion: data.dataVersion,
    at: isoDay(o.now),
    ...(ctx.appVersion ? { appVersion: ctx.appVersion } : {}),
  };
  const actions = {
    pk: `RUN#${o.run.runId}`,
    sk: `R${String(o.run.round).padStart(2, "0")}`,
    playerId: o.playerId,
    actions: o.actions,
    shopSeed: o.shopSeed,
    backpack: o.build,
    simVersion: data.simVersion,
    expiresAt: Math.floor(o.now / 1000) + ACTIONS_KEEP_DAYS * 86400,
  };
  const results = await Promise.allSettled([ctx.ports.backpacks.put(entry), ctx.ports.actions.put(actions)]);
  for (const [i, r] of results.entries())
    if (r.status === "rejected")
      logEvent(ctx, "error", {
        message: `${i === 0 ? "pool" : "actions"} write after fight: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 150)}`,
      });
}
