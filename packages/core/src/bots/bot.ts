/**
 * The balancing bot: plays a run by the rules. It values an item by its price, its synergies with what it owns,
 * the recipes it opens, a personal taste (focus tags) and optional measured ratings.
 * Merging follows the player's rules: the bot lays the inputs of a recipe it owns next to each other, and they merge after the fight
 * of that round (botMerge). A bot never locks an item, except the "never combines" bot, which in effect locks everything.
 */
import type { GameData, ItemDef } from "../gamedata.js";
import type { Rng } from "../rng.js";
import { pendingMerges } from "../run.js";
import type { Build, Placement, Recipe } from "../schema.js";
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
  /** hero path the bot commits to ("" = none); default: three of four bots choose one with the hero item after round 2 */
  path?: string;
  /** how hard the bot tries to lay its items out well (default: the arranger's own 250 moves, 4 tries) */
  arrange?: { moves?: number; tries?: number };
  /** how much more a bot committed to a path values that path's items (default PATH_LIKING) */
  pathLiking?: number;
  /** the bot also values hero items of its hero's other paths less (by the same factor): "what can this path do alone" */
  pathStrict?: boolean;
}
export interface BotLog {
  round: number;
  bought: string[];
  sold: string[];
  /** results merged after this round's fight */
  crafted: string[];
  /** recipes the bot owned all inputs of but could not lay together before this round's fight */
  missed: number;
  rerolls: number;
  goldLeft: number;
  special?: string;
}
export interface Bot {
  hero: string;
  gold: number;
  inv: string[];
  bags: Placement[];
  layout: Placement[];
  loose: string[];
  /** tags the bot likes a little */
  focus: string[];
  /** way to win the bot commits to (a path of its hero), "" = none, CHOOSE = takes the path of the hero item it picks after round 2 */
  path: string;
  /** offers frozen for the next shop */
  frozen: (Offer | null)[];
  log: BotLog[];
}

export function newBot(data: GameData, hero: string, rng: Rng, path?: string): Bot {
  const h = data.heroes.get(hero)!;
  const tags: string[] = ["weapon", "armor", "accessory", "pet", "food", "mechanical", "organic"];
  const focus = [rng.pick(tags), rng.pick(tags)];
  const roll = rng.next();
  return {
    hero,
    gold: 0,
    inv: h.start.map((p) => p.item),
    bags: h.bags.map((p) => ({ ...p })),
    layout: h.start.map((p) => ({ ...p })),
    loose: [],
    focus,
    path: path ?? (roll < 0.75 && h.paths.length ? CHOOSE : ""),
    frozen: [],
    log: [],
  };
}
/** Bot.path of a bot that has not chosen yet: it commits with the hero item after round 2. */
export const CHOOSE = "?";

/**
 * Does the item belong to a path? Hero items say so themselves (`path`; none = core item of the hero). General items
 * belong when they match the path's focus (tag, status, kind of action or item id).
 */
export function onPath(def: ItemDef, path: { id: string; focus: readonly string[] }): boolean {
  if (def.hero) return def.path === path.id;
  const focus = path.focus;
  return focus.some(
    (f) =>
      f === def.id ||
      (def.tags as string[]).includes(f) ||
      def.effects.some((e) => e.gain === f || e.inflict === f || e.do === f || e.per?.buff === f || e.per?.debuff === f),
  );
}
/** how much more a bot committed to a path values that path's items (a committed player builds around them);
 *  a measurement can try other values with BotOpts.pathLiking (npm run balance:sweep -- --knob bot:pathLiking) */
export const PATH_LIKING = 2;

const ARTIFACT_WORTH = 14;
/** the bot accepts weapons that need this much more Energy than comes in (the full bar at the start covers some) */
const ENERGY_SLACK = 1.25;

/** Energy per second all weapons of a list would use without waiting. */
export function energyNeed(defs: readonly ItemDef[]): number {
  return defs.reduce((s, d) => s + (d.damage && d.cooldown ? (d.energy ?? 0) / d.cooldown : 0), 0);
}
/** Rough Energy per second an item gives (refill bonus, Energy on use, per phase, on hit, when a starred item activates). */
export function energySupply(data: GameData, def: ItemDef): number {
  const phase = data.rules.battle.phases[0]!.seconds;
  let v = 0;
  for (const e of def.effects) {
    if (e.mod?.energyRegen) v += e.mod.energyRegen;
    if (e.mod?.energy && e.mod.energy < 0) v += 0.5 * -e.mod.energy;
    if (e.do !== "energy") continue;
    const n = ((e.n ?? 0) * (e.if?.chance ?? 100)) / 100;
    v += e.on === "use" || e.on === "hit" ? n / (def.cooldown ?? 4) : e.on === "phase" ? n / phase : e.on === "start" ? 0 : n / 2;
  }
  return v;
}
const refs = (def: ItemDef): string[] =>
  def.effects.flatMap((e) => [e.tag, e.per?.stars, e.per?.ship, e.per?.cells].filter((t): t is NonNullable<typeof t> => !!t && t !== "any"));

/** statuses whose stacks an item's effects count (own buffs, debuffs on the enemy) */
const statusRefs = (def: ItemDef): string[] => def.effects.flatMap((e) => [e.per?.buff, e.per?.debuff].filter((t): t is NonNullable<typeof t> => !!t));
const makes = (effects: readonly { gain?: string; inflict?: string }[], status: string): boolean =>
  effects.some((e) => e.gain === status || e.inflict === status);
/** fit of an item that counts or needs something: worth this share with nothing of it in the build, FIT_ALL with FIT_FULL or more of each */
const FIT_NONE = 0.6,
  FIT_ALL = 1.4,
  FIT_FULL = 3;

export function worth(data: GameData, bot: Bot, id: string, opts: BotOpts, owned: readonly string[] = bot.inv): number {
  const def = data.items.get(id)!;
  let v = (def.rarity === "artifact" ? ARTIFACT_WORTH : Math.max(1, def.cost)) * (opts.ratings?.[id] ?? 1);
  const defs = owned.map((o) => data.items.get(o)!);
  // fit: an item that counts or needs something is worth what the build already has of it
  const needs = [...new Set(refs(def))],
    stacks = [...new Set(statusRefs(def))];
  if (needs.length + stacks.length) {
    const hero = data.heroes.get(bot.hero)!;
    let have = 0;
    for (const t of needs) have += Math.min(1, defs.filter((o) => (o.tags as string[]).includes(t)).length / FIT_FULL);
    for (const s of stacks)
      have += Math.min(
        1,
        (defs.filter((o) => o.id !== id && makes(o.effects, s)).length + (makes(hero.effects, s) ? 1 : 0) + (makes(def.effects, s) ? 1 : 0)) / FIT_FULL,
      );
    v *= FIT_NONE + (FIT_ALL - FIT_NONE) * (have / (needs.length + stacks.length));
  }
  let syn = 0;
  for (const o of defs) if (refs(o).some((t) => (def.tags as string[]).includes(t))) syn += 0.06;
  v *= 1 + Math.min(0.5, syn);
  const path = data.heroes.get(bot.hero)!.paths.find((p) => p.id === bot.path);
  if (path) {
    const liking = opts.pathLiking ?? PATH_LIKING;
    if (onPath(def, path)) v *= liking;
    else if (opts.pathStrict && def.hero && def.path && liking > 0) v /= liking;
  } else if (def.tags.some((t) => bot.focus.includes(t))) v *= 1.25;
  if (def.hero) v *= 1.1;
  if (def.damage && !defs.some((o) => o.damage)) v *= 1.5;
  // Energy: another weapon is worth less when the weapons already use more Energy than comes in; Energy is worth more then
  const supply = data.rules.energy.regen + defs.reduce((s, o) => s + energySupply(data, o), 0),
    need = energyNeed(defs);
  if (def.damage) {
    const after = need + energyNeed([def]);
    if (after > supply * ENERGY_SLACK) v *= Math.max(0.4, (supply * ENERGY_SLACK) / after);
  }
  const gives = energySupply(data, def);
  if (gives > 0) v *= need > supply ? 1 + Math.min(1.5, (need - supply) / Math.max(1, gives * 2)) : 0.8;
  const copies = owned.filter((o) => o === id).length;
  if (copies >= 2) v *= 0.6;
  if (!opts.noCraft)
    for (const r of data.recipesWith.get(id) ?? []) {
      const need = [...r.in];
      need.splice(need.indexOf(id), 1);
      const have = [...owned];
      let missing = 0;
      for (const n of need) {
        const k = have.indexOf(n);
        if (k >= 0) have.splice(k, 1);
        else missing++;
      }
      const out = data.items.get(r.out)!;
      const outWorth = Math.max(1, out.cost) * (opts.ratings?.[r.out] ?? 1);
      v += missing === 0 ? 0.5 * outWorth : missing === 1 && need.length > 1 ? 0.15 * outWorth : 0.04 * outWorth;
    }
  return v;
}

/** One shop visit: income, buying, combining, laying out. */
export function botShop(data: GameData, bot: Bot, round: number, rng: Rng, opts: BotOpts = {}): void {
  const rules = data.rules;
  const room = () => bot.bags.reduce((n, p) => n + data.items.get(p.item)!.size, 0);
  const log: BotLog = { round, bought: [], sold: [], crafted: [], missed: 0, rerolls: 0, goldLeft: 0 };
  bot.log.push(log);
  bot.inv = [...bot.inv, ...bot.loose];
  bot.loose = [];
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
        let weakest = -1,
          wv = Infinity;
        bot.inv.forEach((id, k) => {
          const rest = bot.inv.filter((_, q) => q !== k);
          const x = worth(data, bot, id, opts, rest) / data.items.get(id)!.size;
          if (x < wv && data.items.get(id)!.size >= def.size) {
            wv = x;
            weakest = k;
          }
        });
        if (weakest < 0 || v / def.size < wv * 1.4) return;
        drop = weakest;
      }
      const ratio = v / Math.max(1, o.price);
      if (ratio >= 0.9 && (!best || ratio > best.ratio)) best = { slot, ratio, drop };
    });
    if (best) {
      const b = best as { slot: number; ratio: number; drop: number };
      const o = offers[b.slot]!;
      if (b.drop >= 0) {
        const id = bot.inv[b.drop]!;
        bot.gold += sellPrice(data, id);
        bot.inv.splice(b.drop, 1);
        log.sold.push(id);
      }
      bot.gold -= o.price;
      log.bought.push(o.item);
      offers[b.slot] = null;
      if (data.items.get(o.item)!.isBag) bot.bags.push(placeBag(data, bot.bags, o.item)!);
      else bot.inv.push(o.item);
    } else if (bot.gold >= rules.shop.rerollCost + 3 && log.rerolls < maxRerolls) {
      bot.gold -= rules.shop.rerollCost;
      log.rerolls++;
      offers = rollOffers(data, bot.hero, round, rng, bot.inv);
    } else break;
  }
  // pin what it wanted but could not pay
  const wanted = offers
    .map((o, slot) => ({ o, slot, v: o && !data.items.get(o.item)!.isBag && !opts.randomBuys ? worth(data, bot, o.item, opts) / Math.max(1, o.price) : 0 }))
    .filter((x) => x.o && x.o.price > bot.gold && x.v >= 1.1);
  bot.frozen = offers.map((o, slot) => (o && wanted.some((x) => x.slot === slot) ? { ...o, frozen: true } : null));
  layoutBot(data, bot, rng, opts, log);
  log.goldLeft = bot.gold;
}

/** Recipes whose inputs are all among `ids` (counting copies). */
export function ownedRecipes(data: GameData, ids: readonly string[]): Recipe[] {
  const seen = new Set<Recipe>();
  for (const id of ids)
    for (const r of data.recipesWith.get(id) ?? []) {
      if (seen.has(r)) continue;
      const have = [...ids];
      if (
        r.in.every((n) => {
          const k = have.indexOf(n);
          if (k < 0) return false;
          have.splice(k, 1);
          return true;
        })
      )
        seen.add(r);
    }
  return [...seen];
}

function layoutBot(data: GameData, bot: Bot, rng: Rng, opts: BotOpts, log: BotLog): void {
  const recipes = opts.noCraft ? [] : ownedRecipes(data, bot.inv);
  const a = opts.layout === "random" ? shuffleLayout(data, bot.bags, bot.inv, rng) : arrange(data, bot.bags, bot.inv, rng, { recipes, ...opts.arrange });
  bot.layout = a.items;
  if (recipes.length) {
    const due = pendingMerges(data, bot.bags, bot.layout, recipes).length;
    // every owned recipe that could merge but does not lie together (an item can only serve one merge per round)
    const could = Math.min(
      recipes.length,
      ownedRecipes(
        data,
        a.items.map((p) => p.item),
      ).length,
    );
    log.missed = Math.max(0, could - due);
  }
  const left = [...a.left].sort((x, y) => worth(data, bot, y, opts) - worth(data, bot, x, opts));
  bot.loose = left.slice(0, data.rules.shop.looseLimit);
  for (const id of left.slice(data.rules.shop.looseLimit)) {
    bot.gold += sellPrice(data, id);
    log.sold.push(id);
  }
  bot.inv = a.items.map((p) => p.item);
}

/** After the fight: everything that lies together merges (the same rule as for players, see mergeAll in run.ts). */
export function botMerge(data: GameData, bot: Bot, opts: BotOpts = {}): void {
  if (opts.noCraft) return;
  const due = pendingMerges(data, bot.bags, bot.layout);
  if (!due.length) return;
  const used = new Set(due.flatMap((c) => c.idxs));
  const out = due.map((c) => c.recipe.out);
  bot.layout = bot.layout.filter((_, i) => !used.has(i));
  bot.inv = [...bot.layout.map((p) => p.item), ...out];
  bot.gold += data.heroes.get(bot.hero)!.craftGold * due.length;
  bot.log[bot.log.length - 1]?.crafted.push(...out);
}

/** Free special item after the round just fought, if the rules grant one. */
export function botSpecial(data: GameData, bot: Bot, afterRound: number, rng: Rng, opts: BotOpts = {}): void {
  const options = specialOptions(data, bot.hero, afterRound, rng);
  if (!options) return;
  // a bot committed to a path takes that path's anchor when it is shown
  const own = options.find((id) => bot.path && data.items.get(id)!.path === bot.path);
  const pick = own ?? (opts.randomBuys ? rng.pick(options) : [...options].sort((x, y) => worth(data, bot, y, opts) - worth(data, bot, x, opts))[0]!);
  bot.loose.push(pick);
  // a bot that has not chosen a path yet follows the anchor it took
  const path = data.items.get(pick)!.path;
  if (bot.path === CHOOSE && path) bot.path = path;
  const log = bot.log[bot.log.length - 1];
  if (log) log.special = pick;
}

export function botBuild(bot: Bot, round: number): Build {
  return { hero: bot.hero, round, bags: bot.bags.map((p) => ({ ...p })), items: bot.layout.map((p) => ({ ...p })) };
}
