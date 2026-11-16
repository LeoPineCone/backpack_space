import { describe, expect, it } from "vitest";
import { CHOOSE, anchorPath, botSpecial, compile, newBot, offerWeight, onPath, Rng, type Build } from "@backpack-space/core";
import { loadGameData } from "@backpack-space/core/node";

const data = loadGameData();

describe("path anchors", () => {
  it("every path of every hero has exactly one anchor among its round-4 hero items", () => {
    for (const h of data.heroList) for (const p of h.paths) expect(h.artifacts.filter((a) => data.items.get(a)!.path === p.id)).toHaveLength(1);
  });
  it("hero items belong to the path they name; core items to none", () => {
    const rook = data.heroes.get("rook")!;
    const fortress = rook.paths.find((p) => p.id === "fortress")!;
    expect(onPath(data.items.get("nanite_swarm")!, fortress)).toBe(true);
    expect(onPath(data.items.get("perpetual_engine")!, fortress)).toBe(false);
    expect(onPath(data.items.get("welding_arm")!, fortress)).toBe(false);
  });
  it("a bot without a fixed path commits with the anchor it takes after round 4", () => {
    const bot = newBot(data, "quill", new Rng(1), CHOOSE);
    botSpecial(data, bot, 4, new Rng(2));
    const took = bot.loose[bot.loose.length - 1]!;
    expect(bot.path).toBe(data.items.get(took)!.path);
  });
  it("the shop leans to the path of an owned anchor, and only to it", () => {
    const w = data.rules.shop.anchorPathWeight;
    expect(anchorPath(data, ["space_pup", "elder_tusk"])).toBe("beasts");
    const shares = new Map<string, number>();
    expect(offerWeight(data, data.items.get("moon_bear")!, shares, "beasts")).toBeCloseTo(offerWeight(data, data.items.get("moon_bear")!, shares) * w);
    expect(offerWeight(data, data.items.get("burrow_rat")!, shares, "beasts")).toBeCloseTo(offerWeight(data, data.items.get("burrow_rat")!, shares));
  });
});

describe("melee / ranged filters", () => {
  it("Star Forge buffs only melee weapons on its stars", () => {
    const hero = data.heroList[0]!;
    // Star Forge `*.##.*`: stars two cells left and right of its two cells
    const at = (melee: string, x: number): Build => ({ hero: hero.id, round: 9, bags: [{ item: "field_pack", x: 0, y: 0, rot: 0 }, { item: "field_pack", x: 3, y: 0, rot: 0 }, { item: "field_pack", x: 6, y: 0, rot: 0 }], items: [{ item: "star_forge", x: 2, y: 0, rot: 0 }, { item: melee, x, y: 0, rot: 0 }] });
    const def = data.items.get("star_forge")!;
    expect(def.shape).toEqual(["*.##.*"]);
    const melee = data.itemList.find((i) => i.range === "melee" && i.shape.length === 2 && i.shape.every((r) => r === "#") && !i.hero)!;
    const ranged = data.itemList.find((i) => i.range === "ranged" && i.shape.length === 2 && i.shape.every((r) => r === "#") && !i.hero)!;
    const dmg = (id: string) => { const c = compile(at(id, 0), data); return c.items.find((x) => x.def.id === id)!.dmg![0]; };
    expect(dmg(melee.id)).toBe(melee.damage![0] + 5);
    expect(dmg(ranged.id)).toBe(ranged.damage![0]);
  });
});
