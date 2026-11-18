import { SessionResponse } from "@backpack-space/api";
import { describe, expect, it } from "vitest";
import { checkToken, createApp } from "../src/app.js";
import { fakePorts } from "../src/fakes/index.js";
import type { DomainContext } from "../src/domain/context.js";

const signIn = (body: unknown) => ({
  method: "POST",
  path: "/session",
  headers: { "x-app-version": "1.0.0", "content-type": "application/json" },
  body: JSON.stringify(body),
});

const setup = () => {
  const f = fakePorts();
  const app = createApp(f.ports);
  const call = async (body: unknown) => {
    const res = await app(signIn(body));
    return { status: res.status, body: JSON.parse(res.body) as Record<string, unknown> };
  };
  const playerOf = async (token: string) => {
    const ctx: DomainContext = { ports: f.ports, settings: await f.ports.settings.get(), events: [] };
    return checkToken(token, ctx);
  };
  return { ...f, call, playerOf };
};

describe("POST /session", () => {
  it("gives two development players two player ids and tokens that work for an hour", async () => {
    const { call, playerOf, clock } = setup();
    const a = SessionResponse.parse((await call({ platform: "dev", player: "player-1" })).body);
    const b = SessionResponse.parse((await call({ platform: "dev", player: "player-2" })).body);
    const idA = await playerOf(a.token);
    const idB = await playerOf(b.token);
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
    clock.advance(3599);
    expect(await playerOf(a.token)).toBe(idA);
    clock.advance(1);
    expect(await playerOf(a.token)).toBeNull();
  });

  it("returns the same player id when the same identity signs in again", async () => {
    const { call, playerOf, clock } = setup();
    const first = await playerOf(String((await call({ platform: "dev", player: "player-1" })).body.token));
    clock.advance(7200);
    const again = SessionResponse.parse((await call({ platform: "dev", player: "player-1" })).body);
    expect(first).toBeTruthy();
    expect(await playerOf(again.token)).toBe(first);
  });

  it("makes one player when the first sign-in arrives twice at the same time", async () => {
    const { call, playerOf, players } = setup();
    const [a, b] = await Promise.all([call({ platform: "dev", player: "twin" }), call({ platform: "dev", player: "twin" })]);
    const ids = await Promise.all([playerOf(String(a.body.token)), playerOf(String(b.body.token))]);
    expect(ids[0]).toBe(ids[1]);
    expect([...players.items.values()].filter((i) => i.sk === "PROFILE")).toHaveLength(1);
  });

  it("creates a new profile at the first sign-in: lowest league, 0 points, no Credits", async () => {
    const { call, ports } = setup();
    const { profile } = SessionResponse.parse((await call({ platform: "dev", player: "player-1" })).body);
    expect(profile.season).toMatchObject({ id: 1, points: 0, peak: 0, galaxies: 0 });
    expect(profile.name).toBe(ports.game.meta.start.name);
    expect(profile.cosmetics).toEqual(expect.arrayContaining(ports.game.meta.start.cosmetics));
    expect(profile).not.toHaveProperty("credits");
  });

  it("refuses the development identity where the setting does not exist (test, production)", async () => {
    const { call, settings } = setup();
    delete settings.values.devIdentity;
    expect(await call({ platform: "dev", player: "player-1" })).toEqual({ status: 401, body: { error: "identity_rejected" } });
  });

  it("refuses a store identity Apple or Google do not confirm", async () => {
    const { call } = setup();
    const res = await call({ platform: "playgames", serverAuthCode: "nope" });
    expect(res).toEqual({ status: 401, body: { error: "identity_rejected" } });
  });

  it("refuses a confirmation for another platform than the one asked", async () => {
    const { call, identity } = setup();
    identity.accept = () => ({ platform: "gamecenter", storeId: "G:1" });
    expect((await call({ platform: "playgames", serverAuthCode: "code" })).status).toBe(401);
  });

  it("keeps the store identity out of every answer and log line", async () => {
    const { call, identity, log } = setup();
    identity.accept = () => ({ platform: "playgames", storeId: "g-store-id-4711" });
    const res = await call({ platform: "playgames", serverAuthCode: "code" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("4711");
    expect(JSON.stringify(log.lines)).not.toContain("4711");
    expect(log.lines[0]).toMatchObject({ route: "session", status: 200 });
    expect(log.lines[0]!.player).toBeTruthy();
  });
});
