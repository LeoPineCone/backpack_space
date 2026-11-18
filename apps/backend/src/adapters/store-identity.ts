/**
 * The identity check at Apple and Google (ACC-02).
 *
 * Game Center (`GKLocalPlayer.fetchItems(forIdentityVerificationSignature:)`): the app sends the player id, bundle
 * id, a URL of Apple's public key certificate, a signature, a salt and a timestamp. The signed bytes are
 * player id (UTF-8) + bundle id (UTF-8) + timestamp (64-bit big-endian) + salt (bytes), RSA with SHA-256.
 * We accept the certificate only from an https URL on apple.com, only while it is valid, only for our bundle ids,
 * and only for a recent timestamp. NOTE: Apple's page could not be read automatically when this was built
 * (2026-11-18); check the steps against Apple's current documentation before launch (#53).
 *
 * Play Games (v2, server access, checked against developer.android.com on 2026-11-18): the app sends a server auth
 * code. We exchange it at Google's token endpoint with our "web" OAuth client (redirect URI "") and ask the Games API
 * for `players/me`; its `playerId` is the store identity.
 */
import { X509Certificate, createVerify } from "node:crypto";
import type { Clock, CheckedIdentity, IdentityCheck, SettingsValues, StoreSignIn } from "../ports/index.js";

export type Fetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** how far the Game Center timestamp may be from our clock */
export const GAME_CENTER_MAX_AGE_MS = 10 * 60_000;
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_PLAYER_URL = "https://games.googleapis.com/games/v1/players/me";

/** The bytes Apple signed. */
export function gameCenterPayload(playerId: string, bundleId: string, timestamp: number, salt: string): Buffer {
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(timestamp));
  return Buffer.concat([Buffer.from(playerId, "utf8"), Buffer.from(bundleId, "utf8"), ts, Buffer.from(salt, "base64")]);
}

export function isApplePublicKeyUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "apple.com" || u.hostname.endsWith(".apple.com")) && u.port === "";
  } catch {
    return false;
  }
}

export function storeIdentity(fetch: Fetch, clock: Clock): IdentityCheck {
  const certs = new Map<string, X509Certificate>();

  async function certificate(url: string): Promise<X509Certificate | null> {
    const cached = certs.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    if (!res.ok) return null;
    const cert = new X509Certificate(Buffer.from(await res.arrayBuffer()));
    if (certs.size > 20) certs.clear();
    certs.set(url, cert);
    return cert;
  }

  async function gameCenter(req: Extract<StoreSignIn, { platform: "gamecenter" }>, settings: SettingsValues): Promise<CheckedIdentity | null> {
    if (!settings.gameCenter?.bundleIds.includes(req.bundleId)) return null;
    if (!isApplePublicKeyUrl(req.publicKeyUrl)) return null;
    const now = clock.now();
    if (Math.abs(now - req.timestamp) > GAME_CENTER_MAX_AGE_MS) return null;
    const cert = await certificate(req.publicKeyUrl);
    if (!cert || now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) return null;
    const ok = createVerify("RSA-SHA256")
      .update(gameCenterPayload(req.playerId, req.bundleId, req.timestamp, req.salt))
      .verify(cert.publicKey, Buffer.from(req.signature, "base64"));
    return ok ? { platform: "gamecenter", storeId: req.playerId } : null;
  }

  async function playGames(req: Extract<StoreSignIn, { platform: "playgames" }>, settings: SettingsValues): Promise<CheckedIdentity | null> {
    const client = settings.playGames;
    if (!client) return null;
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: req.serverAuthCode,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: "",
      }).toString(),
    });
    if (!tokenRes.ok) return null;
    const accessToken = ((await tokenRes.json()) as { access_token?: unknown }).access_token;
    if (typeof accessToken !== "string") return null;
    const playerRes = await fetch(GOOGLE_PLAYER_URL, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!playerRes.ok) return null;
    const playerId = ((await playerRes.json()) as { playerId?: unknown }).playerId;
    return typeof playerId === "string" && playerId.length > 0 ? { platform: "playgames", storeId: playerId } : null;
  }

  return {
    check: (req, settings) => (req.platform === "gamecenter" ? gameCenter(req, settings) : playGames(req, settings)),
  };
}
