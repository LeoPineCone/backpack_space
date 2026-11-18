import { describe, expect, it } from "vitest";
import { newProfile } from "@backpack-space/core";
import { loadMeta } from "@backpack-space/core/node";
import { ERROR_CODES, ERROR_STATUS, ErrorBody, MAX_BODY_BYTES, ROUTES, type RouteName } from "@backpack-space/api";

const { credits: _credits, ...profile } = newProfile(loadMeta());

/** One valid sample per route: request and response. */
const samples: Record<RouteName, { request: unknown; response: unknown }> = {
  config: {
    request: {},
    response: {
      minAppVersion: "1.0.0",
      serverDate: "2026-11-18",
      season: { id: 1, start: "2026-11-01", end: "2027-01-31" },
      maintenance: { on: false },
    },
  },
  session: {
    request: { platform: "dev", player: "player-1" },
    response: { token: "abc.def", expiresAt: 1_800_000_000, profile },
  },
  profile: { request: {}, response: { profile } },
};

describe("API contract", () => {
  for (const [name, route] of Object.entries(ROUTES) as [RouteName, (typeof ROUTES)[RouteName]][]) {
    describe(`${route.method} ${route.path}`, () => {
      it("accepts a valid request and response", () => {
        expect(route.request.safeParse(samples[name].request).success).toBe(true);
        expect(route.response.safeParse(samples[name].response).success).toBe(true);
      });

      it("refuses unknown fields", () => {
        expect(route.request.safeParse({ ...(samples[name].request as object), extra: 1 }).success).toBe(false);
        expect(route.response.safeParse({ ...(samples[name].response as object), extra: 1 }).success).toBe(false);
      });

      it("refuses wrong types and missing fields in the response", () => {
        expect(route.response.safeParse({}).success).toBe(false);
        expect(route.response.safeParse("text").success).toBe(false);
      });
    });
  }

  it("takes the core's new profile without the Credits, and refuses it with them", () => {
    expect(ROUTES.profile.response.safeParse({ profile }).success).toBe(true);
    expect(ROUTES.profile.response.safeParse({ profile: { ...profile, credits: 5 } }).success).toBe(false);
  });

  it("knows every sign-in platform and refuses an unknown one", () => {
    const s = ROUTES.session.request;
    expect(s.safeParse({ platform: "playgames", serverAuthCode: "4/abc" }).success).toBe(true);
    expect(
      s.safeParse({
        platform: "gamecenter",
        playerId: "T:1",
        bundleId: "app.example",
        publicKeyUrl: "https://static.gc.apple.com/public-key/gc-prod-10.cer",
        signature: "c2ln",
        salt: "c2FsdA==",
        timestamp: 1,
      }).success,
    ).toBe(true);
    expect(s.safeParse({ platform: "facebook", token: "x" }).success).toBe(false);
    expect(s.safeParse({ platform: "dev" }).success).toBe(false);
    expect(s.safeParse({ platform: "dev", player: 7 }).success).toBe(false);
  });

  it("refuses oversized input", () => {
    const s = ROUTES.session.request;
    expect(s.safeParse({ platform: "playgames", serverAuthCode: "x".repeat(MAX_BODY_BYTES) }).success).toBe(false);
    expect(s.safeParse({ platform: "dev", player: "p".repeat(33) }).success).toBe(false);
    const big = { ...profile, cosmetics: Array.from({ length: 1001 }, (_, i) => `c${i}`) };
    expect(ROUTES.profile.response.safeParse({ profile: big }).success).toBe(false);
    expect(ROUTES.profile.response.safeParse({ profile: { ...profile, name: "n".repeat(33) } }).success).toBe(false);
  });

  it("has a status for every error code and refuses codes it does not know", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ErrorBody.safeParse({ error: code }).success).toBe(true);
    }
    expect(ERROR_CODES).toEqual(expect.arrayContaining(["update_required", "maintenance", "invalid_backpack", "unauthorized"]));
    expect(ErrorBody.safeParse({ error: "teapot" }).success).toBe(false);
  });

  it("defines each method and path once", () => {
    const keys = Object.values(ROUTES).map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
