/**
 * Ports: the backend's interfaces to the outside (docs/backend.md). The domain talks only to these; real
 * implementations live in src/adapters, in-memory ones in src/fakes. A port imports nothing.
 * Ports grow with the issues that use them; each method is added when a domain rule needs it.
 */

/** Time comes from here, never from the clock directly (the domain reads no clock). */
export interface Clock {
  /** milliseconds since 1970 */
  now(): number;
}

/** Randomness comes from here, never from Math.random or crypto directly. */
export interface Random {
  /** a random id, URL-safe, about 128 bits */
  id(): string;
  /** an unsigned 32-bit integer (seeds) */
  uint32(): number;
}

/** The settings of the environment (docs/backend.md "Settings and secrets"). */
export interface SettingsValues {
  maintenance: { on: boolean; textKey?: string };
  minAppVersion: string;
  /** the current season with its dates ("YYYY-MM-DD"); a setting, so a season can start without a deployment */
  season: { id: number; start: string; end: string };
  /**
   * Matching phase (docs/matchmaking.md "Phases"): 1 = bot backpacks only (player backpacks are collected but not
   * handed out), 3 = player backpacks first, bots as fallback. Missing = 1. Phase 2 (players only in buckets that are
   * full enough) waits for its threshold, which is set from the numbers collected in phase 1.
   */
  matchingPhase?: 1 | 3;
  /**
   * Request limits per route (BE-06): steady requests per second over all players and a burst. The cloud setup sets
   * them on the HTTP API; the local server applies them itself. A route without an entry has no limit.
   */
  limits?: Partial<Record<string, { rate: number; burst: number }>>;
  /** present only locally: the development identity is accepted (DEV-05) */
  devIdentity?: boolean;
  /** signing keys for session tokens, newest first; two are accepted at once */
  tokenKeys: { id: string; secret: string }[];
  /** seconds a session token stays valid */
  tokenLifetime: number;
  tables: { players: string; backpacks: string; actions: string };
  /** Game Center: the bundle ids of our app (iOS) */
  gameCenter?: { bundleIds: string[] };
  /** Play Games: the OAuth client of type "web" (Play Console credential "Game server") */
  playGames?: { clientId: string; clientSecret: string };
}
export interface Settings {
  /** the current values; implementations refresh them at most once a minute */
  get(): Promise<SettingsValues>;
}

/** One item of a table: a partition key, a sort key and the rest. */
export interface Item {
  pk: string;
  sk: string;
  [field: string]: unknown;
}
/** A write that only succeeds if its condition holds; all writes of one `transact` succeed or none does. */
export type Write =
  | { put: Item; ifNotExists?: boolean; ifVersion?: number }
  /** `ifVersion`: delete only an existing item with this version number */
  | { delete: { pk: string; sk: string }; ifExists?: boolean; ifVersion?: number };

/** The table `players` (one partition per player). */
export interface PlayerStore {
  get(pk: string, sk: string): Promise<Item | null>;
  /** every item of a partition, sorted by sort key */
  query(pk: string): Promise<Item[]>;
  /** writes together; false when a condition failed (then nothing was written) */
  transact(writes: Write[]): Promise<boolean>;
}

/** The table `backpacks` (the opponent pool, docs/backend.md): one partition per matching bucket. */
export interface BackpackPool {
  put(item: Item): Promise<void>;
  /** up to `limit` items of partition `pk` with `from` <= sort key <= `to`, in sort key order (one small read) */
  range(pk: string, from: string, to: string, limit: number): Promise<Item[]>;
  remove(pk: string, sk: string): Promise<void>;
}

/** The table `actions` (recorded shop actions). Methods come with the run issues (M2). */
export interface ActionStore {
  put(item: Item): Promise<void>;
}

/** What Apple or Google confirm about a sign-in (ACC-02). */
export interface CheckedIdentity {
  platform: "gamecenter" | "playgames" | "dev";
  /** the store's id of the player; only ever used as a lookup key */
  storeId: string;
}
export interface IdentityCheck {
  /** asks Apple or Google; null when the identity is not accepted */
  check(request: StoreSignIn, settings: SettingsValues): Promise<CheckedIdentity | null>;
}
/** What the app hands in from Game Center or Play Games (the schema is in packages/api). */
export type StoreSignIn =
  | { platform: "gamecenter"; playerId: string; bundleId: string; publicKeyUrl: string; signature: string; salt: string; timestamp: number }
  | { platform: "playgames"; serverAuthCode: string };

/** What a session token says (ACC-04). */
export interface SessionClaims {
  playerId: string;
  platform: CheckedIdentity["platform"];
}
/** Issues and checks session tokens with the signing keys of the settings (newest first, two accepted). */
export interface SessionTokens {
  /** a token valid for `settings.tokenLifetime` seconds from `nowMs`; `expiresAt` in seconds since 1970 */
  issue(claims: SessionClaims, settings: SettingsValues, nowMs: number): { token: string; expiresAt: number };
  /** null when the token is malformed, forged, signed with an unknown key or expired */
  check(token: string, settings: SettingsValues, nowMs: number): SessionClaims | null;
}

/** RevenueCat (M4). */
export interface RevenueCat {
  balance(playerId: string): Promise<number>;
}

/** Where log lines go: stdout as JSON in the cloud and locally, an array in tests. */
export interface LogSink {
  write(line: Record<string, unknown>): void;
}
