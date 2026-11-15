import { describe, expect, it } from "vitest";
import { Rng, reroll, toggleFreeze, toggleLock, pendingMerges, moveItem, buy, runReward, dropBag, dropItem, takeSpecial, findCombos, finishRound, moveBag, newRun, place, recipePartners, rollOffers, validLayout } from "@backpack-space/core";
import { loadGameData } from "@backpack-space/core/node";
import { playLobby } from "../src/sim/lobby";

const data = loadGameData();

describe("data", () => {
  it("keeps recipe chains within the limit and every crafted item reachable", () => {
    for (const it of data.itemList) expect(it.depth).toBeLessThanOrEqual(data.rules.recipes.maxDepth);
    expect(data.recipes.every((r) => r.in.length <= data.rules.recipes.maxInputs)).toBe(true);
  });
  it("contains no alcohol", () => {
    for (const it of data.itemList) expect(it.name).not.toMatch(/\b(beer|wine|rum|whisky|whiskey|vodka|liquor|ale|cocktail|booze|mead|sake|gin|brandy|cider)\b/i);
  });
});

describe("shop and run", () => {
  it("rolls the same offers for the same seed and only shop items", () => {
    const a = rollOffers(data, "rook", 6, new Rng(9)), b = rollOffers(data, "rook", 6, new Rng(9));
    expect(a).toEqual(b);
    for (const o of a) { const it = data.items.get(o.item)!; expect(it.inShop).toBe(true); expect(!it.hero || it.hero === "rook").toBe(true); }
  });
  it("buys onto a bag cell, refuses cells without a bag", () => {
    const s = newRun(data, "rook", new Rng(1));
    s.gold = 99;
    s.offers = [{ item: "rivet_gun", price: 2, sale: false }, { item: "rivet_gun", price: 2, sale: false }];
    expect(buy(s, data, 0, { x: 8, y: 6, rot: 0 })).toBe(false);
    expect(buy(s, data, 0, { x: 5, y: 4, rot: 0 })).toBe(true);
    expect(s.gold).toBe(97);
  });
  it("merges adjacent inputs after the fight, for good, and pays the salvage unit", () => {
    const s = newRun(data, "rook", new Rng(1));
    // start: welding arm at 3,2 (two cells down) and scrap metal at 4,2: adjacent
    expect(pendingMerges(data, s.bags, s.items).map((c) => c.recipe.out)).toEqual(["plasma_welder"]);
    expect(s.items.map((p) => p.item)).not.toContain("plasma_welder");
    const gold = s.gold;
    finishRound(s, data, true, new Rng(2));
    expect(s.items.map((p) => p.item)).toEqual(["plasma_welder"]);
    expect(s.merged).toEqual([{ out: "plasma_welder", in: data.recipes.find((r) => r.out === "plasma_welder")!.in }]);
    expect(s.gold).toBe(gold + data.heroes.get("rook")!.craftGold + data.rules.goldPerRound[1]!);
    // apart: nothing is due
    const t = newRun(data, "rook", new Rng(1));
    t.items[1] = { item: "scrap_metal", x: 5, y: 4, rot: 0 };
    expect(findCombos(data, t.bags, t.items)).toHaveLength(0);
  });
  it("does not merge a locked item, and keeps the lock when the item moves", () => {
    const s = newRun(data, "rook", new Rng(1));
    expect(toggleLock(s, 0)).toBe(true);
    expect(pendingMerges(data, s.bags, s.items)).toHaveLength(0);
    finishRound(s, data, false, new Rng(2));
    expect(s.items).toHaveLength(2);
    expect(s.merged).toEqual([]);
    const p = s.items[0]!;
    expect(moveItem(s, data, 0, { x: p.x, y: p.y, rot: p.rot })).toBe(true);
    expect(s.items[0]!.lock).toBe(true);
    toggleLock(s, 0);
    expect(pendingMerges(data, s.bags, s.items)).toHaveLength(1);
  });
  it("moves a bag together with the items in it", () => {
    const s = newRun(data, "quill", new Rng(1));
    expect(place(s, data, "pouch", { x: 0, y: 0, rot: 0 })).toBe(true);
    expect(place(s, data, "rivet_gun", { x: 0, y: 0, rot: 0 })).toBe(true);
    expect(moveBag(s, data, s.bags.length - 1, { x: 8, y: 6, rot: 0 })).toBe(true);
    expect(s.items[s.items.length - 1]).toMatchObject({ x: 8, y: 6 });
    expect(validLayout(data, s.bags, s.items)).toBe(true);
  });
  it("ends the run when the lives are gone and hands out the special picks", () => {
    const s = newRun(data, "ysel", new Rng(2));
    for (let i = 0; i < 4; i++) finishRound(s, data, true, new Rng(i));
    expect(s.round).toBe(5);
    expect(s.special).toHaveLength(data.rules.specials[0]!.show);
    for (let i = 0; i < data.rules.lives; i++) finishRound(s, data, false, new Rng(i));
    expect(s.over).toBe(true);
  });
});

describe("bots", () => {
  it("play a whole lobby by the rules, reproducibly", () => {
    const a = playLobby(data, 5, { size: 8 }), b = playLobby(data, 5, { size: 8 });
    expect(a.fights.map((f) => f.res.winner)).toEqual(b.fights.map((f) => f.res.winner));
    for (const s of a.seats) {
      expect(s.endedAfter).toBeGreaterThan(0);
      for (const bd of s.builds) expect(validLayout(data, bd.bags, bd.items)).toBe(true);
    }
  });
});

describe("recipe partners", () => {
  it("offers parts that fit what the player owns", () => {
    const partners = recipePartners(data, "rook", 1, ["laser_pistol"]).map((i) => i.id);
    expect(partners).toContain("crystal_shard");
    expect(partners).toContain("laser_pistol");
    // nothing owned, nothing to lean towards; another hero's parts never show up
    expect(recipePartners(data, "rook", 1, [])).toHaveLength(0);
    expect(recipePartners(data, "rook", 6, ["mushroom_cluster"]).some((i) => i.hero && i.hero !== "rook")).toBe(false);
  });
  it("keeps frozen offers through a reroll and into the next round, and never shows more bags than allowed", () => {
    const rng = new Rng(4);
    const s = newRun(data, "quill", rng);
    s.gold = 50;
    const kept = s.offers[2]!.item;
    expect(toggleFreeze(s, 2)).toBe(true);
    reroll(s, data, rng);
    expect(s.offers[2]!.item).toBe(kept);
    finishRound(s, data, true, rng);
    expect(s.offers[2]!.item).toBe(kept);
    expect(s.offers.length).toBe(data.rules.shop.slots);
    for (let i = 0; i < s.offers.length; i++) if (!s.offers[i]!.frozen) toggleFreeze(s, i);
    expect(s.offers.filter((o) => o?.frozen).length).toBe(data.rules.shop.slots);
    for (let i = 0; i < 200; i++) expect(rollOffers(data, "rook", 6, rng).filter((o) => data.items.get(o.item)!.isBag).length).toBeLessThanOrEqual(data.rules.shop.maxBags);
  });
  it("offers more of what the player already carries", () => {
    const rng = new Rng(5);
    const pets = ["space_pup", "burrow_rat", "guard_goose", "space_pup"];
    const count = (owned: string[]) => { let n = 0; for (let i = 0; i < 400; i++) for (const o of rollOffers(data, "quill", 6, rng, owned)) if (data.items.get(o.item)!.tags.includes("pet")) n++; return n; };
    expect(count(pets)).toBeGreaterThan(count([]) * 1.2);
  });
});

describe("loose items", () => {
  it("stops loose buying at the limit, but never gifts, take-outs or the fight", () => {
    const s = newRun(data, "rook", new Rng(3));
    s.gold = 999;
    const limit = data.rules.shop.looseLimit;
    s.loose = Array.from({ length: limit }, () => "space_pup");
    const slot = s.offers.findIndex((o) => o);
    expect(buy(s, data, slot)).toBe(false);
    s.special = ["space_pup"];
    takeSpecial(s, 0);
    dropItem(s, 0);
    expect(s.loose.length).toBe(limit + 2);
    s.loose.pop(); s.loose.pop(); s.loose.pop();
    expect(buy(s, data, slot)).toBe(true);
  });
  it("drops the items of a bag that is taken out", () => {
    const s = newRun(data, "flora", new Rng(3));
    const before = s.items.length + s.bags.length;
    dropBag(s, data, 0);
    expect(s.loose.length).toBeGreaterThan(1);
    expect(s.items.length + s.bags.length + s.loose.length).toBe(before);
    expect(validLayout(data, s.bags, s.items)).toBe(true);
  });
  it("pays rounds played plus lives left at the end of a run", () => {
    const rng = new Rng(5);
    const s = newRun(data, "ysel", rng);
    finishRound(s, data, true, rng); finishRound(s, data, false, rng);
    expect(s.results).toEqual([true, false]);
    expect(runReward(s)).toBe(2 + data.rules.lives - 1);
  });
});
