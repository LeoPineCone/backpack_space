import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GOOGLE_PLAYER_URL, GOOGLE_TOKEN_URL, gameCenterPayload, isApplePublicKeyUrl, storeIdentity, type Fetch } from "../src/adapters/store-identity.js";
import { FakeClock, defaultSettings } from "../src/fakes/index.js";

const respond = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 400,
  json: async () => body,
  arrayBuffer: async () => (body as Buffer).buffer.slice((body as Buffer).byteOffset, (body as Buffer).byteOffset + (body as Buffer).byteLength) as ArrayBuffer,
});

describe("Game Center identity", () => {
  // a throwaway key and certificate standing in for Apple's
  let cert: Buffer;
  let key: string;
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), "gc-"));
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "2",
        "-subj",
        "/CN=test",
        "-keyout",
        join(dir, "k.pem"),
        "-outform",
        "DER",
        "-out",
        join(dir, "c.der"),
      ],
      { stdio: "ignore" },
    );
    cert = readFileSync(join(dir, "c.der"));
    key = readFileSync(join(dir, "k.pem"), "utf8");
  });

  const settings = { ...defaultSettings(), gameCenter: { bundleIds: ["app.backpackspace"] } };
  const url = "https://static.gc.apple.com/public-key/gc-prod-10.cer";

  const signed = (now: number, over: Partial<{ playerId: string; bundleId: string; timestamp: number; publicKeyUrl: string }> = {}) => {
    const req = {
      platform: "gamecenter" as const,
      playerId: "T:_abc123",
      bundleId: "app.backpackspace",
      publicKeyUrl: url,
      salt: Buffer.from("salty!").toString("base64"),
      timestamp: now,
      signature: "",
    };
    req.signature = createSign("RSA-SHA256")
      .update(gameCenterPayload(req.playerId, req.bundleId, req.timestamp, req.salt))
      .sign(key, "base64");
    return { ...req, ...over };
  };

  const setup = () => {
    const clock = new FakeClock(Date.now());
    let fetched = 0;
    const fetch: Fetch = async (u) => {
      fetched++;
      expect(u).toBe(url);
      return respond(cert);
    };
    return { check: storeIdentity(fetch, clock), clock, fetched: () => fetched };
  };

  it("accepts a correct signature and keeps the certificate", async () => {
    const { check, clock, fetched } = setup();
    expect(await check.check(signed(clock.now()), settings)).toEqual({ platform: "gamecenter", storeId: "T:_abc123" });
    await check.check(signed(clock.now()), settings);
    expect(fetched()).toBe(1);
  });

  it("refuses a changed player id, bundle id or timestamp", async () => {
    const { check, clock } = setup();
    const now = clock.now();
    expect(await check.check(signed(now, { playerId: "T:_other" }), settings)).toBeNull();
    expect(await check.check(signed(now, { timestamp: now - 1000 }), settings)).toBeNull();
    expect(
      await check.check(signed(now, { bundleId: "app.other" }), { ...settings, gameCenter: { bundleIds: ["app.backpackspace", "app.other"] } }),
    ).toBeNull();
  });

  it("refuses another app's bundle id, an old timestamp and a key from outside apple.com", async () => {
    const { check, clock } = setup();
    expect(await check.check(signed(clock.now()), { ...settings, gameCenter: { bundleIds: ["app.mine"] } })).toBeNull();
    expect(await check.check(signed(clock.now()), defaultSettings())).toBeNull();
    const old = signed(clock.now());
    clock.advance(11 * 60);
    expect(await check.check(old, settings)).toBeNull();
    expect(await check.check(signed(clock.now(), { publicKeyUrl: "https://evil.example/apple.com.cer" }), settings)).toBeNull();
  });

  it("knows Apple's addresses", () => {
    expect(isApplePublicKeyUrl("https://static.gc.apple.com/public-key/gc-prod-10.cer")).toBe(true);
    for (const u of [
      "http://static.gc.apple.com/k.cer",
      "https://apple.com.evil.example/k",
      "https://evilapple.com/k",
      "https://static.gc.apple.com:8443/k",
      "nope",
    ])
      expect(isApplePublicKeyUrl(u)).toBe(false);
  });
});

describe("Play Games identity", () => {
  const settings = { ...defaultSettings(), playGames: { clientId: "web-client", clientSecret: "client-secret" } };

  const google = (player: unknown = { playerId: "g-123", displayName: "Someone" }, tokenOk = true) => {
    const calls: { url: string; body?: string; auth?: string }[] = [];
    const fetch: Fetch = async (url, init) => {
      calls.push({ url, body: init?.body, auth: init?.headers?.authorization });
      if (url === GOOGLE_TOKEN_URL) return respond({ access_token: "at-1" }, tokenOk);
      if (url === GOOGLE_PLAYER_URL) return respond(player);
      throw new Error(`unexpected ${url}`);
    };
    return { check: storeIdentity(fetch, new FakeClock()), calls };
  };

  it("exchanges the server auth code and asks for players/me", async () => {
    const { check, calls } = google();
    expect(await check.check({ platform: "playgames", serverAuthCode: "code-1" }, settings)).toEqual({ platform: "playgames", storeId: "g-123" });
    const form = new URLSearchParams(calls[0]!.body);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      client_id: "web-client",
      client_secret: "client-secret",
      redirect_uri: "",
    });
    expect(calls[1]).toMatchObject({ url: GOOGLE_PLAYER_URL, auth: "Bearer at-1" });
  });

  it("refuses when Google refuses the code, gives no player, or no client is set up", async () => {
    expect(await google(undefined, false).check.check({ platform: "playgames", serverAuthCode: "x" }, settings)).toBeNull();
    expect(await google({}).check.check({ platform: "playgames", serverAuthCode: "x" }, settings)).toBeNull();
    expect(await google().check.check({ platform: "playgames", serverAuthCode: "x" }, defaultSettings())).toBeNull();
  });
});
