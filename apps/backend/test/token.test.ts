import { describe, expect, it } from "vitest";
import { hmacTokens } from "../src/http/token.js";
import { defaultSettings } from "../src/fakes/index.js";
import type { SettingsValues } from "../src/ports/index.js";

const T0 = Date.UTC(2026, 10, 18, 12);
const claims = { playerId: "p-1", platform: "dev" as const };
const withKeys = (...keys: [string, string][]): SettingsValues => ({ ...defaultSettings(), tokenKeys: keys.map(([id, secret]) => ({ id, secret })) });
const s1 = withKeys(["k1", "secret-one-secret-one-secret-one!"]);

describe("session tokens", () => {
  it("is accepted for one hour and names the player and platform", () => {
    const { token, expiresAt } = hmacTokens.issue(claims, s1, T0);
    expect(expiresAt).toBe(T0 / 1000 + 3600);
    expect(hmacTokens.check(token, s1, T0)).toEqual(claims);
    expect(hmacTokens.check(token, s1, T0 + 3599_000)).toEqual(claims);
  });

  it("is refused once expired", () => {
    const { token } = hmacTokens.issue(claims, s1, T0);
    expect(hmacTokens.check(token, s1, T0 + 3600_000)).toBeNull();
  });

  it("is refused when the claims or the signature were changed", () => {
    const { token } = hmacTokens.issue(claims, s1, T0);
    const [v, body, sig] = token.split(".");
    const forged = Buffer.from(Buffer.from(body!, "base64url").toString().replace("p-1", "p-2")).toString("base64url");
    expect(hmacTokens.check(`${v}.${forged}.${sig}`, s1, T0)).toBeNull();
    expect(hmacTokens.check(`${v}.${body}.${sig!.slice(0, -2)}AA`, s1, T0)).toBeNull();
    expect(hmacTokens.check(`v2.${body}.${sig}`, s1, T0)).toBeNull();
    for (const junk of ["", "a.b", "v1..", "v1.!!!.x", "v1.e30.x"]) expect(hmacTokens.check(junk, s1, T0)).toBeNull();
  });

  it("is refused when signed with a key the settings do not know", () => {
    const { token } = hmacTokens.issue(claims, withKeys(["k9", "another-secret-another-secret-!!"]), T0);
    expect(hmacTokens.check(token, s1, T0)).toBeNull();
  });

  it("refuses a key id it knows when the secret differs", () => {
    const { token } = hmacTokens.issue(claims, withKeys(["k1", "a-different-secret-for-the-same-id"]), T0);
    expect(hmacTokens.check(token, s1, T0)).toBeNull();
  });

  it("keeps old tokens valid while a new key is rolled in, and signs with the new key", () => {
    const old = hmacTokens.issue(claims, s1, T0).token;
    const rotated = withKeys(["k2", "secret-two-secret-two-secret-two!"], ["k1", "secret-one-secret-one-secret-one!"]);
    expect(hmacTokens.check(old, rotated, T0)).toEqual(claims);
    const fresh = hmacTokens.issue(claims, rotated, T0).token;
    expect(hmacTokens.check(fresh, s1, T0)).toBeNull();
    // once k1 is dropped, its tokens end
    expect(hmacTokens.check(old, withKeys(["k2", "secret-two-secret-two-secret-two!"]), T0)).toBeNull();
  });
});
