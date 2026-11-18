import { describe, expect, it } from "vitest";
import { loadGameData } from "@backpack-space/core/node";
import { checkReference, type ReferenceList } from "./helpers/reference";
import list from "../data/sim/reference-fights.json" with { type: "json" };

const data = loadGameData();
const reference = list as unknown as ReferenceList;

// QA-06: the same list runs in Chromium and WebKit (e2e/reference-fights.e2e.ts). A change that alters a result on
// purpose regenerates the list with `npm run sim:reference` in the same pull request.
describe("reference fights", () => {
  it("has about 20 fights covering every hero", () => {
    expect(reference.fights.length).toBeGreaterThanOrEqual(15);
    const heroes = new Set(reference.fights.flatMap((f) => [f.a.hero, f.b.hero]));
    expect([...heroes].sort()).toEqual(data.heroList.map((h) => h.id).sort());
  });

  it("come out exactly as stored, with the stored simulation version", () => {
    expect(checkReference(data, reference)).toEqual([]);
  });
});
