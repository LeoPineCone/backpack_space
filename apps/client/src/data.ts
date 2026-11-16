/** Bundles the game data for the client (the Node tools read the same files through @backpack-space/core/node). */
import { buildGameData, buildMeta, type Build, type GameData, type Meta } from "@backpack-space/core";
import rules from "../../../data/rules.json";
import heroes from "../../../data/heroes.json";
import recipes from "../../../data/recipes.json";
import glossary from "../../../data/glossary.json";
import meta from "../../../data/meta.json";
import ghosts from "../../../playground/ghosts.json";

declare global {
  interface ImportMeta {
    glob<T = unknown>(pattern: string, options: { eager: true; import: "default" }): Record<string, T>;
  }
}

const itemModules = import.meta.glob<unknown>("../../../data/items/*.json", { eager: true, import: "default" });
const itemFiles: Record<string, unknown> = {};
for (const path of Object.keys(itemModules).sort()) itemFiles[path.slice(path.lastIndexOf("/") + 1)] = itemModules[path];
const localeModules = import.meta.glob<unknown>("../../../data/locales/*.json", { eager: true, import: "default" });
const locales: Record<string, unknown> = {};
for (const path of Object.keys(localeModules).sort()) locales[path.slice(path.lastIndexOf("/") + 1)] = localeModules[path];

export const DATA: GameData = buildGameData({ rules, heroes, recipes, glossary, itemFiles, locales });

/** Progress between runs: hero levels, planet track, season pass, leagues (data/meta.json). */
export const META: Meta = buildMeta(meta, DATA);

/** Stored bot builds to fight against until there is a server; index 0 = round 1. Regenerate with `npm run play:ghosts`. */
export const GHOSTS: Build[][] = ghosts as unknown as Build[][];
