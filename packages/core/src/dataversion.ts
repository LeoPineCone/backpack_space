/**
 * The data version (CORE-08, docs/matchmaking.md "Versions"): `major.minor` in data/rules.json.
 *  - minor goes up for numbers and texts (damage, prices, descriptions): stored backpacks stay matchable
 *  - major goes up when an item is removed, a shape changes or a rule changes: stored backpacks are no longer matched
 * The fight always uses the current data, so a stored backpack only has to be valid under it.
 */
import type { GameData } from "./gamedata.js";

export interface DataVersion {
  major: number;
  minor: number;
}

export function parseDataVersion(v: string): DataVersion | null {
  const m = /^(\d+)\.(\d+)$/.exec(v);
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

/** Can a backpack stored under `stored` be matched against a player on `own`? Only when the major is the same. */
export function canMatch(stored: string, own: string): boolean {
  const a = parseDataVersion(stored);
  const b = parseDataVersion(own);
  return a !== null && b !== null && a.major === b.major;
}

/**
 * What a major step is about: the items and bags with their shapes, the recipes and the grid. When an entry of an
 * earlier list is gone (an item removed, a shape or recipe changed), old backpacks may be invalid and the major has to
 * go up; new entries alone are fine (checked by test/dataversion.test.ts against data/sim/data-major.json).
 */
export function majorEntries(data: GameData): string[] {
  const items = data.itemList.map((i) => `item ${i.id} ${i.shape.join("/")}`);
  const recipes = data.recipes.map((r) => `recipe ${[...r.in].sort().join("+")}=${r.out}`);
  return [`grid ${data.rules.grid.w}x${data.rules.grid.h}`, ...items, ...recipes].sort();
}
