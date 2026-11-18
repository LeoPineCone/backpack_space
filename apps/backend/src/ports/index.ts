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
  /** present only locally: the development identity is accepted (DEV-05) */
  devIdentity?: boolean;
  /** signing keys for session tokens, newest first; two are accepted at once */
  tokenKeys: { id: string; secret: string }[];
  /** seconds a session token stays valid */
  tokenLifetime: number;
  tables: { players: string; backpacks: string; actions: string };
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
export type Write = { put: Item; ifNotExists?: boolean; ifVersion?: number } | { delete: { pk: string; sk: string }; ifExists?: boolean };

/** The table `players` (one partition per player). */
export interface PlayerStore {
  get(pk: string, sk: string): Promise<Item | null>;
  /** every item of a partition, sorted by sort key */
  query(pk: string): Promise<Item[]>;
  /** writes together; false when a condition failed (then nothing was written) */
  transact(writes: Write[]): Promise<boolean>;
}

/** The table `backpacks` (the opponent pool). Methods come with the matching issues (M2). */
export interface BackpackPool {
  put(item: Item): Promise<void>;
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
  /** null when the identity is not accepted */
  check(request: unknown): Promise<CheckedIdentity | null>;
}

/** RevenueCat (M4). */
export interface RevenueCat {
  balance(playerId: string): Promise<number>;
}

/** Where log lines go: stdout as JSON in the cloud and locally, an array in tests. */
export interface LogSink {
  write(line: Record<string, unknown>): void;
}
