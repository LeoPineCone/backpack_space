/** The shop: offers by round, prices, selling. */
import type { GameData, ItemDef, ShopRarity } from "./gamedata.js";
import type { Rng } from "./rng.js";
import { SHOP_RARITIES } from "./schema.js";

export interface Offer { item: string; price: number; sale: boolean; /** kept through rerolls and into the next round */ frozen?: boolean }

/** Shop items that would complete or continue a recipe with something the player owns, and that this round can already offer. */
export function recipePartners(data: GameData, hero: string, round: number, owned: readonly string[]): ItemDef[] {
  const odds = data.rules.shop.rarityOdds[Math.min(round, data.rules.rounds) - 1]!;
  const out = new Set<ItemDef>();
  for (const id of new Set(owned)) for (const r of data.recipesWith.get(id) ?? []) {
    const rest = [...r.in]; rest.splice(rest.indexOf(id), 1);
    for (const other of rest) {
      const def = data.items.get(other)!;
      if (def.inShop && !def.isBag && (!def.hero || def.hero === hero) && odds[def.rarity as ShopRarity] > 0) out.add(def);
    }
  }
  return [...out];
}

/** Share of the owned items that carry each tag (the "crafted" tag and bags do not count). */
export function tagShares(data: GameData, owned: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!owned.length) return out;
  for (const id of owned) for (const t of data.items.get(id)!.tags) if (t !== "crafted" && t !== "bag") out.set(t, (out.get(t) ?? 0) + 1 / owned.length);
  return out;
}
/** How often an item is offered compared with the others of its list: its own weight, raised by what the player already owns. */
export function offerWeight(data: GameData, def: ItemDef, shares: Map<string, number>): number {
  const fit = Math.max(0, ...def.tags.map((t) => shares.get(t) ?? 0));
  return (def.weight ?? 1) * (1 + (data.rules.shop.affinityPct / 100) * fit);
}
function pickWeighted(data: GameData, list: readonly ItemDef[], shares: Map<string, number>, rng: Rng): ItemDef {
  const ws = list.map((d) => offerWeight(data, d, shares));
  let roll = rng.next() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { roll -= ws[i]!; if (roll < 0) return list[i]!; }
  return list[list.length - 1]!;
}

/** One shop offer. `owned` (backpack and loose) lets the shop lean towards what the player carries; `noBag` keeps bags out. */
export function rollOffer(data: GameData, hero: string, round: number, rng: Rng, owned: readonly string[] = [], noBag = false): Offer {
  const shop = data.rules.shop;
  const odds = shop.rarityOdds[Math.min(round, data.rules.rounds) - 1]!;
  let roll = rng.next() * SHOP_RARITIES.reduce((s, r) => s + odds[r], 0);
  let rarity: ShopRarity = "common";
  for (const r of SHOP_RARITIES) { if (roll < odds[r]) { rarity = r; break; } roll -= odds[r]; }
  const wantHero = rng.next() * 100 < shop.heroOfferPct;
  let list: ItemDef[] = [];
  const wantBag = rng.next() * 100 < shop.bagOfferPct;
  if (data.bags.length && wantBag && !noBag) {
    const bags = data.bags.filter((b) => b.rarity === rarity);
    list = bags.length ? bags : data.bags.filter((b) => b.rarity === "common");
  }
  for (let i = SHOP_RARITIES.indexOf(rarity); i >= 0 && list.length === 0; i--) {
    const r = SHOP_RARITIES[i]!;
    const own = data.pool.hero.get(hero)?.[r] ?? [];
    list = wantHero && own.length ? own : data.pool.general[r];
  }
  const wantPartner = rng.next() * 100 < shop.recipeOfferPct;
  const partners = wantPartner ? recipePartners(data, hero, round, owned) : [];
  const item = partners.length ? rng.pick(partners) : pickWeighted(data, list, tagShares(data, owned), rng);
  const sale = rng.next() * 100 < shop.salePct;
  return { item: item.id, price: sale ? Math.max(1, Math.ceil(item.cost / 2)) : item.cost, sale };
}

/** A full roll of the shop. Frozen offers of `keep` stay in their slots; at most `shop.maxBags` bags are among the offers. */
export function rollOffers(data: GameData, hero: string, round: number, rng: Rng, owned: readonly string[] = [], keep: readonly (Offer | null)[] = []): Offer[] {
  const out: Offer[] = [];
  let bags = keep.filter((o) => o?.frozen && data.items.get(o.item)!.isBag).length;
  for (let i = 0; i < data.rules.shop.slots; i++) {
    const kept = keep[i];
    if (kept?.frozen) { out.push(kept); continue; }
    const o = rollOffer(data, hero, round, rng, owned, bags >= data.rules.shop.maxBags);
    if (data.items.get(o.item)!.isBag) bags++;
    out.push(o);
  }
  return out;
}

export function sellPrice(data: GameData, item: string): number {
  return Math.floor((data.items.get(item)!.cost * data.rules.shop.sellPct) / 100);
}

/** Free special items after certain rounds: the options to pick one from, or null. */
export function specialOptions(data: GameData, hero: string, afterRound: number, rng: Rng): string[] | null {
  const sp = data.rules.specials.find((s) => s.afterRound === afterRound);
  if (!sp) return null;
  const pool = sp.pool === "hero" ? [...data.heroes.get(hero)!.artifacts] : data.generalArtifacts.map((i) => i.id);
  return rng.shuffle(pool).slice(0, sp.show);
}
