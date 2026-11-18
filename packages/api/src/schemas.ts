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
    /** the backpack grid background; null = the plain grid */
    grid: Id.nullable(),
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
  /** the last round is fought or the lives are gone: the run only waits for its finish */
  over: z.boolean(),
});
export type RunBody = z.infer<typeof RunBody>;

/** POST /runs: start a run. While a run is open, the same open run comes back (whatever hero is asked for). */
export const RunStartRequest = z.strictObject({ hero: Id, simVersion: SimVersion });
export type RunStartRequest = z.infer<typeof RunStartRequest>;
export const RunStartResponse = z.strictObject({ run: RunBody });
export type RunStartResponse = z.infer<typeof RunStartResponse>;

// ---------- POST /runs/fight (RUN-04, RUN-05, RUN-07, RUN-08, RUN-09, RUN-12)

/** One item or bag in the backpack, as `Placement` in the core. */
export const PlacementBody = z.strictObject({
  item: Id,
  x: z.number().int().min(-1).max(31),
  y: z.number().int().min(-1).max(31),
  rot: z.number().int().min(0).max(3),
  lock: z.boolean().optional(),
});
/** A backpack, as `Build` in the core (about 1.3 KB as JSON). */
export const BuildBody = z.strictObject({
  hero: Id,
  round: z.number().int().min(1).max(100),
  bags: z.array(PlacementBody).max(16),
  items: z.array(PlacementBody).max(64),
});
export type BuildBody = z.infer<typeof BuildBody>;

/** Most shop actions one round may carry (docs/client-server.md "Shop actions"). */
export const MAX_ACTIONS = 300;
/** One action line ("by 3 4 2 1"), as `Action` in the core. */
export const ActionLine = z.string().min(1).max(32);

export const RunFightRequest = z.strictObject({
  runId: Id,
  /** the round the app is about to fight; must be the open run's round */
  round: z.number().int().min(1).max(100),
  backpack: BuildBody,
  /** the shop actions of this round, in order; stored, not checked at launch */
  actions: z.array(ActionLine).max(MAX_ACTIONS),
  simVersion: SimVersion,
});
export type RunFightRequest = z.infer<typeof RunFightRequest>;

export const FIGHT_RESULTS = ["win", "loss", "draw"] as const;
export const RunFightResponse = z.strictObject({
  opponent: z.strictObject({ backpack: BuildBody, name: z.string().min(1).max(32), patch: Id.nullable() }),
  /** the app computes the same fight with this seed to play it back */
  fightSeed: Seed,
  /** the server's result counts; a draw costs a life like a loss */
  result: z.enum(FIGHT_RESULTS),
  /** the run after this fight: the next round with its shop seed, or over */
  run: RunBody,
});
export type RunFightResponse = z.infer<typeof RunFightResponse>;

/**
 * Why a run ends: it is over (last round fought or no lives left), the player gave up, or the app has no local copy
 * of the open run (reinstall, other device; the server then books the standing it knows, RUN-11). "finished" for a
 * run that is not over counts as giving up.
 */
export const FINISH_REASONS = ["finished", "gave_up", "no_local_copy"] as const;
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

/**
 * GET /runs/current: the open run, or null. A run that is over but was never reported finished is booked at this
 * request; `finished` then carries what was booked, so the app can show it.
 */
export const RunCurrentResponse = z.strictObject({ run: RunBody.nullable(), finished: RunFinishResponse.optional() });
export type RunCurrentResponse = z.infer<typeof RunCurrentResponse>;

/** POST /profile/equip (ACC-06): wears an owned background, picture, grid background or league patch (null takes off the patch or the grid). */
export const ProfileEquipRequest = z.strictObject({ slot: z.enum(["background", "patch", "picture", "grid"]), id: Id.nullable() });
export type ProfileEquipRequest = z.infer<typeof ProfileEquipRequest>;
/** POST /profile/skin (ACC-06): puts an owned skin on its hero (null: the hero's own look). */
export const ProfileSkinRequest = z.strictObject({ hero: Id, id: Id.nullable() });
export type ProfileSkinRequest = z.infer<typeof ProfileSkinRequest>;
/** POST /profile/name (ACC-07): the new player name; the server tidies and checks it with the core's name filter. */
export const ProfileNameRequest = z.strictObject({ name: z.string().max(64) });
export type ProfileNameRequest = z.infer<typeof ProfileNameRequest>;
