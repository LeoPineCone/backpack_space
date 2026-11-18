/**
 * Local settings: `apps/backend/local/settings.json` (not committed). Without it the example file beside it is used,
 * so a fresh checkout starts. In the cloud the same values come from Parameter Store.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Settings, SettingsValues } from "../src/ports/index.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SETTINGS_FILE = join(here, "settings.json");
export const EXAMPLE_FILE = join(here, "settings.example.json");

export const LocalSettings = z
  .object({
    port: z.number().int().min(0).max(65535),
    dynamodb: z.object({ endpoint: z.url(), region: z.string().min(1) }).strict(),
    maintenance: z.object({ on: z.boolean(), textKey: z.string().optional() }).strict(),
    minAppVersion: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/),
    devIdentity: z.boolean().optional(),
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

/** The settings port over fixed local values (the file is read once at start). */
export function fixedSettings(values: LocalSettings): Settings {
  const { maintenance, minAppVersion, devIdentity, tokenKeys, tokenLifetime, tables } = values;
  const v: SettingsValues = { maintenance, minAppVersion, tokenKeys, tokenLifetime, tables, ...(devIdentity ? { devIdentity } : {}) };
  return { get: async () => v };
}
