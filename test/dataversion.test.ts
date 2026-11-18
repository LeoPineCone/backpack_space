import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadGameData } from "../packages/core/node/load.js";
import { canMatch, majorEntries, parseDataVersion, simVersionOf } from "../packages/core/src/index.js";

const data = loadGameData();

describe("data version", () => {
  it("is major.minor and part of the game data", () => {
    expect(parseDataVersion(data.dataVersion)).not.toBeNull();
    expect(data.dataVersion).toBe(data.rules.dataVersion);
  });

  it("matches stored backpacks of the same major only", () => {
    expect(canMatch("1.0", "1.0")).toBe(true);
    expect(canMatch("1.0", "1.7")).toBe(true);
    expect(canMatch("1.9", "1.2")).toBe(true);
    expect(canMatch("1.3", "2.0")).toBe(false);
    expect(canMatch("2.0", "1.3")).toBe(false);
    expect(canMatch("10.0", "1.0")).toBe(false);
  });

  it("matches nothing with a malformed version", () => {
    for (const bad of ["", "1", "1.0.0", "a.b", "1.x", " 1.0"]) {
      expect(canMatch(bad, "1.0")).toBe(false);
      expect(canMatch("1.0", bad)).toBe(false);
    }
  });

  it("does not change the simulation version (it names the data, it is not part of a fight)", () => {
    const input = { rules: data.rules, heroes: data.heroList, items: data.itemList, recipes: data.recipes };
    expect(simVersionOf({ ...input, rules: { ...data.rules, dataVersion: "9.9" } })).toBe(simVersionOf(input));
  });

  it("raises the major when an item, a shape or a recipe of the last major is gone", () => {
    const recorded = JSON.parse(readFileSync("data/sim/data-major.json", "utf8")) as { major: number; entries: string[] };
    const now = new Set(majorEntries(data));
    const gone = recorded.entries.filter((e) => !now.has(e));
    const major = parseDataVersion(data.dataVersion)!.major;
    if (major === recorded.major)
      expect(gone, "Stored backpacks may no longer be valid: raise the major of dataVersion in data/rules.json, then run npm run data:major.").toEqual([]);
    else expect(major, "The major was raised: run npm run data:major to record it.").toBe(recorded.major);
  });

  it("sees a removed item, a changed shape and a changed recipe, but not a new item or a new price", () => {
    const base = majorEntries(data);
    const missing = (d: typeof data) => base.filter((e) => !majorEntries(d).includes(e)).length;
    const [first, ...rest] = data.itemList;
    expect(missing({ ...data, itemList: rest })).toBeGreaterThan(0);
    expect(missing({ ...data, itemList: [{ ...first!, shape: [...first!.shape, "#"] }, ...rest] })).toBeGreaterThan(0);
    expect(missing({ ...data, recipes: data.recipes.slice(1) })).toBeGreaterThan(0);
    expect(missing({ ...data, itemList: [{ ...first!, cost: first!.cost + 1 }, ...rest, { ...first!, id: "brand_new" }] })).toBe(0);
  });
});
