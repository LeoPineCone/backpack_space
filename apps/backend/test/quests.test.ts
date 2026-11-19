import { QuestsResponse, RunFightResponse, RunFinishResponse, RunStartResponse, SessionResponse, type BuildBody } from "@backpack-space/api";
import { questsOn } from "@backpack-space/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { poolKeys, type PoolEntry } from "../src/domain/matching.js";
import { playerKey } from "../src/domain/players.js";
import { questKey } from "../src/domain/runs.js";
import { buckets } from "../src/seed/bot-pool.js";
import { fakePorts, type FakeBackpackPool } from "../src/fakes/index.js";

/** A signed-in player and a bot pool in every bucket (fake clock: 2026-11-18). */
async function setup() {
  const f = fakePorts();
  const app = createApp(f.ports);
  const { data, meta } = f.ports.game;
  const headers = { "x-app-version": "1.0.0" };
  const session = SessionResponse.parse(
    JSON.parse((await app({ method: "POST", path: "/session", headers, body: JSON.stringify({ platform: "dev", player: "q1" }) })).body),
  );
  const auth = { ...headers, authorization: `Bearer ${session.token}` };
  const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
    const r = await app({ method, path, headers: auth, body: body === undefined ? null : JSON.stringify(body) });
    return { status: r.status, body: JSON.parse(r.body) as unknown };
  };
  const hero = data.heroList[0]!;
  const build = (round: number): BuildBody => ({ hero: hero.id, round, bags: hero.bags, items: hero.start });
  let n = 0;
  for (const b of buckets(data))
    for (const league of [0, 3, 6, 9]) {
      const id = `bot${++n}`;
      const e: PoolEntry = {
        ...poolKeys({ origin: "bot", round: b.round, lives: b.lives, league, dataVersion: data.dataVersion, id }, f.ports.random.uint32()),
        id,
        owner: `bot-${n}`,
        origin: "bot",
        build: build(b.round),
        name: "Nova Pilot",
        patch: null,
        league,
        dataVersion: data.dataVersion,
        at: "2026-11-18",
      };
      await f.ports.backpacks.put(e);
    }
  const playerId = f.ports.tokens.check(session.token, await f.ports.settings.get(), f.clock.now())!.playerId;
  return { ...f, call, data, meta, hero, build, playerId, start: session.profile };
}

const open = (meta: ReturnType<typeof fakePorts>["ports"]["game"]["meta"], day = "2026-11-18") => questsOn(meta.quests, day);

describe("quests on the server (META-06, CORE-07)", () => {
  it("lists the quests open today, none played yet", async () => {
    const { call, meta } = await setup();
    const res = await call("GET", "/quests");
    expect(res.status).toBe(200);
    expect(QuestsResponse.parse(res.body).quests).toEqual(open(meta).map((q) => ({ ...q, played: false })));
  });

  it("plays a quest run with its rules, books it once without league points and marks it played", async () => {
    const { call, data, meta, hero, build, players, playerId, start, ports } = await setup();
    const backpacks = ports.backpacks;
    const quest = open(meta).find((q) => q.kind === "weekly")!;
    const rule = meta.quests.rules.find((r) => r.id === quest.rule)!;
    const started = await call("POST", "/runs", { hero: hero.id, simVersion: data.simVersion, quest: quest.id });
    expect(started.status).toBe(200);
    const run = RunStartResponse.parse(started.body).run;
    expect(run).toMatchObject({ quest: quest.id, lives: rule.lives ?? data.rules.lives });

    let body = run;
    const poolBefore = (backpacks as FakeBackpackPool).items.size;
    while (!body.over) {
      const f = await call("POST", "/runs/fight", {
        runId: run.runId,
        round: body.round,
        backpack: build(body.round),
        actions: [],
        simVersion: data.simVersion,
      });
      expect(f.status).toBe(200);
      body = RunFightResponse.parse(f.body).run;
      expect(body.quest).toBe(quest.id);
    }
    // quest backpacks never become opponents of normal runs
    expect((backpacks as FakeBackpackPool).items.size).toBe(poolBefore);

    const fin = await call("POST", "/runs/finish", { runId: run.runId, reason: "finished" });
    expect(fin.status).toBe(200);
    const booked = RunFinishResponse.parse(fin.body);
    expect(booked.result).toMatchObject({ quest: quest.id, points: 0 });
    expect(booked.result.galaxies).toBe(
      booked.result.wins * meta.run.galaxies.perWin + booked.result.livesLeft * meta.run.galaxies.perLifeLeft + meta.quests.bonusGalaxies[quest.kind],
    );
    expect(booked.profile.season.points).toBe(start.season.points);
    expect(await players.get(playerKey(playerId), questKey(quest.id))).toMatchObject({ runId: run.runId });
    // booked once
    expect(RunFinishResponse.parse((await call("POST", "/runs/finish", { runId: run.runId, reason: "finished" })).body)).toEqual(booked);

    const after = QuestsResponse.parse((await call("GET", "/quests")).body).quests;
    expect(after.find((q) => q.id === quest.id)?.played).toBe(true);
    expect(after.filter((q) => q.played)).toHaveLength(1);
    // the same quest cannot be played again in its period
    expect(await call("POST", "/runs", { hero: hero.id, simVersion: data.simVersion, quest: quest.id })).toEqual({
      status: 409,
      body: { error: "quest_unavailable" },
    });
  });

  it("starts only quests that are open today", async () => {
    const { call, data, meta, hero } = await setup();
    const other = open(meta, "2026-12-24").find((q) => q.kind === "daily")!;
    expect(await call("POST", "/runs", { hero: hero.id, simVersion: data.simVersion, quest: other.id })).toEqual({
      status: 409,
      body: { error: "quest_unavailable" },
    });
    expect(await call("POST", "/runs", { hero: hero.id, simVersion: data.simVersion, quest: "d2026-11-18:noSuchRule" })).toEqual({
      status: 409,
      body: { error: "quest_unavailable" },
    });
  });

  it("opens each day's quests on that day", async () => {
    const { call, data, meta, hero, clock } = await setup();
    // a day on which gold rain is open
    let day = 18;
    while (!open(meta, `2026-11-${day}`).some((q) => q.rule === "goldRain")) day++;
    clock.ms = Date.UTC(2026, 10, day, 12);
    const quest = open(meta, `2026-11-${day}`).find((q) => q.rule === "goldRain")!;
    const run = RunStartResponse.parse((await call("POST", "/runs", { hero: hero.id, simVersion: data.simVersion, quest: quest.id })).body).run;
    expect(run.quest).toBe(quest.id);
  });
});
