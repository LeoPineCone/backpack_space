/**
 * Request and response shapes (BE-05). Every request is checked against its schema before any other code runs on
 * it: fields, types and size. Objects are strict, so unknown fields are refused too.
 */
import { z } from "zod";
import { ERROR_CODES } from "./errors.js";

/** Largest request body the backend accepts at all, in bytes (a backpack is about 1.3 KB, a round's actions 0.5 KB). */
export const MAX_BODY_BYTES = 16 * 1024;

const Id = z.string().min(1).max(64);
/** "1.4.2" */
export const AppVersion = z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/);
/** "YYYY-MM-DD" (server date) */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Count = z.number().int().min(0).max(1_000_000_000);

// ---------- headers every request carries

/** The app names its version on every request (header `x-app-version`). */
export const APP_VERSION_HEADER = "x-app-version";
/** The session token travels as `authorization: Bearer <token>`. */
export const AUTH_HEADER = "authorization";

// ---------- errors

export const ErrorBody = z.strictObject({
  error: z.enum(ERROR_CODES),
  /** a key into the app's language files, only for maintenance texts */
  textKey: z.string().max(64).optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

// ---------- GET /config

export const ConfigResponse = z.strictObject({
  minAppVersion: AppVersion,
  serverDate: IsoDate,
  season: z.strictObject({ id: z.number().int().min(1), start: IsoDate, end: IsoDate }),
  maintenance: z.strictObject({ on: z.boolean(), textKey: z.string().max(64).optional() }),
});
export type ConfigResponse = z.infer<typeof ConfigResponse>;

// ---------- POST /session

export const PLATFORMS = ["gamecenter", "playgames", "dev"] as const;
export type Platform = (typeof PLATFORMS)[number];

const GameCenterIdentity = z.strictObject({
  platform: z.literal("gamecenter"),
  /** what GameKit's identity verification hands the app */
  playerId: z.string().min(1).max(128),
  bundleId: z.string().min(1).max(128),
  publicKeyUrl: z.url().max(512),
  signature: z.string().min(1).max(2048),
  salt: z.string().min(1).max(256),
  timestamp: z.number().int().min(0),
});
const PlayGamesIdentity = z.strictObject({
  platform: z.literal("playgames"),
  /** the server auth code Play Games hands the app */
  serverAuthCode: z.string().min(1).max(1024),
});
/** Development identity ("player 1", "player 2"): only accepted where the backend setting allows it (DEV-05). */
const DevIdentity = z.strictObject({
  platform: z.literal("dev"),
  player: z.string().regex(/^[a-z0-9-]{1,32}$/),
});
export const SessionRequest = z.discriminatedUnion("platform", [GameCenterIdentity, PlayGamesIdentity, DevIdentity]);
export type SessionRequest = z.infer<typeof SessionRequest>;

// ---------- profile

/**
 * The player's profile as the app gets it (ACC-05). It mirrors `Profile` in the core without the Credits: the balance
 * lives at RevenueCat only.
 */
export const ProfileBody = z.strictObject({
  name: z.string().min(1).max(32),
  galaxies: Count,
  heroXp: z.record(Id, Count),
  heroes: z.array(Id).max(64),
  cosmetics: z.array(Id).max(1000),
  equipped: z.strictObject({
    background: Id,
    patch: Id.nullable(),
    picture: Id,
    skins: z.record(Id, Id),
  }),
  season: z.strictObject({
    id: z.number().int().min(1),
    galaxies: Count,
    premium: z.boolean(),
    points: Count,
    peak: Count,
  }),
  runs: Count,
});
export type ProfileBody = z.infer<typeof ProfileBody>;

export const SessionResponse = z.strictObject({
  token: z.string().min(1).max(2048),
  /** seconds since 1970 when the token stops being accepted */
  expiresAt: z.number().int().min(0),
  profile: ProfileBody,
});
export type SessionResponse = z.infer<typeof SessionResponse>;

// ---------- GET /profile

export const ProfileResponse = z.strictObject({ profile: ProfileBody });
export type ProfileResponse = z.infer<typeof ProfileResponse>;
