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

// ---------- runs (RUN-01, RUN-02, RUN-03, RUN-11)

/** The simulation version of core and data (`GameData.simVersion`, e.g. "2.157d28e9292bed"). */
export const SimVersion = z.string().min(1).max(64);
/** A seed as the core takes it: an unsigned 32-bit integer. */
export const Seed = z.number().int().min(0).max(0xffffffff);

/**
 * The open run as the server knows it. The gold that is left, loose items and pinned offers are not here: they live
 * only on the device (docs/backend.md "No move to another device").
 */
export const RunBody = z.strictObject({
  runId: Id,
  hero: Id,
  /** the round about to be fought, from 1 */
  round: z.number().int().min(1).max(100),
  lives: z.number().int().min(0).max(100),
  wins: z.number().int().min(0).max(100),
  /** the seed of this round's shop; every offer and reroll of the round follows from it (RUN-03) */
  shopSeed: Seed,
});
export type RunBody = z.infer<typeof RunBody>;

/** GET /runs/current: the open run, or null. */
export const RunCurrentResponse = z.strictObject({ run: RunBody.nullable() });
export type RunCurrentResponse = z.infer<typeof RunCurrentResponse>;

/** POST /runs: start a run. While a run is open, the same open run comes back (whatever hero is asked for). */
export const RunStartRequest = z.strictObject({ hero: Id, simVersion: SimVersion });
export type RunStartRequest = z.infer<typeof RunStartRequest>;
export const RunStartResponse = z.strictObject({ run: RunBody });
export type RunStartResponse = z.infer<typeof RunStartResponse>;

/**
 * Why a run ends early: the player gave up, or the app has no local copy of the open run (reinstall, other device;
 * the server then books the standing it knows, RUN-11).
 */
export const FINISH_REASONS = ["gave_up", "no_local_copy"] as const;
export type FinishReason = (typeof FINISH_REASONS)[number];
export const RunFinishRequest = z.strictObject({ runId: Id, reason: z.enum(FINISH_REASONS) });
export type RunFinishRequest = z.infer<typeof RunFinishRequest>;

/** Something a run unlocked (a hero level, the planet track or the pass); as `Reward` in the core. */
export const RewardBody = z.union([z.strictObject({ credits: z.number().int().positive() }), z.strictObject({ cosmetic: Id }), z.strictObject({ hero: Id })]);
const Pair = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
/** What the end of a run booked (as `RunBooking` in the core, without the profile). */
export const RunResult = z.strictObject({
  runId: Id,
  hero: Id,
  wins: z.number().int().min(0),
  livesLeft: z.number().int().min(0),
  roundsPlayed: z.number().int().min(0),
  galaxies: Count,
  xp: Count,
  /** hero level before and after */
  level: Pair,
  /** league points as booked; may be negative */
  points: z.number().int(),
  league: Pair,
  pass: Pair,
  rewards: z.array(RewardBody).max(100),
});
export type RunResult = z.infer<typeof RunResult>;
/** POST /runs/finish: the same answer for every repeat of the request. */
export const RunFinishResponse = z.strictObject({ result: RunResult, profile: ProfileBody });
export type RunFinishResponse = z.infer<typeof RunFinishResponse>;
