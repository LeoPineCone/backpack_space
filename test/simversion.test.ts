import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, buildGameData, type RawData } from "@backpack-space/core";
import { loadRawData } from "@backpack-space/core/node";

const raw = loadRawData();
const copy = (): RawData => structuredClone(raw);
const versionOf = (r: RawData) => buildGameData(r).simVersion;
const base = versionOf(raw);
type ItemJson = { id: string; name: string; cost: number; damage?: [number, number] };
const firstWeapon = (r: RawData): ItemJson => (r.itemFiles["weapons.json"] as ItemJson[]).find((i) => i.damage)!;

describe("simulation version", () => {
  it("is the engine version plus a hash of the data", () => {
    expect(base).toMatch(new RegExp(`^${ENGINE_VERSION}\\.[0-9a-f]{14}$`));
  });

  it("is the same for the same data, built twice", () => {
    expect(versionOf(copy())).toBe(base);
  });

  it("does not depend on the order of keys in the JSON", () => {
    const r = copy();
    r.rules = Object.fromEntries(Object.entries(r.rules as Record<string, unknown>).reverse());
    expect(versionOf(r)).toBe(base);
  });

  it("changes when an item value changes", () => {
    const r = copy();
    const w = firstWeapon(r);
    w.damage = [w.damage![0], w.damage![1] + 1];
    expect(versionOf(r)).not.toBe(base);
  });

  it("changes when a rule changes", () => {
    const r = copy();
    const rules = r.rules as { goldPerRound: number[] };
    rules.goldPerRound[0]! += 1;
    expect(versionOf(r)).not.toBe(base);
  });

  it("changes when a recipe changes", () => {
    const r = copy();
    (r.recipes as unknown[]).pop();
    expect(versionOf(r)).not.toBe(base);
  });

  it("does not change with text-only data: names, locales, glossary", () => {
    const r = copy();
    firstWeapon(r).name = "Renamed Weapon";
    const heroes = r.heroes as { name: string; title: string; focus: string }[];
    heroes[0]!.name = "Someone";
    heroes[0]!.title = "Another title";
    heroes[0]!.focus = "Another focus sentence";
    const de = r.locales["de.json"] as Record<string, string>;
    const key = Object.keys(de)[0]!;
    de[key] = `${de[key]} (changed)`;
    const glossary = r.glossary as { groups: { title: string }[] };
    glossary.groups[0]!.title = "Another group title";
    expect(versionOf(r)).toBe(base);
  });
});
