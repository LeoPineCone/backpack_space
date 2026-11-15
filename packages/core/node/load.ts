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
    glossary: readJson(join(dataDir, "glossary.json")),
    locales: Object.fromEntries(readdirSync(join(dataDir, "locales")).filter((f) => f.endsWith(".json")).sort().map((f) => [f, readJson(join(dataDir, "locales", f))])),
    itemFiles: Object.fromEntries(readdirSync(itemDir).filter((f) => f.endsWith(".json")).sort().map((f) => [f, readJson(join(itemDir, f))])),
  });
}

/** Optional bot ratings (data/sim/ratings.json), written by `npm run report:items -- --write-ratings`. */
export function loadRatings(dataDir = DATA_DIR): Record<string, number> {
  try { return JSON.parse(readFileSync(join(dataDir, "sim", "ratings.json"), "utf8")) as Record<string, number>; } catch { return {}; }
}

/** Accent colours of the palette in docs/style.md. */
export const ART_ACCENTS = ["rust red", "deep teal", "mustard", "moss", "copper", "bone"] as const;

/** Picture brief per item for the artwork (data/item-art.json): what the icon shows and its accent colour. */
export function loadItemArt(dataDir = DATA_DIR): Record<string, string> {
  return readJson(join(dataDir, "item-art.json")) as Record<string, string>;
}

/** Problems with the picture briefs: items without one, briefs for unknown items, briefs without an accent colour from the palette. */
export function checkItemArt(data: GameData, art: Record<string, string>, accents: readonly string[] = ART_ACCENTS): string[] {
  const problems: string[] = [];
  for (const it of data.itemList) if (!art[it.id]?.trim()) problems.push(`item-art.json: no picture brief for ${it.id}`);
  for (const [id, brief] of Object.entries(art)) {
    if (!data.items.has(id)) problems.push(`item-art.json: ${id} is not an item`);
    const accent = /Accent: ([a-z ]+)\.$/.exec(brief)?.[1];
    if (!accent || !accents.includes(accent)) problems.push(`item-art.json ${id}: the brief must end with "Accent: <palette colour>." (${accents.join(", ")})`);
  }
  return problems;
}
