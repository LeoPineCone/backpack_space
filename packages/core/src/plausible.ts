/**
 * Plausibility of a backpack for a round (CORE-05, docs/client-server.md): could a player following the rules have
 * this backpack before the fight of `round`? The server checks every backpack with it before a fight, until the shop
 * phase is replayed from the action log. All numbers come from the rules (data/rules.json).
 *
 * What it checks, in this order:
 *  1. the round and the hero exist, the build says the same round
 *  2. every bag and item exists and sits on the right side (bags as bags, items as items)
 *  3. the layout is valid (`validLayout`)
 *  4. every piece could be had by then: shop pieces only from the first round their rarity is in the shop odds,
 *     hero shop items only for their hero, recipe results only after enough fights to merge them, specials (artifacts)
 *     only after their special round and only as many as were handed out, start pieces only as many as the hero has
 *  5. the backpack is not worth more than the gold that could have been earned by then
 *
 * The value check (5) is exact in the first rounds and gets looser later: merging and then selling the result can
 * earn gold, which a backpack alone does not show. The action log replay (later) closes that gap.
 */
import type { GameData, ItemDef, ShopRarity } from "./gamedata.js";
import { validLayout } from "./run.js";
import type { Build } from "./schema.js";
import { sellPrice } from "./shop.js";

export const PLAUSIBILITY_REASONS = [
  "bad_round",
  "unknown_hero",
  "unknown_item",
  "bag_as_item",
  "item_as_bag",
  "layout",
  "other_hero",
  "not_obtainable",
  "too_early",
  "too_many_specials",
  "too_many_start_pieces",
  "too_valuable",
] as const;
export type PlausibilityReason = (typeof PLAUSIBILITY_REASONS)[number];

export type Plausibility = { ok: true } | { ok: false; reason: PlausibilityReason; item?: string };

const bad = (reason: PlausibilityReason, item?: string): Plausibility => (item ? { ok: false, reason, item } : { ok: false, reason });

/** The lowest price a shop piece can be bought for (an offer on sale costs half, at least 1). */
export function lowestPrice(def: ItemDef): number {
  return Math.max(1, Math.ceil(def.cost / 2));
}

/** The first round in which the shop can offer a piece of this rarity, or Infinity. */
function firstShopRound(data: GameData, rarity: string): number {
  const i = data.rules.shop.rarityOdds.findIndex((o) => (o[rarity as ShopRarity] ?? 0) > 0);
  return i < 0 ? Infinity : i + 1;
}

interface Origin {
  /** first round the piece can be in the backpack before a fight */
  round: number;
  /** gold it cost at least (recipe results: their inputs) */
  cost: number;
  /** merges inside it */
  merges: number;
  /** start pieces and specials it consumed, by id */
  free: Map<string, number>;
}

export function checkBackpack(data: GameData, build: Build, round: number): Plausibility {
  const rules = data.rules;
  if (!Number.isInteger(round) || round < 1 || round > rules.rounds || build.round !== round) return bad("bad_round");
  const hero = data.heroes.get(build.hero);
  if (!hero) return bad("unknown_hero");

  for (const p of build.bags) {
    const def = data.items.get(p.item);
    if (!def) return bad("unknown_item", p.item);
    if (!def.isBag) return bad("item_as_bag", p.item);
  }
  for (const p of build.items) {
    const def = data.items.get(p.item);
    if (!def) return bad("unknown_item", p.item);
    if (def.isBag) return bad("bag_as_item", p.item);
  }
  if (!validLayout(data, build.bags, build.items)) return bad("layout");

  const startCount = new Map<string, number>();
  for (const p of [...hero.bags, ...hero.start]) startCount.set(p.item, (startCount.get(p.item) ?? 0) + 1);
  const specials = rules.specials.filter((s) => s.afterRound < round);
  const heroSpecials = specials.filter((s) => s.pool === "hero");
  const generalSpecials = specials.filter((s) => s.pool !== "hero");

  // where a piece can come from, cheapest and earliest way; null when it cannot be had by this hero at all
  const memo = new Map<string, Origin | null>();
  const originOf = (id: string, seen: readonly string[] = []): Origin | null => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.includes(id)) return null;
    const def = data.items.get(id)!;
    let best: Origin | null = null;
    const consider = (o: Origin) => {
      if (!best || o.round < best.round || (o.round === best.round && o.cost < best.cost)) best = o;
    };
    // a start piece that the shop also sells counts at its shop price (its value is added to the income below), so
    // copies bought later are not mistaken for extra start pieces; one the shop never sells is free and counted
    if (startCount.has(id))
      consider(def.inShop ? { round: 1, cost: lowestPrice(def), merges: 0, free: new Map() } : { round: 1, cost: 0, merges: 0, free: new Map([[id, 1]]) });
    if (def.inShop && (!def.hero || def.hero === hero.id) && (!def.isBag || data.bags.includes(def)))
      consider({ round: firstShopRound(data, def.rarity), cost: lowestPrice(def), merges: 0, free: new Map() });
    if (def.rarity === "artifact") {
      // the hero's own specials come from the hero pool, the others from the general pool
      const own = hero.artifacts.includes(id);
      const first = rules.specials.filter((s) => (own ? s.pool === "hero" : s.pool !== "hero" && !def.hero)).sort((a, b) => a.afterRound - b.afterRound)[0];
      if (first) consider({ round: first.afterRound + 1, cost: 0, merges: 0, free: new Map([[id, 1]]) });
    }
    for (const r of data.recipes.filter((x) => x.out === id)) {
      const parts = r.in.map((i) => originOf(i, [...seen, id]));
      if (parts.some((p) => !p)) continue;
      const ok = parts as Origin[];
      const free = new Map<string, number>();
      for (const p of ok) for (const [k, n] of p.free) free.set(k, (free.get(k) ?? 0) + n);
      // a result exists only after the fight of the round its last input arrived in
      consider({
        round: Math.max(...ok.map((p) => p.round)) + 1,
        cost: ok.reduce((s, p) => s + p.cost, 0),
        merges: 1 + ok.reduce((s, p) => s + p.merges, 0),
        free,
      });
    }
    memo.set(id, best);
    return best;
  };

  let cost = 0;
  let merges = 0;
  const free = new Map<string, number>();
  for (const p of [...build.bags, ...build.items]) {
    const def = data.items.get(p.item)!;
    if (def.hero && def.hero !== hero.id) return bad("other_hero", p.item);
    const o = originOf(p.item);
    if (!o) return bad("not_obtainable", p.item);
    if (o.round > round) return bad("too_early", p.item);
    cost += o.cost;
    merges += o.merges;
    for (const [k, n] of o.free) free.set(k, (free.get(k) ?? 0) + n);
  }

  let heroArtifacts = 0;
  let generalArtifacts = 0;
  for (const [id, n] of free) {
    const def = data.items.get(id)!;
    if (def.rarity === "artifact") {
      if (hero.artifacts.includes(id)) heroArtifacts += n;
      else generalArtifacts += n;
    } else if (n > (startCount.get(id) ?? 0)) return bad("too_many_start_pieces", id);
  }
  if (heroArtifacts > heroSpecials.length || generalArtifacts > generalSpecials.length) return bad("too_many_specials");

  // gold that could have come in: the rounds so far, the start pieces (what they are worth or sell for), selling the
  // specials, the hero's merge gold
  let income = rules.goldPerRound.slice(0, round).reduce((s, g) => s + g, 0);
  for (const [id, n] of startCount) {
    const def = data.items.get(id)!;
    income += n * (def.inShop ? lowestPrice(def) : sellPrice(data, id));
  }
  for (const s of specials) {
    const pool = s.pool === "hero" ? hero.artifacts : data.generalArtifacts.map((i) => i.id);
    income += Math.max(0, ...pool.map((id) => sellPrice(data, id)));
  }
  income += hero.craftGold * merges;
  // merging and selling the result can gain gold; at most every piece of a full backpack, every round after a fight
  const gain = Math.max(
    0,
    ...data.recipes.map((r) => {
      const parts = r.in.map((i) => originOf(i));
      return parts.every(Boolean) ? sellPrice(data, r.out) + hero.craftGold - parts.reduce((t, o) => t + o!.cost, 0) : 0;
    }),
  );
  const cells = data.rules.grid.w * data.rules.grid.h;
  income += (round - 1) * Math.floor(cells / 2) * gain;
  if (cost > income) return bad("too_valuable");
  return { ok: true };
}
