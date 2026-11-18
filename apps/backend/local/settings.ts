/**
 * Local settings: `apps/backend/local/settings.json` (not committed). Without it the example file beside it is used,
 * so a fresh checkout starts. In the cloud the same values come from Parameter Store.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { refreshingSettings } from "../src/adapters/refreshing-settings.js";
import type { Clock, Settings, SettingsValues } from "../src/ports/index.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SETTINGS_FILE = join(here, "settings.json");
export const EXAMPLE_FILE = join(here, "settings.example.json");

export const LocalSettings = z
  .object({
    port: z.number().int().min(0).max(65535),
    dynamodb: z.object({ endpoint: z.url(), region: z.string().min(1) }).strict(),
    maintenance: z.object({ on: z.boolean(), textKey: z.string().optional() }).strict(),
    minAppVersion: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/),
    season: z.object({ id: z.number().int().min(1), start: z.iso.date(), end: z.iso.date() }).strict(),
    devIdentity: z.boolean().optional(),
    matchingPhase: z.union([z.literal(1), z.literal(3)]).optional(),
    tokenKeys: z
      .array(z.object({ id: z.string().min(1), secret: z.string().min(32) }).strict())
      .min(1)
      .max(2),
    tokenLifetime: z.number().int().positive(),
    tables: z.object({ players: z.string().min(3), backpacks: z.string().min(3), actions: z.string().min(3) }).strict(),
  })
  .strict();
export type LocalSettings = z.infer<typeof LocalSettings>;

/** Reads settings.json, else the example. `overrides` replace single values (tests, other ports). */
export function loadLocalSettings(overrides: Partial<LocalSettings> = {}): { values: LocalSettings; file: string } {
  const file = existsSync(SETTINGS_FILE) ? SETTINGS_FILE : EXAMPLE_FILE;
  const values = LocalSettings.parse({ ...JSON.parse(readFileSync(file, "utf8")), ...overrides });
  return { values, file };
}

export function toSettingsValues(values: LocalSettings): SettingsValues {
  const { maintenance, minAppVersion, season, devIdentity, matchingPhase, tokenKeys, tokenLifetime, tables } = values;
  return {
    maintenance,
    minAppVersion,
    season,
    tokenKeys,
    tokenLifetime,
    tables,
    ...(devIdentity ? { devIdentity } : {}),
    ...(matchingPhase ? { matchingPhase } : {}),
  };
}

/**
 * The settings port of the local backend: re-reads the file at most once a minute, like the cloud reads the
 * Parameter Store, so the maintenance switch or the minimum version can be tried without a restart.
 * Port and database address are read once at start.
 */
export function localSettingsPort(clock: Clock, overrides: Partial<LocalSettings> = {}): Settings {
  return refreshingSettings(async () => toSettingsValues(loadLocalSettings(overrides).values), clock);
}
