/** Loads and validates all JSON data from /data (Node only). */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameData, type GameData, type RawData } from "../src/gamedata.js";
import { buildMeta, type Meta } from "../src/meta.js";

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

/** The raw JSON of /data, before validation (balancing tools patch this and build the game data from it). */
export function loadRawData(dataDir = DATA_DIR): RawData {
  const itemDir = join(dataDir, "items");
  return {
    rules: readJson(join(dataDir, "rules.json")),
    heroes: readJson(join(dataDir, "heroes.json")),
    recipes: readJson(join(dataDir, "recipes.json")),
    glossary: readJson(join(dataDir, "glossary.json")),
    locales: Object.fromEntries(
      readdirSync(join(dataDir, "locales"))
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => [f, readJson(join(dataDir, "locales", f))]),
    ),
    itemFiles: Object.fromEntries(
      readdirSync(itemDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => [f, readJson(join(itemDir, f))]),
    ),
  };
}

export function loadGameData(dataDir = DATA_DIR): GameData {
  return buildGameData(loadRawData(dataDir));
}

/** Meta progress between runs (data/meta.json), checked against the game data. */
export function loadMeta(data: GameData = loadGameData(), dataDir = DATA_DIR): Meta {
  return buildMeta(readJson(join(dataDir, "meta.json")), data);
}

/** Optional bot ratings (data/sim/ratings.json), written by `npm run report:items -- --write-ratings`. */
export function loadRatings(dataDir = DATA_DIR): Record<string, number> {
  try {
    return JSON.parse(readFileSync(join(dataDir, "sim", "ratings.json"), "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Accent colours of the palette in docs/style.md. */
export const ART_ACCENTS = ["rust red", "deep teal", "mustard", "moss", "copper", "bone"] as const;

/** Picture data per item for the artwork (data/item-art.json). */
export interface ItemArt {
  /** One line for the asset list: what the icon shows, ending in "Accent: <palette colour>." */
  brief: string;
  /** The full picture description for image prompts (English, not shown in the game). Self-contained: it repeats what the brief says. */
  description: string;
}

export function loadItemArt(dataDir = DATA_DIR): Record<string, ItemArt> {
  return readJson(join(dataDir, "item-art.json")) as Record<string, ItemArt>;
}

/** Number of backpack cells an item covers. */
export const cellCount = (shape: readonly string[]) =>
  shape
    .join("")
    .split("")
    .filter((c) => c === "#").length;

/**
 * Word limit of a picture description by item size: an item drawn at 44 px per cell can only carry a few details.
 * 1 cell: one shape and one feature; 2-3 cells: up to two features; 4-5 cells: up to three; 6+ cells: up to four.
 */
export const ART_WORD_LIMITS: readonly { maxCells: number; words: number }[] = [
  { maxCells: 1, words: 30 },
  { maxCells: 3, words: 45 },
  { maxCells: 5, words: 60 },
  { maxCells: Infinity, words: 75 },
];
export const artWordLimit = (cells: number) => ART_WORD_LIMITS.find((l) => cells <= l.maxCells)!.words;

/** Problems with the picture data: items without a brief or description, entries for unknown items, briefs without an accent colour from the palette, descriptions too long for the item's size. */
export function checkItemArt(data: GameData, art: Record<string, ItemArt>, accents: readonly string[] = ART_ACCENTS): string[] {
  const problems: string[] = [];
  for (const it of data.itemList) {
    const a = art[it.id];
    if (!a?.brief?.trim()) problems.push(`item-art.json: no picture brief for ${it.id}`);
    if (!a?.description?.trim()) {
      problems.push(`item-art.json: no picture description for ${it.id}`);
      continue;
    }
    const words = a.description.trim().split(/\s+/).length,
      limit = artWordLimit(cellCount(it.shape));
    if (words > limit) problems.push(`item-art.json ${it.id}: description has ${words} words, ${cellCount(it.shape)} cell(s) allow ${limit}`);
    if (/Accent:/.test(a.description)) problems.push(`item-art.json ${it.id}: the accent colour belongs in the brief, not in the description`);
  }
  for (const [id, a] of Object.entries(art)) {
    if (!data.items.has(id)) problems.push(`item-art.json: ${id} is not an item`);
    const accent = /Accent: ([a-z ]+)\.$/.exec(a.brief ?? "")?.[1];
    if (!accent || !accents.includes(accent)) problems.push(`item-art.json ${id}: the brief must end with "Accent: <palette colour>." (${accents.join(", ")})`);
  }
  return problems;
}
