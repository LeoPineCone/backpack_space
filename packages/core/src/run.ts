/** One run as the player plays it: rounds, gold, shop, bags, backpack, loose items, merging, lives. Used by the browser preview; the bots follow the same rules. */
import type { GameData } from "./gamedata.js";
import { bagsUnder, boardOf, neighbours } from "./grid.js";
import type { Rng } from "./rng.js";
import type { Build, Placement, Recipe } from "./schema.js";
import { rollOffers, sellPrice, specialOptions, type Offer } from "./shop.js";

export interface RunState {
  hero: string;
  /** 1-based round about to be fought */
  round: number;
  lives: number;
  wins: number;
  /** one entry per round fought: won or lost */
  results: boolean[];
  gold: number;
  bags: Placement[];
  items: Placement[];
  /** items and bags lying loose below the backpack (no effect in battle) */
  loose: string[];
  offers: (Offer | null)[];
  /** free special items to choose one from before shopping continues */
  special: string[] | null;
  /** what merged after the last fight */
  merged: Merge[];
  over: boolean;
}
export interface Combo { recipe: Recipe; idxs: number[] }
export interface Merge { out: string; in: string[] }
export interface Spot { x: number; y: number; rot: number }

export function newRun(data: GameData, hero: string, rng: Rng): RunState {
  const h = data.heroes.get(hero);
  if (!h) throw new Error(`unknown hero ${hero}`);
  const s: RunState = { hero, round: 1, lives: data.rules.lives, wins: 0, results: [], gold: 0, bags: h.bags.map((p) => ({ ...p })), items: h.start.map((p) => ({ ...p })), loose: [], offers: [], special: null, merged: [], over: false };
  startRound(s, data, rng);
  return s;
}
export function startRound(s: RunState, data: GameData, rng: Rng): void {
  s.gold += data.rules.goldPerRound[s.round - 1]!;
  s.offers = rollOffers(data, s.hero, s.round, rng, [...s.items.map((p) => p.item), ...s.loose], s.offers);
}
export function reroll(s: RunState, data: GameData, rng: Rng): boolean {
  if (s.gold < data.rules.shop.rerollCost) return false;
  s.gold -= data.rules.shop.rerollCost;
  s.offers = rollOffers(data, s.hero, s.round, rng, [...s.items.map((p) => p.item), ...s.loose], s.offers);
  return true;
}
/** Pins an offer (it stays through rerolls and into the next round) or releases it. Any number of offers can be pinned. */
export function toggleFreeze(s: RunState, slot: number): boolean {
  const o = s.offers[slot];
  if (!o) return false;
  o.frozen = !o.frozen;
  return true;
}
export function validLayout(data: GameData, bags: readonly Placement[], items: readonly Placement[]): boolean {
  try { boardOf(data.rules.grid.w, data.rules.grid.h, bags, items, data.shape); return true; } catch { return false; }
}
function commit(s: RunState, data: GameData, bags: Placement[], items: Placement[]): boolean {
  if (!validLayout(data, bags, items)) return false;
  s.bags = bags; s.items = items;
  return true;
}
/** Puts a new item or bag into the backpack. */
export function place(s: RunState, data: GameData, item: string, at: Spot): boolean {
  const p = { item, ...at };
  return data.items.get(item)!.isBag ? commit(s, data, [...s.bags, p], s.items) : commit(s, data, s.bags, [...s.items, p]);
}
export function moveItem(s: RunState, data: GameData, idx: number, at: Spot): boolean {
  return commit(s, data, s.bags, s.items.map((p, i) => (i === idx ? { ...p, ...at } : p)));
}
/** Locks an item so that it does not merge after a fight, or releases it. The lock is lost when the item leaves the backpack. */
export function toggleLock(s: RunState, idx: number): boolean {
  const p = s.items[idx];
  if (!p) return false;
  if (p.lock) delete p.lock; else p.lock = true;
  return true;
}
/** Moves a bag; the items lying entirely in it travel along (only without turning the bag). */
export function moveBag(s: RunState, data: GameData, idx: number, at: Spot): boolean {
  const old = s.bags[idx]!;
  const b = boardOf(data.rules.grid.w, data.rules.grid.h, s.bags, s.items, data.shape);
  const riders = s.items.map((_, i) => { const u = bagsUnder(b, s.items, i, data.shape); return u.length === 1 && u[0] === idx; });
  if (at.rot !== old.rot && riders.some(Boolean)) return false;
  const dx = at.x - old.x, dy = at.y - old.y;
  return commit(s, data, s.bags.map((p, i) => (i === idx ? { item: p.item, ...at } : p)), s.items.map((p, i) => (riders[i] ? { ...p, x: p.x + dx, y: p.y + dy } : p)));
}
/** Buys an offer; with a spot it goes into the backpack, otherwise it drops to the loose items. `shop.looseLimit` only stops buying: once that many pieces lie loose, nothing more can be bought loose. */
export function buy(s: RunState, data: GameData, slot: number, at?: Spot): boolean {
  const o = s.offers[slot];
  if (!o || s.gold < o.price) return false;
  if (at) { if (!place(s, data, o.item, at)) return false; }
  else { if (s.loose.length >= data.rules.shop.looseLimit) return false; s.loose.push(o.item); }
  s.gold -= o.price; s.offers[slot] = null;
  return true;
}
export function placeLoose(s: RunState, data: GameData, idx: number, at: Spot): boolean {
  if (!place(s, data, s.loose[idx]!, at)) return false;
  s.loose.splice(idx, 1);
  return true;
}
/** Takes an item out of the backpack; it drops to the loose items (always allowed). */
export function dropItem(s: RunState, idx: number): void {
  s.loose.push(s.items[idx]!.item); s.items.splice(idx, 1);
}
/** Takes a bag out of the backpack; every item that loses a cell of bag under it drops with it. */
export function dropBag(s: RunState, data: GameData, idx: number): void {
  const bag = s.bags[idx]!;
  const bags = s.bags.filter((_, i) => i !== idx);
  const kept: Placement[] = [];
  const fell: string[] = [];
  for (const p of s.items) { if (validLayout(data, bags, [...kept, p])) kept.push(p); else fell.push(p.item); }
  s.bags = bags; s.items = kept;
  s.loose.push(bag.item, ...fell);
}
export function sellItem(s: RunState, data: GameData, idx: number): void { s.gold += sellPrice(data, s.items[idx]!.item); s.items.splice(idx, 1); }
/** Bags in the backpack can only be sold empty. */
export function sellBag(s: RunState, data: GameData, idx: number): boolean {
  const bags = s.bags.filter((_, i) => i !== idx);
  if (!validLayout(data, bags, s.items)) return false;
  s.gold += sellPrice(data, s.bags[idx]!.item); s.bags = bags;
  return true;
}
export function sellLoose(s: RunState, data: GameData, idx: number): void { s.gold += sellPrice(data, s.loose[idx]!); s.loose.splice(idx, 1); }

/** Recipes whose inputs lie in the backpack as one connected group (sharing edges). */
export function findCombos(data: GameData, bags: readonly Placement[], items: readonly Placement[], recipes: readonly Recipe[] = data.recipes): Combo[] {
  const { w, h } = data.rules.grid;
  const b = boardOf(w, h, bags, items, data.shape);
  const adj = items.map((_, i) => neighbours(b, items, i, data.shape));
  const out: Combo[] = [];
  const seen = new Set<string>();
  for (const recipe of recipes) {
    const pick = (k: number, chosen: number[]) => {
      if (k === recipe.in.length) {
        const reach = [chosen[0]!];
        for (let q = 0; q < reach.length; q++) for (const c of chosen) if (!reach.includes(c) && adj[reach[q]!]!.includes(c)) reach.push(c);
        const key = recipe.out + ":" + [...chosen].sort((x, y) => x - y).join(",");
        if (reach.length === chosen.length && !seen.has(key)) { seen.add(key); out.push({ recipe, idxs: [...chosen] }); }
        return;
      }
      items.forEach((p, i) => { if (p.item === recipe.in[k] && !chosen.includes(i)) pick(k + 1, [...chosen, i]); });
    };
    pick(0, []);
  }
  return out;
}
/** The merges the next fight will be followed by: recipes lying together with no locked input, every item used at most once. */
export function pendingMerges(data: GameData, bags: readonly Placement[], items: readonly Placement[], recipes: readonly Recipe[] = data.recipes): Combo[] {
  const used = new Set<number>();
  const out: Combo[] = [];
  for (const c of findCombos(data, bags, items, recipes)) {
    if (c.idxs.some((i) => used.has(i) || items[i]!.lock)) continue;
    c.idxs.forEach((i) => used.add(i));
    out.push(c);
  }
  return out;
}
/**
 * Which items could merge with which, ignoring where they lie: for every entry the indices of the other entries that,
 * together with it, hold every part of some recipe. `null` entries (empty shop slots, locked items) take no part.
 * The shop screen uses it to show partners before anything is placed.
 */
export function mergePartners(data: GameData, ids: readonly (string | null)[]): Set<number>[] {
  const out = ids.map(() => new Set<number>());
  const where = new Map<string, number[]>();
  ids.forEach((id, i) => { if (id !== null) where.set(id, [...(where.get(id) ?? []), i]); });
  for (const recipe of data.recipes) {
    const need = new Map<string, number>();
    for (const id of recipe.in) need.set(id, (need.get(id) ?? 0) + 1);
    if ([...need].some(([id, n]) => (where.get(id)?.length ?? 0) < n)) continue;
    const members = [...need.keys()].flatMap((id) => where.get(id)!);
    for (const i of members) for (const j of members) if (i !== j) out[i]!.add(j);
  }
  return out;
}
/** Merges everything that is due (once; a result can merge again after the next fight). */
export function mergeAll(s: RunState, data: GameData): Merge[] {
  const due = pendingMerges(data, s.bags, s.items).map((c) => ({ recipe: c.recipe, parts: c.idxs.map((i) => s.items[i]!) }));
  return due.map(({ recipe, parts }) => {
    combine(s, data, { recipe, idxs: parts.map((p) => s.items.indexOf(p)) });
    return { out: recipe.out, in: [...recipe.in] };
  });
}
/** Merges one recipe for good: the inputs leave the backpack, the result lands where they were if it fits there, else among the loose items. */
export function combine(s: RunState, data: GameData, combo: Combo): void {
  const cells = combo.idxs.flatMap((i) => { const p = s.items[i]!; return data.shape(p.item, p.rot).cells.map(([cx, cy]) => [p.x + cx, p.y + cy] as [number, number]); });
  s.items = s.items.filter((_, i) => !combo.idxs.includes(i));
  s.gold += data.heroes.get(s.hero)!.craftGold;
  for (const [x, y] of cells) for (let rot = 0; rot < 4; rot++) if (place(s, data, combo.recipe.out, { x, y, rot })) return;
  s.loose.push(combo.recipe.out);
}
export function takeSpecial(s: RunState, choice: number): void {
  if (!s.special) return;
  s.loose.push(s.special[choice]!);
  s.special = null;
}
export function buildOf(s: RunState): Build { return { hero: s.hero, round: s.round, bags: s.bags.map((p) => ({ ...p })), items: s.items.map((p) => ({ ...p })) }; }

/** Books the fight of this round, merges what lies together and opens the next shop (or ends the run). */
export function finishRound(s: RunState, data: GameData, won: boolean, rng: Rng): void {
  if (won) s.wins++; else s.lives--;
  s.results.push(won);
  const fought = s.round;
  s.merged = [];
  if (s.lives <= 0 || fought >= data.rules.rounds) { s.over = true; return; }
  s.merged = mergeAll(s, data);
  s.round++;
  s.special = specialOptions(data, s.hero, fought, rng);
  startRound(s, data, rng);
}
