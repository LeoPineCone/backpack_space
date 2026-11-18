import { describe, expect, it } from "vitest";
import { buy, finishRound, newRun, parseFight, replayRun, reroll, rollOffers, shopRng, type RunState } from "@backpack-space/core";
import { loadGameData } from "@backpack-space/core/node";

const data = loadGameData();
const hero = data.heroList[0]!.id;
const items = (s: RunState) => s.offers.map((o) => o?.item ?? null);

/** Plays a few rounds the same way every time: buy the first offer loose when possible, reroll once, win or lose by turns. */
function play(seed: number, rounds: number): string[][] {
  const s = newRun(data, hero, seed);
  const shops: string[][] = [items(s).map(String)];
  for (let r = 0; r < rounds && !s.over; r++) {
    s.gold += 10;
    if (s.offers[0]) buy(s, data, 0);
    reroll(s, data);
    shops.push(items(s).map(String));
    s.special = null;
    s.loose = [];
    finishRound(s, data, r % 2 === 0);
    shops.push(items(s).map(String));
  }
  return shops;
}

describe("shop from the run seed", () => {
  it("gives the same shops for the same seed", () => {
    expect(play(77, 5)).toEqual(play(77, 5));
  });

  it("gives other shops for another seed", () => {
    expect(play(77, 5)).not.toEqual(play(78, 5));
  });

  it("gives every round and every reroll its own shop", () => {
    const owned: string[] = [];
    const a = rollOffers(data, hero, 3, shopRng(5, 3, 0), owned).map((o) => o.item);
    expect(rollOffers(data, hero, 3, shopRng(5, 3, 0), owned).map((o) => o.item)).toEqual(a);
    expect(rollOffers(data, hero, 3, shopRng(5, 3, 1), owned).map((o) => o.item)).not.toEqual(a);
    expect(rollOffers(data, hero, 4, shopRng(5, 4, 0), owned).map((o) => o.item)).not.toEqual(a);
  });

  it("rebuilds the shop of a round from the run seed, the round, the reroll count and what is owned", () => {
    const s = newRun(data, hero, 1234);
    s.gold = 100;
    reroll(s, data);
    reroll(s, data);
    const before = s.offers.map((o) => ({ ...o! }));
    const owned = [...s.items.map((p) => p.item), ...s.loose];
    // the frozen offers of the shop before carry over; nothing was frozen, so the shop only depends on the inputs
    const rebuilt = rollOffers(data, hero, s.round, shopRng(s.seed, s.round, s.rerolls), owned, []);
    expect(rebuilt.map((o) => o.item)).toEqual(before.map((o) => o.item));
    expect(s.rerolls).toBe(2);
  });

  it("counts rerolls per round and starts again at 0 in the next shop", () => {
    const s = newRun(data, hero, 9);
    s.gold = 100;
    reroll(s, data);
    expect(s.rerolls).toBe(1);
    finishRound(s, data, true);
    expect(s.rerolls).toBe(0);
  });

  it("decides the free picks by the seed too", () => {
    const picks = (seed: number) => {
      const s = newRun(data, hero, seed);
      const out: (string[] | null)[] = [];
      while (!s.over && s.round <= data.rules.rounds) {
        finishRound(s, data, true);
        out.push(s.special);
        s.special = null;
      }
      return out;
    };
    expect(picks(3)).toEqual(picks(3));
    expect(picks(3).some((p) => p !== null)).toBe(true);
  });

  it("takes the next round's shop seed from the server: it becomes the run's seed and is logged (RUN-03)", () => {
    const a = newRun(data, hero, 5);
    const b = newRun(data, hero, 5);
    finishRound(a, data, true, 1111);
    finishRound(b, data, true, 2222);
    expect(a.seed).toBe(1111);
    expect(a.log.at(-1)).toBe("won 1111");
    expect(items(a)).not.toEqual(items(b));
    // the shop of the new round follows from the handed-out seed alone
    const owned = [...a.items.map((p) => p.item), ...a.loose];
    expect(rollOffers(data, hero, a.round, shopRng(1111, a.round, 0), owned, []).map((o) => o.item)).toEqual(items(a));
    // a replay follows the logged seeds
    finishRound(a, data, false, 3333);
    const again = replayRun(data, hero, 5, a.log);
    expect(again.seed).toBe(3333);
    expect(items(again)).toEqual(items(a));
    expect(again.special).toEqual(a.special);
  });

  it("reads fight lines with and without a seed and refuses broken ones", () => {
    expect(parseFight("won")).toEqual({ won: true });
    expect(parseFight("lost 0")).toEqual({ won: false, nextSeed: 0 });
    expect(parseFight("won 4294967295")).toEqual({ won: true, nextSeed: 4294967295 });
    expect(parseFight("won 4294967296")).toBeNull();
    expect(parseFight("won -1")).toBeNull();
    expect(parseFight("won  1")).toBeNull();
    expect(parseFight("rr")).toBeNull();
  });
});
