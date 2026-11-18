import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadGameData } from "../packages/core/node/load.js";
import {
  act,
  applyAction,
  buildOf,
  checkBackpack,
  finishRound,
  newRun,
  validLayout,
  type Build,
  type RunState,
  type Spot,
} from "../packages/core/src/index.js";
import { playLobby } from "../src/sim/lobby.js";

const data = loadGameData();
/** A spot where the item fits into the backpack, or null. */
function spotFor(s: RunState, item: string): Spot | null {
  for (let y = 0; y < data.rules.grid.h; y++)
    for (let x = 0; x < data.rules.grid.w; x++)
      for (let rot = 0; rot < 4; rot++) if (validLayout(data, s.bags, [...s.items, { item, x, y, rot }])) return { x, y, rot };
  return null;
}

const reasonOf = (b: Build, round = b.round) => {
  const r = checkBackpack(data, b, round);
  return r.ok ? "ok" : r.reason;
};

describe("plausibility of a backpack", () => {
  it("lets every build of bot lobbies through, in every round", () => {
    let n = 0;
    for (const seed of [1, 2, 3]) {
      const lobby = playLobby(data, seed, { size: 8, immortal: true });
      for (const seat of lobby.seats)
        for (const b of seat.builds) {
          const r = checkBackpack(data, b, b.round);
          expect(r, `seed ${seed}, ${b.hero}, round ${b.round}`).toEqual({ ok: true });
          n++;
        }
    }
    expect(n).toBe(3 * 8 * data.rules.rounds);
  });

  it("lets the stored bot builds of the preview through", () => {
    const ghosts = JSON.parse(readFileSync("playground/ghosts.json", "utf8")) as Build[][];
    for (const round of ghosts) for (const b of round) expect(checkBackpack(data, b, b.round), `${b.hero} round ${b.round}`).toEqual({ ok: true });
  });

  it("lets a run played by the player's rules through", () => {
    for (const hero of data.heroList.map((h) => h.id)) {
      const s: RunState = newRun(data, hero, 99);
      while (!s.over) {
        if (s.special) applyAction(s, data, act.pick(0));
        for (let slot = 0; slot < s.offers.length; slot++) {
          const o = s.offers[slot];
          if (!o || o.price > s.gold || data.items.get(o.item)!.isBag) continue;
          const spot = spotFor(s, o.item);
          if (spot) applyAction(s, data, act.buy(slot, spot));
        }
        expect(checkBackpack(data, buildOf(s), s.round), `${hero} round ${s.round}`).toEqual({ ok: true });
        finishRound(s, data, s.round % 2 === 0);
      }
    }
  });

  describe("refuses each kind of manipulation", () => {
    const start = (hero = "rook"): Build => {
      const h = data.heroes.get(hero)!;
      return { hero, round: 1, bags: h.bags.map((p) => ({ ...p })), items: h.start.map((p) => ({ ...p })) };
    };
    const withItem = (b: Build, item: string, round = b.round): Build => {
      // put it where the first start item lies, so the layout stays valid
      const at = b.items[0]!;
      return { ...b, round, items: [{ item, x: at.x, y: at.y, rot: at.rot }] };
    };
    const shopItem = (rarity: string, hero?: string) =>
      data.itemList.find((i) => i.inShop && !i.isBag && i.rarity === rarity && i.size === 1 && (hero ? i.hero === hero : !i.hero))!.id;

    it("accepts the hero's start backpack", () => expect(reasonOf(start())).toBe("ok"));

    it("a round that does not match or does not exist", () => {
      expect(checkBackpack(data, start(), 2)).toEqual({ ok: false, reason: "bad_round" });
      expect(reasonOf({ ...start(), round: 0 })).toBe("bad_round");
      expect(reasonOf({ ...start(), round: data.rules.rounds + 1 })).toBe("bad_round");
    });

    it("a hero or an item that does not exist, bags and items swapped", () => {
      expect(reasonOf({ ...start(), hero: "nobody" })).toBe("unknown_hero");
      expect(reasonOf(withItem(start(), "golden_toilet"))).toBe("unknown_item");
      const b = start();
      expect(reasonOf({ ...b, items: [...b.items, { ...b.bags[0]! }] })).toBe("bag_as_item");
      expect(reasonOf({ ...b, bags: [...b.bags, { ...b.items[0]! }] })).toBe("item_as_bag");
    });

    it("a layout that does not fit", () => {
      const b = start();
      expect(reasonOf({ ...b, items: b.items.map((p) => ({ ...p, x: 40 })) })).toBe("layout");
    });

    it("a legendary in round 1 and an epic in round 2", () => {
      const legendary = data.itemList.find((i) => i.inShop && !i.isBag && i.rarity === "legendary" && !i.hero)!;
      const r = checkBackpack(data, withItem(start(), legendary.id), 1);
      expect(r.ok ? "ok" : r.reason).toMatch(/too_early|layout/);
      const epic = shopItem("epic");
      expect(reasonOf(withItem(start(), epic))).toBe("too_early");
      expect(reasonOf(withItem(start(), epic, 2))).toBe("too_early");
      expect(reasonOf(withItem(start(), epic, 3))).toBe("ok");
    });

    it("an item of another hero", () => {
      const other = shopItem("common", "venn");
      expect(checkBackpack(data, withItem(start("rook"), other), 1)).toEqual({ ok: false, reason: "other_hero", item: other });
    });

    it("a recipe result before enough fights to merge it", () => {
      const result = data.itemList.find((i) => i.depth === 2 && !i.hero && i.size <= 2)!;
      const b = start();
      const at = b.items[0]!;
      const one = { ...b, items: [{ item: result.id, x: at.x, y: at.y, rot: 0 }] };
      expect(reasonOf({ ...one, round: 2 })).toMatch(/too_early|layout/);
      const simple = data.itemList.find(
        (i) =>
          i.depth === 1 && !i.hero && data.recipes.some((r) => r.out === i.id && r.in.every((x) => data.items.get(x)!.rarity === "common")) && i.size === 1,
      );
      if (simple) {
        expect(reasonOf(withItem(start(), simple.id, 1))).toBe("too_early");
        expect(reasonOf(withItem(start(), simple.id, 2))).toBe("ok");
      }
    });

    /** The hero's start bags with the given items laid in wherever they fit (all must fit). */
    const packed = (hero: string, round: number, ids: string[]): Build => {
      const h = data.heroes.get(hero)!;
      const bags = h.bags.map((p) => ({ ...p }));
      const items: Build["items"] = [];
      for (const item of ids) {
        let done = false;
        for (let y = 0; y < data.rules.grid.h && !done; y++)
          for (let x = 0; x < data.rules.grid.w && !done; x++)
            for (let rot = 0; rot < 4 && !done; rot++)
              if (validLayout(data, bags, [...items, { item, x, y, rot }])) {
                items.push({ item, x, y, rot });
                done = true;
              }
        expect(done, `${item} fits`).toBe(true);
      }
      return { hero, round, bags, items };
    };

    it("a special before its round, or more specials than were handed out", () => {
      const smallest = [...data.heroes.get("rook")!.artifacts].sort((x, y) => data.items.get(x)!.size - data.items.get(y)!.size);
      const heroRound = data.rules.specials.find((x) => x.pool === "hero")!.afterRound;
      expect(reasonOf(packed("rook", heroRound, [smallest[0]!]))).toBe("too_early");
      expect(reasonOf(packed("rook", heroRound + 1, [smallest[0]!]))).toBe("ok");
      expect(reasonOf(packed("rook", heroRound + 1, [smallest[0]!, smallest[1]!]))).toBe("too_many_specials");
    });

    it("more start pieces than the hero starts with", () => {
      const hero = data.heroList.find((h) => h.start.some((p) => !data.items.get(p.item)!.inShop))!;
      const only = hero.start.find((p) => !data.items.get(p.item)!.inShop)!.item;
      expect(reasonOf(packed(hero.id, 1, [only]))).toBe("ok");
      expect(reasonOf(packed(hero.id, 1, [only, only]))).toBe("too_many_start_pieces");
    });

    it("more value than the gold of the rounds so far", () => {
      // fill the start bags with the dearest common items of round 1
      const h = data.heroes.get("rook")!;
      const dear = data.itemList.filter((i) => i.inShop && !i.isBag && !i.hero && i.rarity === "common" && i.size === 1).sort((a, b) => b.cost - a.cost)[0]!;
      const cells: { x: number; y: number }[] = [];
      for (let x = 0; x < data.rules.grid.w; x++)
        for (let y = 0; y < data.rules.grid.h; y++) {
          const items = [...cells, { x, y }].map((c) => ({ item: dear.id, ...c, rot: 0 }));
          if (
            checkBackpack(data, { hero: "rook", round: 1, bags: h.bags, items }, 1).ok ||
            reasonOf({ hero: "rook", round: 1, bags: h.bags, items }) === "too_valuable"
          )
            cells.push({ x, y });
        }
      const full = { hero: "rook", round: 1, bags: h.bags, items: cells.map((c) => ({ item: dear.id, ...c, rot: 0 })) };
      expect(cells.length * Math.ceil(dear.cost / 2)).toBeGreaterThan(data.rules.goldPerRound[0]!);
      expect(reasonOf(full)).toBe("too_valuable");
    });
  });
});
