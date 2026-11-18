/** What every domain function gets: the ports, the settings of this request and, when signed in, the player. */
import type { ErrorCode } from "@backpack-space/api";
import type { ActionStore, BackpackPool, Clock, IdentityCheck, LogSink, PlayerStore, Random, RevenueCat, Settings, SettingsValues } from "../ports/index.js";

export interface Ports {
  clock: Clock;
  random: Random;
  settings: Settings;
  players: PlayerStore;
  backpacks: BackpackPool;
  actions: ActionStore;
  identity: IdentityCheck;
  revenuecat: RevenueCat;
  log: LogSink;
}

export interface DomainContext {
  ports: Ports;
  settings: SettingsValues;
  /** from the session token only (ACC-04); undefined on routes without sign-in */
  playerId?: string;
  /** the version the app named on the request */
  appVersion?: string;
  /** event lines of this request (see log.ts); written after the request line */
  events: Record<string, unknown>[];
}

/** A domain rule refused the request with one of the fixed codes. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly textKey?: string,
  ) {
    super(code);
  }
}
