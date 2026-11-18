import { RunCurrentResponse, RunFightResponse, RunFinishResponse, RunStartResponse, SessionResponse, type BuildBody } from "@backpack-space/api";
import { compile, simulate } from "@backpack-space/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ACTIONS_KEEP_DAYS } from "../src/domain/fight.js";
import { poolKeys, type PoolEntry, type PoolOrigin } from "../src/domain/matching.js";
import { playerKey } from "../src/domain/players.js";
import { roundKey, ROUNDS_KEEP_DAYS } from "../src/domain/runs.js";
import { buckets } from "../src/seed/bot-pool.js";
import { fakePorts } from "../src/fakes/index.js";
import type { Write } from "../src/ports/index.js";

const setup = async (opts: { easy?: boolean } = {}) => {
  const f = fakePorts();
  const app = createApp(f.ports);
  const { data, meta } = f.ports.game;
  const headers = { "x-app-version": "1.0.0" };
  const session = SessionResponse.parse(
    JSON.parse((await app({ method: "POST", path: "/session", headers, body: JSON.stringify({ platform: "dev", player: "p1" }) })).body),
  );
  const playerId = f.ports.tokens.check(session.token, await f.ports.settings.get(), f.clock.now())!.playerId;
  const call = async (path: string, body: unknown) => {
    const r = await app({ method: "POST", path, headers: { ...headers, authorization: `Bearer ${session.token}` }, body: JSON.stringify(body) });
    return { status: r.status, body: JSON.parse(r.body) as unknown };
  };
  const hero = data.heroList[0]!;
  const startBuild = (round: number, h = hero): BuildBody => ({ hero: h.id, round, bags: h.bags, items: h.start });
  // a pool of three bots of every league group in every bucket, of every hero
  let n = 0;
  const origins: PoolOrigin[] = opts.easy ? ["bot", "easy"] : ["bot"];
  for (const origin of origins)
    for (const b of buckets(data))
      for (const [i, h] of data.heroList.entries())
        for (const league of [0, 3, 6, 9]) {
          const id = `${origin}${++n}`;
          const e: PoolEntry = {
            ...poolKeys({ origin, round: b.round, lives: b.lives, league, dataVersion: data.dataVersion, id }, f.ports.random.uint32()),
            id,
            owner: `${origin}-${i}-${league}-${n % 7}`,
            origin,
            build: startBuild(b.round, h),
            name: "Nova Pilot",
            patch: null,
            league,
            dataVersion: data.dataVersion,
            at: "2026-11-18",
          };
          await f.ports.backpacks.put(e);
        }
  const run = RunStartResponse.parse((await call("/runs", { hero: hero.id, simVersion: data.simVersion })).body).run;
  const fightBody = (round: number, over: Partial<{ backpack: BuildBody; simVersion: string; runId: string }> = {}) => ({
    runId: run.runId,
    round,
    backpack: startBuild(round),
    actions: ["rr", "by 0"],
    simVersion: data.simVersion,
    ...over,
  });
  const fight = (round: number, over?: Parameters<typeof fightBody>[1]) => call("/runs/fight", fightBody(round, over));
  const events = (name: string) => f.log.lines.filter((l) => l.type === "event" && l.event === name);
  return {
    ...f,
    token: session.token,
    backpacks: f.ports.backpacks,
    actions: f.ports.actions,
    app,
    call,
    run,
    fight,
    fightBody,
    events,
    playerId,
    data,
    meta,
    hero,
    startBuild,
  };
};

describe("fight request", () => {
  it("plays all rounds of a run: one opponent each, nobody twice, and the server's result moves the run", async () => {
    const { fight, run, data, events } = await setup();
    let state = run;
    let fights = 0;
    while (!state.over) {
      const res = await fight(state.round);
      expect(res.status).toBe(200);
      const a = RunFightResponse.parse(res.body);
      fights++;
      const won = a.result === "win";
      expect(a.run.wins).toBe(state.wins + (won ? 1 : 0));
      expect(a.run.lives).toBe(state.lives - (won ? 0 : 1));
      if (!a.run.over) {
        expect(a.run.round).toBe(state.round + 1);
        expect(a.run.shopSeed).not.toBe(state.shopSeed);
      }
      state = a.run;
    }
    expect(state.lives === 0 || state.round === data.rules.rounds).toBe(true);
    expect(events("fight")).toHaveLength(fights);
    expect(events("fight").map((e) => e.round)).toEqual(Array.from({ length: fights }, (_, i) => i + 1));
  });

  it("computes the result the app gets when it replays the fight", async () => {
    const { fight, run, data, startBuild } = await setup();
    const a = RunFightResponse.parse((await fight(1)).body);
    const res = simulate(compile(startBuild(1), data), compile(a.opponent.backpack, data), data.rules, a.fightSeed);
    expect(a.result).toBe(res.winner === 0 ? "win" : res.winner === 1 ? "loss" : "draw");
    expect(a.run.runId).toBe(run.runId);
  });

  it("never meets the same opponent twice in a run", async () => {
    const { fight, run, players, playerId } = await setup();
    let state = run;
    while (!state.over) state = RunFightResponse.parse((await fight(state.round)).body).run;
    const met = (await players.query(playerKey(playerId))).filter((i) => i.sk.startsWith("ROUND#")).map((i) => i.owner);
    expect(new Set(met).size).toBe(met.length);
  });

  it("returns the same answer to a repeat, even with another backpack, and fights only once", async () => {
    const { fight, events, startBuild, data } = await setup();
    const a = await fight(1);
    const other = data.heroList[0]!;
    const b = await fight(1, { backpack: { ...startBuild(1), items: other.start.slice(0, 1) } });
    expect(b).toEqual(a);
    expect(events("fight")).toHaveLength(1);
  });

  it("lets only one of two requests at the same time win", async () => {
    const { fight, events, players, playerId, run } = await setup();
    const [a, b] = await Promise.all([fight(1), fight(1)]);
    expect(a).toEqual(b);
    expect(events("fight")).toHaveLength(1);
    expect(await players.get(playerKey(playerId), roundKey(run.runId, 1))).not.toBeNull();
  });

  it("starts again at step 1 when another request commits first, and then returns that answer", async () => {
    const f = await setup();
    const real = f.players.transact.bind(f.players);
    let nested: { status: number; body: unknown } | undefined;
    f.players.transact = async (writes: Write[]) => {
      if (!nested && writes.some((w) => "put" in w && w.put.sk.startsWith("ROUND#"))) {
        nested = { status: 0, body: null };
        nested = await f.fight(1);
      }
      return real(writes);
    };
    const res = await f.fight(1);
    expect(nested!.status).toBe(200);
    expect(res).toEqual(nested);
    expect(f.events("fight")).toHaveLength(1);
  });

  it("refuses another simulation version, a wrong round or run, and a run that is over", async () => {
    const { fight, run } = await setup();
    expect(await fight(1, { simVersion: "0.0" })).toEqual({ status: 426, body: { error: "update_required" } });
    expect((await fight(2)).status).toBe(409);
    expect((await fight(1, { runId: "other" })).status).toBe(409);
    let state = run;
    while (!state.over) state = RunFightResponse.parse((await fight(state.round)).body).run;
    expect((await fight(state.round + 1)).status).toBe(409);
  });

  it("rejects an implausible backpack and logs why", async () => {
    const { fight, startBuild, events, data } = await setup();
    const res = await fight(1, { backpack: { ...startBuild(1), items: [{ item: "no_such_item", x: 0, y: 0, rot: 0 }] } });
    expect(res).toEqual({ status: 422, body: { error: "invalid_backpack" } });
    expect(events("plausibility_rejected")).toEqual([expect.objectContaining({ round: 1, reason: "unknown_item" })]);
    const other = data.heroList[1]!;
    expect((await fight(1, { backpack: { hero: other.id, round: 1, bags: other.bags, items: other.start } })).status).toBe(422);
    expect(events("fight")).toHaveLength(0);
  });

  it("puts the committed backpack into the pool and stores the actions with an expiry", async () => {
    const { fight, backpacks, actions, playerId, run, clock, data } = await setup();
    await fight(1);
    const mine = [...(backpacks as unknown as { items: Map<string, PoolEntry> }).items.values()].filter((e) => e.origin === "player");
    expect(mine).toEqual([expect.objectContaining({ owner: playerId, playerId, dataVersion: data.dataVersion, appVersion: "1.0.0" })]);
    expect(mine[0]!.pk).toMatch(/^player#\d+#R01#L4$/);
    expect((actions as unknown as { items: Record<string, unknown>[] }).items).toEqual([
      expect.objectContaining({
        pk: `RUN#${run.runId}`,
        sk: "R01",
        actions: ["rr", "by 0"],
        shopSeed: run.shopSeed,
        expiresAt: Math.floor(clock.now() / 1000) + ACTIONS_KEEP_DAYS * 86400,
      }),
    ]);
  });

  it("still counts the fight when the pool write fails, and logs it", async () => {
    const { fight, backpacks, events } = await setup();
    backpacks.put = async () => {
      throw new Error("pool down");
    };
    expect((await fight(1)).status).toBe(200);
    expect(events("error")).toEqual([expect.objectContaining({ message: expect.stringContaining("pool down") })]);
  });

  it("gives a new player the easy bots first", async () => {
    const { fight, run, players, playerId } = await setup({ easy: true });
    expect((await fight(1)).status).toBe(200);
    expect(String((await players.get(playerKey(playerId), roundKey(run.runId, 1)))!.owner)).toMatch(/^easy-/);
  });
});

describe("finishing a run (booking exactly once)", () => {
  const playOut = async (f: Awaited<ReturnType<typeof setup>>) => {
    let state = f.run;
    let rounds = 0;
    while (!state.over) {
      state = RunFightResponse.parse((await f.fight(state.round)).body).run;
      rounds++;
    }
    return { state, rounds };
  };

  it("books a run that is over with reason finished, once, with the rounds played", async () => {
    const f = await setup();
    const { state, rounds } = await playOut(f);
    const a = await f.call("/runs/finish", { runId: f.run.runId, reason: "finished" });
    const b = await f.call("/runs/finish", { runId: f.run.runId, reason: "finished" });
    expect(b).toEqual(a);
    const { result } = RunFinishResponse.parse(a.body);
    expect(result).toMatchObject({ wins: state.wins, livesLeft: state.lives, roundsPlayed: rounds });
    expect(f.events("run_finished")).toEqual([expect.objectContaining({ reason: "finished" })]);
  });

  it("counts finished for a run that is not over as giving up", async () => {
    const f = await setup();
    await f.fight(1);
    expect((await f.call("/runs/finish", { runId: f.run.runId, reason: "finished" })).status).toBe(200);
    expect(f.events("run_finished")).toEqual([expect.objectContaining({ reason: "gave_up" })]);
    expect((await f.players.get(playerKey(f.playerId), `DONE#${f.run.runId}`))?.reason).toBe("gave_up");
  });

  it("books an over run on its own when the app asks for the open run, and only once", async () => {
    const f = await setup();
    await playOut(f);
    const get = async () =>
      RunCurrentResponse.parse(
        JSON.parse(
          (await f.app({ method: "GET", path: "/runs/current", headers: { "x-app-version": "1.0.0", authorization: `Bearer ${f.token}` }, body: null })).body,
        ),
      );
    const first = await get();
    expect(first.run).toBeNull();
    expect(first.finished?.result.runId).toBe(f.run.runId);
    const second = await get();
    expect(second).toEqual({ run: null });
    expect(f.events("run_finished")).toHaveLength(1);
    // the app reporting the end afterwards gets the same answer
    expect((await f.call("/runs/finish", { runId: f.run.runId, reason: "finished" })).body).toEqual(first.finished);
  });

  it("lets ROUND# and DONE# entries expire after 30 days", async () => {
    const f = await setup();
    await f.fight(1);
    await f.call("/runs/finish", { runId: f.run.runId, reason: "gave_up" });
    const items = await f.players.query(playerKey(f.playerId));
    const expiry = Math.floor(f.clock.now() / 1000) + ROUNDS_KEEP_DAYS * 86400;
    for (const i of items.filter((x) => x.sk.startsWith("ROUND#") || x.sk.startsWith("DONE#"))) expect(i.expiresAt).toBe(expiry);
    expect(items.find((i) => i.sk === "PROFILE")).not.toHaveProperty("expiresAt");
  });
});

describe("versions (RUN-12, RUN-13)", () => {
  /** the same data under another simulation version and data version: what a new deployment brings */
  const build = (f: Awaited<ReturnType<typeof setup>>, simVersion: string, dataVersion: string) => ({
    data: { ...f.data, simVersion, dataVersion },
    meta: f.meta,
  });
  const major = (v: string) => Number(v.split(".")[0]);

  it("accepts the previous build during a rollout and refuses any other version", async () => {
    const f = await setup();
    const current = f.ports.game;
    f.ports.previousGame = current;
    f.ports.game = build(f, "new-sim", current.data.dataVersion);
    // the open run was started with the previous build and goes on with it
    expect((await f.fight(1)).status).toBe(200);
    // and with the new one, as soon as the app is updated
    const state = RunFightResponse.parse((await f.fight(1)).body).run;
    expect((await f.fight(state.round, { simVersion: "new-sim" })).status).toBe(200);
    expect(await f.fight(state.round + 1, { simVersion: "very-old" })).toEqual({ status: 426, body: { error: "update_required" } });
    // after the next deployment the previous build is gone
    delete f.ports.previousGame;
    expect((await f.call("/runs", { hero: f.hero.id, simVersion: current.data.simVersion })).status).toBe(426);
  });

  it("keeps an open run across a minor data change", async () => {
    const f = await setup();
    const v = f.data.dataVersion;
    f.ports.game = build(f, "minor-sim", `${major(v)}.${Number(v.split(".")[1]) + 1}`);
    const res = await f.fight(1, { simVersion: "minor-sim" });
    expect(res.status).toBe(200);
  });

  it("ends and books an open run after a major data change", async () => {
    const f = await setup();
    await f.fight(1);
    f.ports.game = build(f, "major-sim", `${major(f.data.dataVersion) + 1}.0`);
    expect((await f.fight(2, { simVersion: "major-sim" })).status).toBe(409);
    const cur = RunCurrentResponse.parse(
      JSON.parse(
        (await f.app({ method: "GET", path: "/runs/current", headers: { "x-app-version": "1.0.0", authorization: `Bearer ${f.token}` }, body: null })).body,
      ),
    );
    expect(cur.run).toBeNull();
    expect(cur.finished?.result).toMatchObject({ runId: f.run.runId, roundsPlayed: 1 });
    expect(f.events("run_finished")).toEqual([expect.objectContaining({ reason: "data_major" })]);
  });

  it("books an old-major run when a new run starts, then starts the new one", async () => {
    const f = await setup();
    f.ports.game = build(f, "major-sim", `${major(f.data.dataVersion) + 1}.0`);
    const res = RunStartResponse.parse((await f.call("/runs", { hero: f.hero.id, simVersion: "major-sim" })).body);
    expect(res.run.runId).not.toBe(f.run.runId);
    expect(f.events("run_finished")).toEqual([expect.objectContaining({ runId: f.run.runId, reason: "data_major" })]);
  });
});
