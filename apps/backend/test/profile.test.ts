import { ProfileResponse, SessionResponse } from "@backpack-space/api";
import { fitProfile, newProfile } from "@backpack-space/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { DomainContext } from "../src/domain/context.js";
import { loadProfile, playerKey, saveProfile } from "../src/domain/players.js";
import { fakePorts } from "../src/fakes/index.js";

const setup = async () => {
  const f = fakePorts();
  const app = createApp(f.ports);
  const res = await app({
    method: "POST",
    path: "/session",
    headers: { "x-app-version": "1.0.0" },
    body: JSON.stringify({ platform: "dev", player: "player-1" }),
  });
  const session = SessionResponse.parse(JSON.parse(res.body));
  const getProfile = async (token = session.token) => {
    const r = await app({ method: "GET", path: "/profile", headers: { "x-app-version": "1.0.0", authorization: `Bearer ${token}` }, body: null });
    return { status: r.status, body: JSON.parse(r.body) as unknown };
  };
  const ctx: DomainContext = { ports: f.ports, settings: await f.ports.settings.get(), events: [] };
  const playerId = f.ports.tokens.check(session.token, ctx.settings, f.clock.now())!.playerId;
  return { ...f, session, getProfile, ctx, playerId };
};

describe("profile on the server", () => {
  it("is created at the first sign-in and read back by GET /profile", async () => {
    const { session, getProfile } = await setup();
    const res = await getProfile();
    expect(res.status).toBe(200);
    expect(ProfileResponse.parse(res.body).profile).toEqual(session.profile);
  });

  it("is stored as PROFILE plus one OWN# entry per owned thing", async () => {
    const { players, playerId, ports } = await setup();
    const items = await players.query(playerKey(playerId));
    expect(items.map((i) => i.sk)).toEqual(["IDENTITY", ...ports.game.meta.start.cosmetics.map((c) => `OWN#${c}`).sort(), "PROFILE"]);
    expect(items.find((i) => i.sk === "PROFILE")).not.toHaveProperty("credits");
    expect(items.find((i) => i.sk === "OWN#bg_home")).toMatchObject({ kind: "cosmetic", origin: "start", at: "2026-11-18" });
  });

  it("has the shape the client keeps: the core's profile without Credits", async () => {
    const { getProfile, ports } = await setup();
    const { profile } = ProfileResponse.parse((await getProfile()).body);
    const asClient = { ...profile, credits: 0 };
    expect(fitProfile(ports.game.meta, asClient)).toEqual(asClient);
    const { credits: _c, ...fresh } = newProfile(ports.game.meta);
    expect(Object.keys(profile).sort()).toEqual(Object.keys(fresh).sort());
  });

  it("needs a valid session token", async () => {
    const { getProfile } = await setup();
    expect(await getProfile("v1.forged.token")).toEqual({ status: 401, body: { error: "unauthorized" } });
  });

  it("lets only one of two writes on the same version win", async () => {
    const { ctx, playerId } = await setup();
    const read = (await loadProfile(ctx, playerId))!;
    const [a, b] = await Promise.all([
      saveProfile(ctx, playerId, read, { ...read.profile, name: "Alpha" }, "start"),
      saveProfile(ctx, playerId, read, { ...read.profile, name: "Beta", cosmetics: [...read.profile.cosmetics, "bg_extra"] }, "credits"),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const after = (await loadProfile(ctx, playerId))!;
    expect(after.version).toBe(read.version + 1);
    expect(after.profile.name).toBe(a ? "Alpha" : "Beta");
    // the losing write left nothing behind, not even its new ownership entry
    expect(after.profile.cosmetics.includes("bg_extra")).toBe(!a);
    expect(after.createdAt).toBe(read.createdAt);
  });

  it("adds ownership entries only for new things, with their origin", async () => {
    const { ctx, playerId, players } = await setup();
    const read = (await loadProfile(ctx, playerId))!;
    expect(await saveProfile(ctx, playerId, read, { ...read.profile, heroes: ["hero_x"] }, "purchase")).toBe(true);
    expect(await players.get(playerKey(playerId), "OWN#hero_x")).toMatchObject({ kind: "hero", origin: "purchase" });
    expect((await loadProfile(ctx, playerId))!.profile.heroes).toEqual(["hero_x"]);
  });
});
