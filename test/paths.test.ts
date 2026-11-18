import { describe, expect, it } from "vitest";
import { loadGameData } from "@backpack-space/core/node";
import { aggregatePaths, blockCount, blockSe, boostPath, measurePathLobby, type SeatStat } from "../src/sim/paths";

const seat = (key: string, w: number, n: number): SeatStat => ({
  key,
  w,
  n,
  lw: w,
  ln: n,
  dmg: { weapon: 0, direct: 0, burn: 0, toxin: 0, spikes: 0 },
  kept: 0,
  fights: 0,
  secs: 0,
  commit: null,
  wins: 0,
  alive: false,
  mech: { weapon: 0, pet: 0, shield: 0, count: 0, debuff: 0, direct: 0, burn: 0, toxin: 0, spikes: 0 },
  top: 0,
  onPath: 0,
  lateDmg: 0,
  dealers: 0,
  attacks: 0,
});

describe("paths measurement", () => {
  it("takes the standard error from blocks of lobbies", () => {
    expect(blockCount(240)).toBe(10);
    expect(blockCount(12)).toBe(4);
    expect(blockSe([0.5, 0.5, 0.5])).toBe(0);
    // 12 lobbies in 4 blocks of 3: block shares 1, 0, 1, 0 -> p 0.5, sd 0.577, se 0.289
    const lobbies = Array.from({ length: 12 }, (_, i) => [seat("a/x", Math.floor(i / 3) % 2 ? 0 : 4, 4)]);
    const g = aggregatePaths(lobbies).get("a/x")!;
    expect(g.all.p).toBe(0.5);
    expect(g.all.blocks).toEqual([1, 0, 1, 0]);
    expect(g.all.se).toBeCloseTo(0.2887, 3);
  });

  it("adds every bot to its hero as well", () => {
    const groups = aggregatePaths([
      [seat("a/x", 3, 4), seat("a/", 1, 4)],
      [seat("a/x", 1, 4), seat("a/", 3, 4)],
    ]);
    expect(groups.get("a/*")!.all.p).toBe(0.5);
    expect(groups.get("a/*")!.seats).toBe(4);
  });

  it("plays the same lobby the same way", () => {
    const data = loadGameData();
    expect(JSON.stringify(measurePathLobby(data, 3, 0))).toBe(JSON.stringify(measurePathLobby(data, 3, 0)));
  });

  it("boosts only the hero's own items of a path", () => {
    const data = loadGameData();
    const before = data.items.get("venus_mantrap")!.damage!;
    const touched = boostPath(data, "venn/jungle", 25);
    expect(touched).toContain("venus_mantrap");
    expect(touched.every((id) => data.items.get(id)!.hero === "venn")).toBe(true);
    expect(data.items.get("venus_mantrap")!.damage![0]).toBeGreaterThan(before[0]);
  });
});
