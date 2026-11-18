import { ConfigResponse, ProfileResponse, SessionResponse } from "@backpack-space/api";
import { buildMeta, patchId, seasonStartLeague, type MetaData } from "@backpack-space/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { DomainContext } from "../src/domain/context.js";
import { loadProfile, playerKey } from "../src/domain/players.js";
import { seasonNow } from "../src/domain/season.js";
import { fakePorts, testGame, type FakePlayerStore } from "../src/fakes/index.js";
import { jobsHandler } from "../src/handlers/jobs.js";
import { runJob } from "../src/jobs/index.js";

const { data, meta: meta1 } = testGame();
const per = meta1.leagues.pointsPerLeague;

/** the game data with a second season that starts on 2027-02-01 */
function withSeason2() {
  const raw = JSON.parse(JSON.stringify({ ...meta1, cosmeticById: undefined, startHeroes: undefined })) as MetaData;
  const hero = data.heroList[0]!.id;
  raw.seasons.push({ id: 2, start: "2027-02-01", hero, pass: { galaxiesPerLevel: 10, levels: [{ premium: { hero } }, { free: { credits: 5 } }] } });
  return buildMeta(raw, data);
}
const meta = withSeason2();
const at = (iso: string) => Date.parse(iso);
const SEASON2 = { id: 2, start: "2027-02-01", end: "2027-04-30" };

/** A backend whose settings already name season 2, a day before it starts, with two signed-in players. */
async function setup() {
  const f = fakePorts();
  f.ports.game = { data, meta };
  f.settings.values.season = SEASON2;
  f.clock.ms = at("2027-01-31T23:00:00Z");
  const app = createApp(f.ports);
  const headers = { "x-app-version": "1.0.0" };
  const signIn = async (player: string) => {
    const res = await app({ method: "POST", path: "/session", headers, body: JSON.stringify({ platform: "dev", player }) });
    const s = SessionResponse.parse(JSON.parse(res.body));
    return { ...s, playerId: f.ports.tokens.check(s.token, f.settings.values, f.clock.now())!.playerId };
  };
  const getProfile = async (token: string) =>
    ProfileResponse.parse(
      JSON.parse((await app({ method: "GET", path: "/profile", headers: { ...headers, authorization: `Bearer ${token}` }, body: null })).body),
    ).profile;
  return { ...f, app, signIn, getProfile };
}

/** Puts the player into a league of the running season (as runs would). */
function reachLeague(players: FakePlayerStore, playerId: string, league: number) {
  const key = `${playerKey(playerId)}\u0000PROFILE`;
  const item = players.items.get(key)!;
  players.items.set(key, { ...item, season: { ...(item.season as object), points: league * per + 3, peak: league, galaxies: 25 } });
}

const version = (players: FakePlayerStore, playerId: string) => players.items.get(`${playerKey(playerId)}\u0000PROFILE`)!.version as number;

describe("which season runs", () => {
  const settings = () => ({ ...fakePorts().settings.values, season: SEASON2 });

  it("is the season of the settings from its start date on, the one before it until then", () => {
    expect(seasonNow(meta, settings(), at("2027-01-31T23:59:59Z"))).toEqual({ id: 1, start: "2026-11-01", end: "2027-01-31" });
    expect(seasonNow(meta, settings(), at("2027-02-01T00:00:00Z"))).toEqual(SEASON2);
  });

  it("stays with a season the game data knows", () => {
    // settings already name season 2, but this build has no pass for it
    expect(seasonNow(meta1, settings(), at("2027-02-02T00:00:00Z")).id).toBe(1);
  });

  it("is what /config reports", async () => {
    const { app, clock } = await setup();
    const config = async () =>
      ConfigResponse.parse(JSON.parse((await app({ method: "GET", path: "/config", headers: { "x-app-version": "1.0.0" }, body: null })).body));
    expect((await config()).season).toEqual({ id: 1, start: "2026-11-01", end: "2027-01-31" });
    clock.ms = at("2027-02-01T00:00:00Z");
    expect((await config()).season).toEqual(SEASON2);
  });

  it("is the season new players start in", async () => {
    const { signIn, clock } = await setup();
    expect((await signIn("before")).profile.season.id).toBe(1);
    clock.ms = at("2027-02-01T08:00:00Z");
    expect((await signIn("after")).profile.season).toMatchObject({ id: 2, points: 0, peak: 0 });
  });
});

describe("the season job (BE-14, META-03)", () => {
  it("changes nothing before the date and every profile on it, with patch, drop and new pass", async () => {
    const { ports, players, clock, log, signIn } = await setup();
    const a = await signIn("a");
    const b = await signIn("b");
    reachLeague(players, a.playerId, 6);

    clock.ms = at("2027-01-31T23:59:59Z");
    expect(await runJob(ports, "season")).toEqual({ job: "season", seen: 2, changed: 0 });

    clock.ms = at("2027-02-01T00:05:00Z");
    expect(await runJob(ports, "season")).toEqual({ job: "season", seen: 2, changed: 2 });
    const ctx: DomainContext = { ports, settings: await ports.settings.get(), events: [] };
    const pa = (await loadProfile(ctx, a.playerId))!.profile;
    const drop = seasonStartLeague(meta, 6);
    expect(pa.season).toEqual({ id: 2, galaxies: 0, premium: false, points: drop * per, peak: drop });
    expect(pa.cosmetics).toContain(patchId(1, meta.leagues.ids[6]!));
    expect(players.items.get(`${playerKey(a.playerId)}\u0000OWN#${patchId(1, meta.leagues.ids[6]!)}`)).toMatchObject({ origin: "league", at: "2027-02-01" });
    // the lowest league group keeps its league
    const pb = (await loadProfile(ctx, b.playerId))!.profile;
    expect(pb.season).toMatchObject({ id: 2, points: 0, peak: 0 });
    expect(pb.cosmetics).toContain(patchId(1, meta.leagues.ids[0]!));
    expect(ctx.events).toEqual([]);

    const events = log.lines.filter((l) => l.event === "season_changed");
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.player === a.playerId)).toMatchObject({
      type: "event",
      from: 1,
      to: 2,
      patch: patchId(1, meta.leagues.ids[6]!),
      league: [6, drop],
    });
    expect(log.lines.filter((l) => l.type === "job")).toHaveLength(2);
  });

  it("changes each profile once: a second run leaves everything as it is", async () => {
    const { ports, players, clock, signIn } = await setup();
    const a = await signIn("a");
    reachLeague(players, a.playerId, 3);
    clock.ms = at("2027-02-01T00:05:00Z");
    await runJob(ports, "season");
    const v = version(players, a.playerId);
    const snapshot = structuredClone([...players.items.entries()]);
    clock.ms = at("2027-02-01T06:00:00Z");
    expect(await runJob(ports, "season")).toEqual({ job: "season", seen: 1, changed: 0 });
    expect(version(players, a.playerId)).toBe(v);
    expect([...players.items.entries()]).toEqual(snapshot);
  });

  it("reads the players page by page", async () => {
    const { ports, players, clock, signIn } = await setup();
    for (const n of ["a", "b", "c", "d", "e"]) await signIn(n);
    players.pageSize = 2;
    clock.ms = at("2027-02-01T00:05:00Z");
    expect(await runJob(ports, "season")).toEqual({ job: "season", seen: 5, changed: 5 });
  });

  it("is not needed for a player who was away: the change comes with their next request, once", async () => {
    const { players, clock, signIn, getProfile } = await setup();
    const a = await signIn("away");
    reachLeague(players, a.playerId, 8);
    clock.ms = at("2027-03-10T12:00:00Z");
    // back after weeks: the app signs in again
    const back = await signIn("away");
    const now = back.profile;
    const drop = seasonStartLeague(meta, 8);
    expect(now.season).toMatchObject({ id: 2, peak: drop, points: drop * per });
    expect(now.cosmetics).toContain(patchId(1, meta.leagues.ids[8]!));
    const v = version(players, a.playerId);
    // the stored profile lists owned things in key order
    const sorted = (p: typeof now) => ({ ...p, cosmetics: [...p.cosmetics].sort() });
    expect(sorted(await getProfile(back.token))).toEqual(sorted(now));
    expect(version(players, a.playerId)).toBe(v);
  });
});

describe("the actions job (BE-14)", () => {
  it("deletes the shop actions whose expiry has passed and keeps the others", async () => {
    const f = fakePorts();
    const nowSec = Math.floor(f.clock.now() / 1000);
    const actions = f.ports.actions as unknown as { items: { pk: string; sk: string }[]; pageSize: number };
    actions.pageSize = 2;
    for (let i = 0; i < 5; i++) await f.ports.actions.put({ pk: `RUN#old${i}`, sk: "R01", expiresAt: nowSec - 10 });
    await f.ports.actions.put({ pk: "RUN#new", sk: "R01", expiresAt: nowSec + 10 });
    expect(await runJob(f.ports, "actions")).toEqual({ job: "actions", seen: 5, changed: 5 });
    expect(actions.items.map((i) => i.pk)).toEqual(["RUN#new"]);
    expect(await runJob(f.ports, "actions")).toEqual({ job: "actions", seen: 0, changed: 0 });
  });
});

describe("the jobs Lambda", () => {
  it("runs the job the schedule names and refuses others", async () => {
    const f = fakePorts();
    const handler = jobsHandler(f.ports);
    expect(await handler({ job: "actions" })).toMatchObject({ job: "actions" });
    await expect(handler({ job: "drop-tables" })).rejects.toThrow("unknown job");
  });
});
