/** The shop: offers by round, prices, selling. */
import type { GameData, ItemDef, ShopRarity } from "./gamedata.js";
import type { Rng } from "./rng.js";
import { SHOP_RARITIES } from "./schema.js";

export interface Offer { item: string; price: number; sale: boolean }

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

/** One shop offer. `owned` (backpack and bench) lets the shop lean towards parts that fit what the player carries. */
export function rollOffer(data: GameData, hero: string, round: number, rng: Rng, owned: readonly string[] = []): Offer {
  const shop = data.rules.shop;
  const odds = shop.rarityOdds[Math.min(round, data.rules.rounds) - 1]!;
  let roll = rng.next() * SHOP_RARITIES.reduce((s, r) => s + odds[r], 0);
  let rarity: ShopRarity = "common";
  for (const r of SHOP_RARITIES) { if (roll < odds[r]) { rarity = r; break; } roll -= odds[r]; }
  const wantHero = rng.next() * 100 < shop.heroOfferPct;
  let list: ItemDef[] = [];
  if (data.bags.length && rng.next() * 100 < shop.bagOfferPct) {
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
  const item = partners.length ? rng.pick(partners) : rng.pick(list);
  const sale = rng.next() * 100 < shop.salePct;
  return { item: item.id, price: sale ? Math.max(1, Math.ceil(item.cost / 2)) : item.cost, sale };
}

export function rollOffers(data: GameData, hero: string, round: number, rng: Rng, owned: readonly string[] = []): Offer[] {
  return Array.from({ length: data.rules.shop.slots }, () => rollOffer(data, hero, round, rng, owned));
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
