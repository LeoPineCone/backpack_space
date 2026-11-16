import { describe, expect, it } from "vitest";
import { Rng, starLinks, describeItem, reroll, toggleFreeze, toggleLock, pendingMerges, moveItem, buy, runReward, dropBag, dropItem, takeSpecial, findCombos, finishRound, moveBag, newRun, place, recipePartners, mergePartners, rollOffers, validLayout } from "@backpack-space/core";
import { checkItemArt, loadGameData, loadItemArt } from "@backpack-space/core/node";
import { playLobby } from "../src/sim/lobby";

const data = loadGameData();

describe("data", () => {
  it("keeps recipe chains within the limit and every crafted item reachable", () => {
    for (const it of data.itemList) expect(it.depth).toBeLessThanOrEqual(data.rules.recipes.maxDepth);
    expect(data.recipes.every((r) => r.in.length <= data.rules.recipes.maxInputs)).toBe(true);
  });
  it("has a picture brief with a palette accent and a description within its word limit for every item", () => {
    expect(checkItemArt(data, loadItemArt())).toEqual([]);
  });
  it("keeps picture descriptions of small items short", () => {
    const art = loadItemArt();
    const long = { ...art, fang_dagger: { ...art.fang_dagger!, description: "word ".repeat(31).trim() } };
    expect(checkItemArt(data, long)).toEqual(["item-art.json fang_dagger: description has 31 words, 1 cell(s) allow 30"]);
  });
  it("names every status and type in the rules text the way the glossary does", () => {
    for (const id of ["shield", "burn", "overclock"]) expect(data.glossary.byId.get(id)!.de.length).toBeGreaterThan(0);
    expect(describeItem(data.items.get("scrap_metal")!, data).join(" ")).toMatch(new RegExp(`^Battle start: gain \\d+ ${data.glossary.byId.get("shield")!.en}\\.$`));
    // items with a cooldown say "Every 3 s: ..." instead of "Activates every 3 s. On use: ..."
    for (const it of data.itemList) if (it.cooldown && !it.damage) expect(describeItem(it, data).join(" ")).toMatch(/Every [\d.]+ s: /);
  });
  it("keeps one-cell weapons rare among the shop weapons (sizes follow the thing: .claude/skills/item-design)", () => {
    const weapons = data.itemList.filter((i) => i.tags[0] === "weapon" && !i.crafted && i.rarity !== "artifact");
    expect(weapons.filter((i) => i.size === 1).length / weapons.length).toBeLessThanOrEqual(0.25);
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
    s.offers = [{ item: "fang_dagger", price: 2, sale: false }, { item: "fang_dagger", price: 2, sale: false }];
    expect(buy(s, data, 0, { x: 8, y: 6, rot: 0 })).toBe(false);
    expect(buy(s, data, 0, { x: 5, y: 4, rot: 0 })).toBe(true);
    expect(s.gold).toBe(97);
  });
  it("merges adjacent inputs after the fight, for good, and pays the salvage unit", () => {
    const s = newRun(data, "rook", new Rng(1));
    // start: welding arm at 3,2 (two cells down) and scrap metal at 5,2: apart, so nothing merges on its own
    expect(findCombos(data, s.bags, s.items)).toHaveLength(0);
    // moved next to the welding arm: due after the fight
    expect(moveItem(s, data, 1, { x: 4, y: 2, rot: 0 })).toBe(true);
    expect(pendingMerges(data, s.bags, s.items).map((c) => c.recipe.out)).toEqual(["plasma_welder"]);
    expect(s.items.map((p) => p.item)).not.toContain("plasma_welder");
    const gold = s.gold;
    finishRound(s, data, true, new Rng(2));
    expect(s.items.map((p) => p.item)).toEqual(["plasma_welder"]);
    expect(s.merged).toEqual([{ out: "plasma_welder", in: data.recipes.find((r) => r.out === "plasma_welder")!.in }]);
    expect(s.gold).toBe(gold + data.heroes.get("rook")!.craftGold + data.rules.goldPerRound[1]!);
  });
  it("does not merge a locked item, and keeps the lock when the item moves", () => {
    const s = newRun(data, "rook", new Rng(1));
    expect(moveItem(s, data, 1, { x: 4, y: 2, rot: 0 })).toBe(true);
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
    expect(place(s, data, "fang_dagger", { x: 0, y: 0, rot: 0 })).toBe(true);
    expect(moveBag(s, data, s.bags.length - 1, { x: 8, y: 6, rot: 0 })).toBe(true);
    expect(s.items[s.items.length - 1]).toMatchObject({ x: 8, y: 6 });
    expect(validLayout(data, s.bags, s.items)).toBe(true);
  });
  it("ends the run when the lives are gone and hands out the special picks", () => {
    const s = newRun(data, "ysel", new Rng(2));
    const first = data.rules.specials[0]!.afterRound;
    for (let i = 0; i < first; i++) finishRound(s, data, true, new Rng(i));
    expect(s.round).toBe(first + 1);
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

describe("merge partners", () => {
  it("links items that hold every part of a recipe, wherever they lie", () => {
    const p = mergePartners(data, ["laser_pistol", "crystal_shard", null, "space_pup"]);
    expect([...p[0]!]).toEqual([1]);
    expect([...p[1]!]).toEqual([0]);
    expect(p[2]!.size + p[3]!.size).toBe(0);
  });
  it("needs a second copy for a recipe that takes the same item twice, and leaves locked (null) items out", () => {
    expect(mergePartners(data, ["laser_pistol"])[0]!.size).toBe(0);
    expect([...mergePartners(data, ["laser_pistol", "laser_pistol"])[0]!]).toEqual([1]);
    expect(mergePartners(data, ["laser_pistol", null])[0]!.size).toBe(0);
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
    const s = newRun(data, "venn", new Rng(3));
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

describe("bots merge like players", () => {
  it("fight with the separate inputs and merge only what lay together, after the fight", () => {
    const l = playLobby(data, 12, { size: 8, immortal: true });
    let merges = 0;
    for (const s of l.seats) for (let r = 0; r < s.builds.length - 1; r++) {
      const crafted = s.bot.log[r]!.crafted;
      // every result merged after round r+1 came from inputs that lay together in that round's build
      const due = pendingMerges(data, s.builds[r]!.bags, s.builds[r]!.items).map((c) => c.recipe.out);
      expect([...crafted].sort()).toEqual([...due].sort());
      merges += crafted.length;
    }
    expect(merges).toBeGreaterThan(10);
  });
});

describe("stars and saving", () => {
  it("lists the stars that have an item on them and whether their effect counts it", () => {
    const weapon = data.itemList.find((it) => it.tags.includes("weapon") && data.shape(it.id, 0).cells.length === 1 && !it.crafted)!;
    const other = data.itemList.find((it) => !it.isBag && !it.tags.includes("weapon") && data.shape(it.id, 0).cells.length === 1 && !it.crafted)!;
    // a roomy layout: every bag of the grid filled, so placing only depends on the items
    const bag = data.itemList.find((it) => it.isBag && data.shape(it.id, 0).cells.length === 1)!;
    const { w, h } = data.rules.grid;
    const bags = Array.from({ length: w * h }, (_, k) => ({ item: bag.id, x: k % w, y: Math.floor(k / w), rot: 0 }));
    // crystal_shard: "*#*", its stars make starred weapons stronger
    const items = [{ item: "crystal_shard", x: 3, y: 2, rot: 0 }, { item: weapon.id, x: 2, y: 2, rot: 0 }, { item: other.id, x: 4, y: 2, rot: 0 }];
    const links = starLinks(data, bags, items);
    expect(links.filter((l) => l.from === 0).sort((a, b) => a.to - b.to)).toEqual([
      { from: 0, to: 1, star: [2, 2], active: true },
      { from: 0, to: 2, star: [4, 2], active: false },
    ]);
  });
  it("continues the same random sequence from a saved state", () => {
    const a = new Rng(42);
    a.next(); a.next();
    const b = new Rng(a.state);
    expect([b.next(), b.next()]).toEqual([a.next(), a.next()]);
  });
});
