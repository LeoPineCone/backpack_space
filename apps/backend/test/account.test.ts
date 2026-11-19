import { AccountDeleteResponse, AccountExportResponse, RunFightResponse, RunStartResponse, SessionResponse, type BuildBody } from "@backpack-space/api";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { deletedIds } from "../src/domain/account.js";
import { poolKeys, type PoolEntry } from "../src/domain/matching.js";
import { playerKey } from "../src/domain/players.js";
import { runJob } from "../src/jobs/index.js";
import { buckets } from "../src/seed/bot-pool.js";
import { fakePorts, type FakeActionStore, type FakeBackpackPool, type FakePlayerStore, type FakeRevenueCat } from "../src/fakes/index.js";

/** A player who played two rounds (pool backpacks and recorded actions exist), against a bot pool. */
async function setup() {
  const f = fakePorts();
  const app = createApp(f.ports);
  const { data } = f.ports.game;
  const headers = { "x-app-version": "1.0.0" };
  const signIn = async () =>
    SessionResponse.parse(
      JSON.parse((await app({ method: "POST", path: "/session", headers, body: JSON.stringify({ platform: "dev", player: "del1" }) })).body),
    );
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
  const s = await signIn();
  const auth = { ...headers, authorization: `Bearer ${s.token}` };
  const call = async (method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => {
    const r = await app({ method, path, headers: auth, body: body === undefined ? null : JSON.stringify(body) });
    return { status: r.status, body: JSON.parse(r.body) as unknown };
  };
  await call("POST", "/profile/name", { name: "Star Rider" });
  const run = RunStartResponse.parse((await call("POST", "/runs", { hero: hero.id, simVersion: data.simVersion })).body).run;
  let body = run;
  for (let i = 0; i < 2 && !body.over; i++)
    body = RunFightResponse.parse(
      (await call("POST", "/runs/fight", { runId: run.runId, round: body.round, backpack: build(body.round), actions: [], simVersion: data.simVersion })).body,
    ).run;
  const playerId = f.ports.tokens.check(s.token, await f.ports.settings.get(), f.clock.now())!.playerId;
  return { ...f, app, call, signIn, playerId };
}

describe("account export and deletion (ACC-08)", () => {
  it("exports the player's entries and recorded actions", async () => {
    const { call, playerId } = await setup();
    const res = await call("GET", "/account/export");
    expect(res.status).toBe(200);
    const ex = AccountExportResponse.parse(res.body);
    expect(ex.playerId).toBe(playerId);
    expect(ex.player.some((i) => i.sk === "PROFILE" && i.name === "Star Rider")).toBe(true);
    expect(ex.actions.length).toBeGreaterThan(0);
    expect(ex.actions.every((a) => a.playerId === playerId)).toBe(true);
  });

  it("deletes everything of the player, keeps their backpacks as nameless opponents, and a new sign-in starts fresh", async () => {
    const { call, signIn, playerId, ports, players, log, clock } = await setup();
    const revenuecat = ports.revenuecat as FakeRevenueCat;
    const pool = ports.backpacks as FakeBackpackPool;
    const before = await pool.byPlayer(playerId);
    expect(before.length).toBeGreaterThan(0);

    const res = await call("DELETE", "/account");
    expect(res.status).toBe(200);
    expect(AccountDeleteResponse.parse(res.body)).toEqual({ deleted: true });

    expect(await players.query(playerKey(playerId))).toEqual([]);
    expect([...(players as FakePlayerStore).items.values()].some((i) => i.playerId === playerId)).toBe(false);
    expect(await (ports.actions as FakeActionStore).byPlayer(playerId)).toEqual([]);
    expect(await pool.byPlayer(playerId)).toEqual([]);
    for (const b of before) {
      const left = (await pool.range(b.pk, b.sk, b.sk, 1))[0]!;
      expect(left.build).toEqual(b.build);
      expect(JSON.stringify(left)).not.toContain("Star Rider");
      expect(JSON.stringify(left)).not.toContain(playerId);
    }
    expect(revenuecat.deleted).toEqual([playerId]);
    expect(await deletedIds(ports)).toEqual([playerId]);
    expect(log.lines.some((l) => l.event === "account_deleted" && l.player === playerId)).toBe(true);

    // the old profile is gone: the same identity gets a new player with a new profile
    const again = await signIn();
    expect(ports.tokens.check(again.token, await ports.settings.get(), clock.now())?.playerId ?? "").not.toBe(playerId);
    expect(again.profile.name).not.toBe("Star Rider");
    expect(again.profile.runs).toBe(0);
  });

  it("deletes a listed account again after a restore brought it back", async () => {
    const { call, playerId, players, ports } = await setup();
    const store = players as FakePlayerStore;
    const snapshot = new Map(store.items);
    await call("DELETE", "/account");
    // a restore of `players` from before the deletion
    for (const [k, v] of snapshot) store.items.set(k, v);
    expect((await players.query(playerKey(playerId))).length).toBeGreaterThan(0);

    const r = await runJob(ports, "deleted");
    expect(r).toMatchObject({ job: "deleted", seen: 1 });
    expect(r.changed).toBeGreaterThan(0);
    expect(await players.query(playerKey(playerId))).toEqual([]);
    // nothing left to do on a second run
    expect((await runJob(ports, "deleted")).changed).toBe(0);
  });
});
