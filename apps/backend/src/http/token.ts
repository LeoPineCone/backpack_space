/**
 * Session tokens (ACC-04, docs/backend.md "Sign-in and session token"): `v1.<claims>.<signature>`, base64url, signed
 * with HMAC-SHA256. The claims carry player id, platform, issue time, expiry and the id of the signing key. New tokens
 * are signed with the first key of the settings; the first two keys are accepted, so a key can be changed without
 * signing everybody out. No refresh token: an expired token means a silent new sign-in.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionClaims, SessionTokens, SettingsValues } from "../ports/index.js";

interface Payload {
  sub: string;
  plt: SessionClaims["platform"];
  /** seconds since 1970 */
  iat: number;
  exp: number;
  kid: string;
}

const PLATFORMS = new Set(["gamecenter", "playgames", "dev"]);
const PREFIX = "v1";
const MAX_TOKEN = 2048;

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest();
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

export const hmacTokens: SessionTokens = {
  issue(claims, settings, nowMs) {
    const key = settings.tokenKeys[0];
    if (!key) throw new Error("no token signing key");
    const iat = Math.floor(nowMs / 1000);
    const payload: Payload = { sub: claims.playerId, plt: claims.platform, iat, exp: iat + settings.tokenLifetime, kid: key.id };
    const head = `${PREFIX}.${b64(JSON.stringify(payload))}`;
    return { token: `${head}.${sign(key.secret, head).toString("base64url")}`, expiresAt: payload.exp };
  },

  check(token, settings: SettingsValues, nowMs) {
    if (token.length > MAX_TOKEN) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== PREFIX) return null;
    let payload: Payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Payload;
    } catch {
      return null;
    }
    const key = settings.tokenKeys.slice(0, 2).find((k) => k.id === payload?.kid);
    if (!key) return null;
    const given = Buffer.from(parts[2]!, "base64url");
    const expected = sign(key.secret, `${parts[0]}.${parts[1]}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    if (typeof payload.sub !== "string" || !PLATFORMS.has(payload.plt) || typeof payload.exp !== "number") return null;
    if (Math.floor(nowMs / 1000) >= payload.exp) return null;
    return { playerId: payload.sub, platform: payload.plt };
  },
};
