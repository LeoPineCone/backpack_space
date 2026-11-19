import { leagueGroup } from "@backpack-space/core";
import { describe, expect, it } from "vitest";
import type { DomainContext } from "../src/domain/context.js";
import { bucketKey, dataMajor, findOpponent, poolKeys, type MatchRequest, type PoolEntry, type PoolOrigin } from "../src/domain/matching.js";
import { fakePorts } from "../src/fakes/index.js";

const setup = async (phase?: 1 | 3) => {
  const f = fakePorts();
  if (phase) f.settings.values.matchingPhase = phase;
  const ctx: DomainContext = { ports: f.ports, settings: await f.ports.settings.get(), events: [] };
  const { data, meta } = f.ports.game;
  const hero = data.heroList[0]!;
  const pool = f.ports.backpacks as unknown as { items: Map<string, PoolEntry>; reads: number; put(i: PoolEntry): Promise<void> };
  let n = 0;
  const add = async (o: { owner?: string; origin?: PoolOrigin; round?: number; lives: number; league: number; dataVersion?: string; playerId?: string }) => {
    const id = `bp${++n}`;
    const origin = o.origin ?? "bot";
    const dataVersion = o.dataVersion ?? data.dataVersion;
    const round = o.round ?? 5;
    const entry: PoolEntry = {
      ...poolKeys({ origin, round, lives: o.lives, league: o.league, dataVersion, id }, f.ports.random.uint32()),
      id,
      owner: o.owner ?? `bot-${id}`,
      origin,
      build: { hero: hero.id, round, bags: hero.bags, items: hero.start },
      name: "Nova",
      patch: null,
      league: o.league,
      dataVersion,
      at: "2026-11-18",
      ...(o.playerId ? { playerId: o.playerId } : {}),
    };
    await pool.put(entry);
    return entry;
  };
  const lives = data.rules.lives;
  // a player of round 5 with one life lost, in a league inside a middle group
  const league = leagueGroup(meta, 4).from + 1;
  const req = { playerId: "me", round: 5, lives: lives - 1, league, met: [] as string[] };
  const find = (over: Partial<MatchRequest> = {}) => findOpponent(ctx, { ...req, ...over });
  return { ...f, ctx, add, req, find, pool, lives, meta, data };
};

describe("matching", () => {
  it("finds nothing in an empty pool", async () => {
    const { find } = await setup();
    expect(await find()).toBeNull();
  });

  it("step 1: same lives and same league", async () => {
    const { find, add, req } = await setup(3);
    const e = await add({ origin: "player", owner: "p2", playerId: "p2", lives: req.lives, league: req.league });
    expect(await find()).toEqual({ entry: e, step: 1 });
  });

  it("step 2: same lives, league one off", async () => {
    const { find, add, req } = await setup(3);
    await add({ origin: "player", owner: "p2", playerId: "p2", lives: req.lives, league: req.league + 2 });
    const e = await add({ origin: "player", owner: "p3", playerId: "p3", lives: req.lives, league: req.league - 1 });
    expect(await find()).toEqual({ entry: e, step: 2 });
  });

  it("step 3: one life off, league one off", async () => {
    const { find, add, req } = await setup(3);
    const e = await add({ origin: "player", owner: "p2", playerId: "p2", lives: req.lives - 1, league: req.league + 1 });
    expect(await find()).toEqual({ entry: e, step: 3 });
  });

  it("step 4: one life off, any league", async () => {
    const { find, add, req } = await setup(3);
    const e = await add({ origin: "player", owner: "p2", playerId: "p2", lives: req.lives + 1, league: 9 });
    expect(await find({ league: 0 })).toEqual({ entry: e, step: 4 });
  });

  it("step 5: any standing, any league; the round is never relaxed", async () => {
    const { find, add, req } = await setup();
    await add({ lives: req.lives, league: req.league, round: 4 });
    await add({ lives: req.lives, league: req.league, round: 6 });
    expect(await find()).toBeNull();
    const e = await add({ lives: req.lives - 2, league: 0 });
    expect(await find({ league: 9 })).toEqual({ entry: e, step: 5 });
  });

  it("only offers standings that exist in the round", async () => {
    const { find, add, lives } = await setup();
    // round 2: lives can only be full or one less
    const e = await add({ round: 2, lives: lives - 1, league: 0 });
    expect((await find({ round: 2, lives, league: 0 }))?.entry).toEqual(e);
  });

  it("treats a bot's league group as its league", async () => {
    const { find, add, req, meta } = await setup();
    const g = leagueGroup(meta, req.league);
    const e = await add({ lives: req.lives, league: g.to === req.league ? g.from : g.to });
    expect(await find()).toEqual({ entry: e, step: 1 });
  });

  it("never hands out the player's own backpack or an owner met before in this run", async () => {
    const { find, add, req } = await setup(3);
    await add({ origin: "player", owner: "me", playerId: "me", lives: req.lives, league: req.league });
    const met = await add({ origin: "player", owner: "p2", playerId: "p2", lives: req.lives, league: req.league });
    expect(await find({ met: ["p2"] })).toBeNull();
    expect((await find())?.entry).toEqual(met);
  });

  it("matches only backpacks valid under the player's data version", async () => {
    const { find, add, req, data, pool } = await setup();
    const major = dataMajor(data.dataVersion);
    // another major lives in another partition and is never read
    const old = await add({ lives: req.lives, league: req.league, dataVersion: `${major + 1}.0` });
    expect(old.pk).toBe(bucketKey("bot", major + 1, 5, req.lives));
    expect(await find()).toBeNull();
    // a stray entry of another major inside the current partition is filtered out too
    await pool.put({ ...old, pk: bucketKey("bot", major, 5, req.lives) });
    expect(await find()).toBeNull();
  });

  it("phase 1 reads bots only; phase 3 prefers players and falls back to bots", async () => {
    const one = await setup(1);
    await one.add({ origin: "player", owner: "p2", playerId: "p2", lives: one.req.lives, league: one.req.league });
    expect(await one.find()).toBeNull();
    const bot = await one.add({ lives: one.req.lives - 2, league: 0 });
    expect((await one.find())?.entry).toEqual(bot);

    const three = await setup(3);
    const b = await three.add({ lives: three.req.lives, league: three.req.league });
    expect((await three.find())?.entry).toEqual(b);
    const p = await three.add({ origin: "player", owner: "p2", playerId: "p2", lives: three.req.lives, league: three.req.league });
    expect((await three.find())?.entry).toEqual(p);
  });

  it("picks at random inside a league and stays cheap", async () => {
    const { ctx, add, req, pool } = await setup();
    const ids = new Set<string>();
    for (let i = 0; i < 30; i++) await add({ lives: req.lives, league: req.league });
    for (let i = 0; i < 40; i++) {
      pool.reads = 0;
      const m = await findOpponent(ctx, req);
      ids.add(m!.entry.id);
      expect(pool.reads).toBeLessThanOrEqual(2);
    }
    expect(ids.size).toBeGreaterThan(5);
  });

  it("gives a new player the easy bot backpacks first, then the normal ones", async () => {
    const { find, add, req } = await setup();
    const bot = await add({ lives: req.lives, league: req.league });
    expect((await find({ newPlayer: true }))?.entry).toEqual(bot);
    const easy = await add({ origin: "easy", lives: req.lives - 2, league: 0 });
    expect(await find({ newPlayer: true })).toEqual({ entry: easy, step: 5 });
    expect((await find())?.entry).toEqual(bot);
  });
});
