/**
 * The balancing bot: plays a run by the rules. It values an item by its price, its synergies with what it owns,
 * the recipes it opens, a personal taste (focus tags) and optional measured ratings.
 * Simplification: a bot merges as soon as it owns all inputs. In the real game the inputs must lie next to each other and merge after the fight of that round, so a bot has a merged item one fight earlier than a player.
 */
import type { GameData, ItemDef } from "../gamedata.js";
import type { Rng } from "../rng.js";
import type { Build, Placement } from "../schema.js";
import { rollOffers, sellPrice, specialOptions, type Offer } from "../shop.js";
import { arrange, placeBag, shuffleLayout } from "./arrange.js";

export interface BotOpts {
  /** measured strength per item id (1 = worth its price) */
  ratings?: Record<string, number>;
  /** "random" lays items out at random, "planned" uses the arranger */
  layout?: "planned" | "random";
  /** buys at random instead of valuing items */
  randomBuys?: boolean;
  /** never combines */
  noCraft?: boolean;
  /** hero path the bot commits to ("" = none); default: three of four bots pick one at random */
  path?: string;
}
export interface BotLog { round: number; bought: string[]; sold: string[]; crafted: string[]; rerolls: number; goldLeft: number; special?: string }
export interface Bot {
  hero: string;
  gold: number;
  inv: string[];
  bags: Placement[];
  layout: Placement[];
  loose: string[];
  /** tags the bot likes a little */
  focus: string[];
  /** way to win the bot commits to (a path of its hero), "" = none */
  path: string;
  /** offers frozen for the next shop */
  frozen: (Offer | null)[];
  log: BotLog[];
}

export function newBot(data: GameData, hero: string, rng: Rng, path?: string): Bot {
  const h = data.heroes.get(hero)!;
  const tags: string[] = ["weapon", "armor", "accessory", "pet", "food", "mechanical", "organic"];
  const focus = [rng.pick(tags), rng.pick(tags)];
  const roll = rng.next(), any = h.paths.length ? rng.pick(h.paths).id : "";
  return { hero, gold: 0, inv: h.start.map((p) => p.item), bags: h.bags.map((p) => ({ ...p })), layout: h.start.map((p) => ({ ...p })), loose: [], focus, path: path ?? (roll < 0.75 ? any : ""), frozen: [], log: [] };
}

/** Does the item belong to a path focus (tag, status, kind of action or item id)? */
export function onPath(def: ItemDef, focus: readonly string[]): boolean {
  return focus.some((f) => f === def.id || (def.tags as string[]).includes(f) || def.effects.some((e) => e.gain === f || e.inflict === f || e.do === f || e.per?.buff === f || e.per?.debuff === f));
}
const PATH_LIKING = 1.5;

const ARTIFACT_WORTH = 14;
const refs = (def: ItemDef): string[] => def.effects.flatMap((e) => [e.tag, e.per?.stars, e.per?.ship].filter((t): t is NonNullable<typeof t> => !!t && t !== "any"));

export function worth(data: GameData, bot: Bot, id: string, opts: BotOpts, owned: readonly string[] = bot.inv): number {
  const def = data.items.get(id)!;
  let v = (def.rarity === "artifact" ? ARTIFACT_WORTH : Math.max(1, def.cost)) * (opts.ratings?.[id] ?? 1);
  const defs = owned.map((o) => data.items.get(o)!);
  let syn = 0;
  for (const t of refs(def)) syn += Math.min(4, defs.filter((o) => (o.tags as string[]).includes(t)).length) * 0.1;
  for (const o of defs) if (refs(o).some((t) => (def.tags as string[]).includes(t))) syn += 0.06;
  v *= 1 + Math.min(0.8, syn);
  const path = data.heroes.get(bot.hero)!.paths.find((p) => p.id === bot.path);
  if (path) { if (onPath(def, path.focus)) v *= PATH_LIKING; }
  else if (def.tags.some((t) => bot.focus.includes(t))) v *= 1.25;
  if (def.hero) v *= 1.1;
  if (def.damage && !defs.some((o) => o.damage)) v *= 1.5;
  const copies = owned.filter((o) => o === id).length;
  if (copies >= 2) v *= 0.6;
  if (!opts.noCraft) for (const r of data.recipesWith.get(id) ?? []) {
    const need = [...r.in]; need.splice(need.indexOf(id), 1);
    const have = [...owned];
    let missing = 0;
    for (const n of need) { const k = have.indexOf(n); if (k >= 0) have.splice(k, 1); else missing++; }
    const out = data.items.get(r.out)!;
    const outWorth = Math.max(1, out.cost) * (opts.ratings?.[r.out] ?? 1);
    v += missing === 0 ? 0.5 * outWorth : missing === 1 && need.length > 1 ? 0.15 * outWorth : 0.04 * outWorth;
  }
  return v;
}

function craftAll(data: GameData, bot: Bot, log: BotLog): void {
  for (let again = true; again; ) {
    again = false;
    for (const r of data.recipes) {
      const have = [...bot.inv];
      if (!r.in.every((n) => { const k = have.indexOf(n); if (k < 0) return false; have.splice(k, 1); return true; })) continue;
      bot.inv = [...have, r.out];
      bot.gold += data.heroes.get(bot.hero)!.craftGold;
      log.crafted.push(r.out);
      again = true;
    }
  }
}

/** One shop visit: income, buying, combining, laying out. */
export function botShop(data: GameData, bot: Bot, round: number, rng: Rng, opts: BotOpts = {}): void {
  const rules = data.rules;
  const room = () => bot.bags.reduce((n, p) => n + data.items.get(p.item)!.size, 0);
  const log: BotLog = { round, bought: [], sold: [], crafted: [], rerolls: 0, goldLeft: 0 };
  bot.log.push(log);
  bot.inv = [...bot.inv, ...bot.loose]; bot.loose = [];
  bot.gold += rules.goldPerRound[round - 1]!;
  const size = (ids: readonly string[]) => ids.reduce((s, id) => s + data.items.get(id)!.size, 0);
  let offers: (Offer | null)[] = rollOffers(data, bot.hero, round, rng, bot.inv, bot.frozen);
  for (const o of offers) if (o) o.frozen = false;
  const maxRerolls = 2 + Math.floor(round / 3);
  for (let step = 0; step < 30; step++) {
    let best: { slot: number; ratio: number; drop: number } | null = null;
    offers.forEach((o, slot) => {
      if (!o || o.price > bot.gold + 0) return;
      const def = data.items.get(o.item)!;
      if (def.isBag) {
        // bags: worth a lot while the backpack is nearly full, little while there is room
        if (!placeBag(data, bot.bags, o.item)) return;
        const free = room() - size(bot.inv);
        const liked = def.effects.some((e) => bot.inv.some((id) => (data.items.get(id)!.tags as string[]).includes(e.tag ?? "")));
        const bv = def.cost * (free < 4 ? 2.2 : free < 8 ? 1.2 : 0.4) * (liked ? 1.25 : 1) * (opts.randomBuys ? 0.5 + rng.next() : 1);
        const br = bv / Math.max(1, o.price);
        if (br >= 0.9 && (!best || br > best.ratio)) best = { slot, ratio: br, drop: -1 };
        return;
      }
      const v = opts.randomBuys ? o.price * (0.5 + rng.next()) : worth(data, bot, o.item, opts) * (0.85 + 0.3 * rng.next());
      let drop = -1;
      if (size(bot.inv) + def.size > room()) {
        // full: replace the weakest item if the new one is clearly better
        let weakest = -1, wv = Infinity;
        bot.inv.forEach((id, k) => { const rest = bot.inv.filter((_, q) => q !== k); const x = worth(data, bot, id, opts, rest) / data.items.get(id)!.size; if (x < wv && data.items.get(id)!.size >= def.size) { wv = x; weakest = k; } });
        if (weakest < 0 || v / def.size < wv * 1.4) return;
        drop = weakest;
      }
      const ratio = v / Math.max(1, o.price);
      if (ratio >= 0.9 && (!best || ratio > best.ratio)) best = { slot, ratio, drop };
    });
    if (best) {
      const b = best as { slot: number; ratio: number; drop: number };
      const o = offers[b.slot]!;
      if (b.drop >= 0) { const id = bot.inv[b.drop]!; bot.gold += sellPrice(data, id); bot.inv.splice(b.drop, 1); log.sold.push(id); }
      bot.gold -= o.price; log.bought.push(o.item); offers[b.slot] = null;
      if (data.items.get(o.item)!.isBag) bot.bags.push(placeBag(data, bot.bags, o.item)!); else bot.inv.push(o.item);
      if (!opts.noCraft) craftAll(data, bot, log);
    } else if (bot.gold >= rules.shop.rerollCost + 3 && log.rerolls < maxRerolls) {
      bot.gold -= rules.shop.rerollCost; log.rerolls++;
      offers = rollOffers(data, bot.hero, round, rng, bot.inv);
    } else break;
  }
  // pin what it wanted but could not pay
  const wanted = offers.map((o, slot) => ({ o, slot, v: o && !data.items.get(o.item)!.isBag && !opts.randomBuys ? worth(data, bot, o.item, opts) / Math.max(1, o.price) : 0 }))
    .filter((x) => x.o && x.o.price > bot.gold && x.v >= 1.1);
  bot.frozen = offers.map((o, slot) => (o && wanted.some((x) => x.slot === slot) ? { ...o, frozen: true } : null));
  layoutBot(data, bot, rng, opts, log);
  log.goldLeft = bot.gold;
}

function layoutBot(data: GameData, bot: Bot, rng: Rng, opts: BotOpts, log: BotLog): void {
  const a = opts.layout === "random" ? shuffleLayout(data, bot.bags, bot.inv, rng) : arrange(data, bot.bags, bot.inv, rng);
  bot.layout = a.items;
  const left = [...a.left].sort((x, y) => worth(data, bot, y, opts) - worth(data, bot, x, opts));
  bot.loose = left.slice(0, data.rules.shop.looseLimit);
  for (const id of left.slice(data.rules.shop.looseLimit)) { bot.gold += sellPrice(data, id); log.sold.push(id); }
  bot.inv = a.items.map((p) => p.item);
}

/** Free special item after the round just fought, if the rules grant one. */
export function botSpecial(data: GameData, bot: Bot, afterRound: number, rng: Rng, opts: BotOpts = {}): void {
  const options = specialOptions(data, bot.hero, afterRound, rng);
  if (!options) return;
  const pick = opts.randomBuys ? rng.pick(options) : [...options].sort((x, y) => worth(data, bot, y, opts) - worth(data, bot, x, opts))[0]!;
  bot.loose.push(pick);
  const log = bot.log[bot.log.length - 1];
  if (log) log.special = pick;
}

export function botBuild(bot: Bot, round: number): Build { return { hero: bot.hero, round, bags: bot.bags.map((p) => ({ ...p })), items: bot.layout.map((p) => ({ ...p })) }; }
