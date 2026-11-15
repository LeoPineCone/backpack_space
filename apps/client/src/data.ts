/** Bundles the game data for the client (the Node tools read the same files through @backpack-space/core/node). */
import { buildGameData, type Build, type GameData } from "@backpack-space/core";
import rules from "../../../data/rules.json";
import heroes from "../../../data/heroes.json";
import recipes from "../../../data/recipes.json";
import glossary from "../../../data/glossary.json";
import ghosts from "../../../playground/ghosts.json";

declare global {
  interface ImportMeta {
    glob<T = unknown>(pattern: string, options: { eager: true; import: "default" }): Record<string, T>;
  }
}

const itemModules = import.meta.glob<unknown>("../../../data/items/*.json", { eager: true, import: "default" });
const itemFiles: Record<string, unknown> = {};
for (const path of Object.keys(itemModules).sort()) itemFiles[path.slice(path.lastIndexOf("/") + 1)] = itemModules[path];

export const DATA: GameData = buildGameData({ rules, heroes, recipes, glossary, itemFiles });

/** Stored bot builds to fight against until there is a server; index 0 = round 1. Regenerate with `npm run play:ghosts`. */
export const GHOSTS: Build[][] = ghosts as unknown as Build[][];
