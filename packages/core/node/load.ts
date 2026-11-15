/** Loads and validates all JSON data from /data (Node only). */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameData, type GameData } from "../src/gamedata.js";

/** repository root (this file lives in packages/core/node/) */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const DATA_DIR = join(ROOT, "data");

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`Cannot read ${path}: ${(e as Error).message}`);
  }
}

export function loadGameData(dataDir = DATA_DIR): GameData {
  const itemDir = join(dataDir, "items");
  return buildGameData({
    rules: readJson(join(dataDir, "rules.json")),
    heroes: readJson(join(dataDir, "heroes.json")),
    recipes: readJson(join(dataDir, "recipes.json")),
    itemFiles: Object.fromEntries(readdirSync(itemDir).filter((f) => f.endsWith(".json")).sort().map((f) => [f, readJson(join(itemDir, f))])),
  });
}

/** Optional bot ratings (data/sim/ratings.json), written by `npm run report:items -- --write-ratings`. */
export function loadRatings(dataDir = DATA_DIR): Record<string, number> {
  try { return JSON.parse(readFileSync(join(dataDir, "sim", "ratings.json"), "utf8")) as Record<string, number>; } catch { return {}; }
}
