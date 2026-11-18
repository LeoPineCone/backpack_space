/** What every domain function gets: the ports, the settings of this request and, when signed in, the player. */
import type { ErrorCode } from "@backpack-space/api";
import type { GameData, Meta } from "@backpack-space/core";
import type {
  ActionStore,
  BackpackPool,
  Clock,
  IdentityCheck,
  LogSink,
  PlayerStore,
  Random,
  RevenueCat,
  SessionTokens,
  Settings,
  SettingsValues,
} from "../ports/index.js";

/** The game data the backend was built with (bundled into each Lambda; locally read from /data). */
export interface Game {
  data: GameData;
  meta: Meta;
}

export interface Ports {
  clock: Clock;
  random: Random;
  settings: Settings;
  players: PlayerStore;
  backpacks: BackpackPool;
  actions: ActionStore;
  identity: IdentityCheck;
  tokens: SessionTokens;
  game: Game;
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
  /** the simulation version the app named on the request, if any (request line) */
  simVersion?: string;
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
