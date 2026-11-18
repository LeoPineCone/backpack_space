import { RunCurrentResponse, RunFinishResponse, RunStartResponse, SessionResponse } from "@backpack-space/api";
import { bookRun } from "@backpack-space/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { DomainContext } from "../src/domain/context.js";
import { loadProfile, playerKey } from "../src/domain/players.js";
import { RUN } from "../src/domain/runs.js";
import { fakePorts } from "../src/fakes/index.js";

const setup = async (player = "player-1") => {
  const f = fakePorts();
  const app = createApp(f.ports);
  const headers = { "x-app-version": "1.0.0" };
  const signIn = async (name: string) =>
    SessionResponse.parse(JSON.parse((await app({ method: "POST", path: "/session", headers, body: JSON.stringify({ platform: "dev", player: name }) })).body));
  const session = await signIn(player);
  const call = async (method: string, path: string, body?: unknown, token = session.token) => {
    const r = await app({ method, path, headers: { ...headers, authorization: `Bearer ${token}` }, body: body === undefined ? null : JSON.stringify(body) });
    return { status: r.status, body: JSON.parse(r.body) as unknown };
  };
  const ctx: DomainContext = { ports: f.ports, settings: await f.ports.settings.get(), events: [] };
  const playerId = f.ports.tokens.check(session.token, ctx.settings, f.clock.now())!.playerId;
  const sim = f.ports.game.data.simVersion;
  const hero = f.ports.game.meta.startHeroes[0]!;
  const start = async (h = hero, token?: string) => call("POST", "/runs", { hero: h, simVersion: sim }, token);
  const current = async () => RunCurrentResponse.parse((await call("GET", "/runs/current")).body).run;
  const finish = async (runId: string, reason = "no_local_copy") => call("POST", "/runs/finish", { runId, reason });
  const events = (name: string) => f.log.lines.filter((l) => l.type === "event" && l.event === name);
  return { ...f, app, call, ctx, playerId, sim, hero, start, current, finish, events, signIn };
};

describe("run lifecycle on the server", () => {
  it("has no open run before the first start", async () => {
    const { current } = await setup();
    expect(await current()).toBeNull();
  });

  it("starts a run at round 1 with the rules' lives and a shop seed from the server", async () => {
    const { start, players, playerId, ports, hero, events, sim } = await setup();
    const res = await start();
    expect(res.status).toBe(200);
    const { run } = RunStartResponse.parse(res.body);
    expect(run).toMatchObject({ hero, round: 1, lives: ports.game.data.rules.lives, wins: 0 });
    expect(Number.isInteger(run.shopSeed)).toBe(true);
    expect(await players.get(playerKey(playerId), RUN)).toMatchObject({ runId: run.runId, shopSeed: run.shopSeed, simVersion: sim, version: 1 });
    expect(events("run_started")).toEqual([expect.objectContaining({ runId: run.runId, hero, simVersion: sim, player: playerId })]);
  });

  it("keeps one open run: a second start gives back the open one, even for another hero", async () => {
    const { start, ports, events } = await setup();
    const first = RunStartResponse.parse((await start()).body).run;
    const other = ports.game.meta.startHeroes[1]!;
    const second = RunStartResponse.parse((await start(other)).body).run;
    expect(second).toEqual(first);
    expect(events("run_started")).toHaveLength(1);
  });

  it("lets only one of two starts at the same time create a run", async () => {
    const { start, events } = await setup();
    const [a, b] = await Promise.all([start(), start()]);
    expect(RunStartResponse.parse(a.body).run).toEqual(RunStartResponse.parse(b.body).run);
    expect(events("run_started")).toHaveLength(1);
  });

  it("resumes at the same round: the open run comes back with the round's shop seed", async () => {
    const { start, current, players, playerId } = await setup();
    const run = RunStartResponse.parse((await start()).body).run;
    expect(await current()).toEqual(run);
    // the fight request moves the run on (M2 fight issue); here the stored run is moved by hand
    const item = (await players.get(playerKey(playerId), RUN))!;
    await players.transact([{ put: { ...item, round: 4, wins: 2, lives: 3, shopSeed: 99, version: 2 } }]);
    expect(await current()).toEqual({ ...run, round: 4, wins: 2, lives: 3, shopSeed: 99 });
  });

  it("refuses another simulation version with update_required", async () => {
    const { call, hero, current } = await setup();
    expect(await call("POST", "/runs", { hero, simVersion: "0.000000" })).toEqual({ status: 426, body: { error: "update_required" } });
    expect(await current()).toBeNull();
  });

  it("refuses a hero that does not exist or is not owned", async () => {
    const { start, ports } = await setup();
    expect((await start("no_such_hero")).status).toBe(400);
    const season = ports.game.data.heroList.find((h) => !ports.game.meta.startHeroes.includes(h.id));
    if (season) expect((await start(season.id)).status).toBe(400);
  });

  it("needs a session token", async () => {
    const { start, call } = await setup();
    expect((await start(undefined, "v1.forged.token")).status).toBe(401);
    expect((await call("GET", "/runs/current", undefined, "v1.forged.token")).status).toBe(401);
  });

  it("ends a run without a local copy and books the standing the server knows", async () => {
    const { start, finish, current, players, playerId, ctx, ports, events } = await setup();
    const run = RunStartResponse.parse((await start()).body).run;
    const item = (await players.get(playerKey(playerId), RUN))!;
    await players.transact([{ put: { ...item, round: 6, wins: 3, lives: 2, version: 2 } }]);
    const before = (await loadProfile(ctx, playerId))!.profile;

    const res = await finish(run.runId);
    expect(res.status).toBe(200);
    const { result, profile } = RunFinishResponse.parse(res.body);
    const summary = { hero: run.hero, wins: 3, livesLeft: 2, roundsPlayed: 5 };
    const expected = bookRun(ports.game.meta, { ...before, credits: 0 }, summary);
    expect(result).toMatchObject({ runId: run.runId, ...summary, galaxies: expected.galaxies, xp: expected.xp });
    expect(profile.runs).toBe(before.runs + 1);
    expect((await loadProfile(ctx, playerId))!.profile).toEqual(profile);
    expect(await current()).toBeNull();
    expect(await players.get(playerKey(playerId), `DONE#${run.runId}`)).toMatchObject({ reason: "no_local_copy", answer: res.body });
    expect(events("run_finished")).toEqual([expect.objectContaining({ runId: run.runId, reason: "abandoned", wins: 3, livesLeft: 2 })]);
  });

  it("books giving up once: a repeat gets the same answer, and a new run can start", async () => {
    const { start, finish, ctx, playerId, events } = await setup();
    const run = RunStartResponse.parse((await start()).body).run;
    const runs = (await loadProfile(ctx, playerId))!.profile.runs;
    const a = await finish(run.runId, "gave_up");
    const b = await finish(run.runId, "gave_up");
    expect(a.status).toBe(200);
    expect(b).toEqual(a);
    expect((await loadProfile(ctx, playerId))!.profile.runs).toBe(runs + 1);
    expect(events("run_finished")).toEqual([expect.objectContaining({ reason: "gave_up" })]);
    const next = RunStartResponse.parse((await start()).body).run;
    expect(next.runId).not.toBe(run.runId);
  });

  it("books two finish requests at the same time once, with identical answers", async () => {
    const { start, finish, ctx, playerId, events } = await setup();
    const run = RunStartResponse.parse((await start()).body).run;
    const runs = (await loadProfile(ctx, playerId))!.profile.runs;
    const [a, b] = await Promise.all([finish(run.runId), finish(run.runId)]);
    expect(a).toEqual(b);
    expect((await loadProfile(ctx, playerId))!.profile.runs).toBe(runs + 1);
    expect(events("run_finished")).toHaveLength(1);
  });

  it("answers run_conflict for a run that is not the open one", async () => {
    const { start, finish } = await setup();
    expect(await finish("not-a-run")).toEqual({ status: 409, body: { error: "run_conflict" } });
    await start();
    expect((await finish("not-a-run")).status).toBe(409);
  });

  it("keeps runs of different players apart", async () => {
    const { start, signIn, call } = await setup();
    await start();
    const other = await signIn("player-2");
    const res = await call("GET", "/runs/current", undefined, other.token);
    expect(RunCurrentResponse.parse(res.body).run).toBeNull();
  });
});
