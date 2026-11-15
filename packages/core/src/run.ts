/** One run as the player plays it: rounds, gold, shop, bags, backpack, bench, combining, lives. Used by the browser preview; the bots follow the same rules. */
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
  gold: number;
  bags: Placement[];
  items: Placement[];
  /** items and bags waiting outside the backpack (no effect in battle) */
  bench: string[];
  offers: (Offer | null)[];
  /** free special items to choose one from before shopping continues */
  special: string[] | null;
  over: boolean;
}
export interface Combo { recipe: Recipe; idxs: number[] }
export interface Spot { x: number; y: number; rot: number }

export function newRun(data: GameData, hero: string, rng: Rng): RunState {
  const h = data.heroes.get(hero);
  if (!h) throw new Error(`unknown hero ${hero}`);
  const s: RunState = { hero, round: 1, lives: data.rules.lives, wins: 0, gold: 0, bags: h.bags.map((p) => ({ ...p })), items: h.start.map((p) => ({ ...p })), bench: [], offers: [], special: null, over: false };
  startRound(s, data, rng);
  return s;
}
export function startRound(s: RunState, data: GameData, rng: Rng): void {
  s.gold += data.rules.goldPerRound[s.round - 1]!;
  s.offers = rollOffers(data, s.hero, s.round, rng, [...s.items.map((p) => p.item), ...s.bench]);
}
export function reroll(s: RunState, data: GameData, rng: Rng): boolean {
  if (s.gold < data.rules.shop.rerollCost) return false;
  s.gold -= data.rules.shop.rerollCost;
  s.offers = rollOffers(data, s.hero, s.round, rng, [...s.items.map((p) => p.item), ...s.bench]);
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
  return commit(s, data, s.bags, s.items.map((p, i) => (i === idx ? { item: p.item, ...at } : p)));
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
/** Buys an offer; with a spot it goes into the backpack, otherwise onto the bench. */
export function buy(s: RunState, data: GameData, slot: number, at?: Spot): boolean {
  const o = s.offers[slot];
  if (!o || s.gold < o.price) return false;
  if (at) { if (!place(s, data, o.item, at)) return false; }
  else { if (s.bench.length >= data.rules.shop.benchSlots) return false; s.bench.push(o.item); }
  s.gold -= o.price; s.offers[slot] = null;
  return true;
}
export function placeBench(s: RunState, data: GameData, idx: number, at: Spot): boolean {
  if (!place(s, data, s.bench[idx]!, at)) return false;
  s.bench.splice(idx, 1);
  return true;
}
export function benchItem(s: RunState, data: GameData, idx: number): boolean {
  if (s.bench.length >= data.rules.shop.benchSlots) return false;
  s.bench.push(s.items[idx]!.item); s.items.splice(idx, 1);
  return true;
}
export function sellItem(s: RunState, data: GameData, idx: number): void { s.gold += sellPrice(data, s.items[idx]!.item); s.items.splice(idx, 1); }
/** Bags can only be sold empty. */
export function sellBag(s: RunState, data: GameData, idx: number): boolean {
  const bags = s.bags.filter((_, i) => i !== idx);
  if (!validLayout(data, bags, s.items)) return false;
  s.gold += sellPrice(data, s.bags[idx]!.item); s.bags = bags;
  return true;
}
export function sellBench(s: RunState, data: GameData, idx: number): void { s.gold += sellPrice(data, s.bench[idx]!); s.bench.splice(idx, 1); }

/** Recipes whose inputs lie in the backpack as one connected group (sharing edges). */
export function findCombos(data: GameData, bags: readonly Placement[], items: readonly Placement[]): Combo[] {
  const { w, h } = data.rules.grid;
  const b = boardOf(w, h, bags, items, data.shape);
  const adj = items.map((_, i) => neighbours(b, items, i, data.shape));
  const out: Combo[] = [];
  const seen = new Set<string>();
  for (const recipe of data.recipes) {
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
/** Combines for good: the inputs leave the backpack, the result lands where they were if it fits there, else on the bench. */
export function combine(s: RunState, data: GameData, combo: Combo): void {
  const cells = combo.idxs.flatMap((i) => { const p = s.items[i]!; return data.shape(p.item, p.rot).cells.map(([cx, cy]) => [p.x + cx, p.y + cy] as [number, number]); });
  s.items = s.items.filter((_, i) => !combo.idxs.includes(i));
  s.gold += data.heroes.get(s.hero)!.craftGold;
  for (const [x, y] of cells) for (let rot = 0; rot < 4; rot++) if (place(s, data, combo.recipe.out, { x, y, rot })) return;
  s.bench.push(combo.recipe.out);
}
export function takeSpecial(s: RunState, choice: number): void {
  if (!s.special) return;
  s.bench.push(s.special[choice]!);
  s.special = null;
}
export function buildOf(s: RunState): Build { return { hero: s.hero, round: s.round, bags: s.bags.map((p) => ({ ...p })), items: s.items.map((p) => ({ ...p })) }; }

/** Books the fight of this round and opens the next shop (or ends the run). */
export function finishRound(s: RunState, data: GameData, won: boolean, rng: Rng): void {
  if (won) s.wins++; else s.lives--;
  const fought = s.round;
  if (s.lives <= 0 || fought >= data.rules.rounds) { s.over = true; return; }
  s.round++;
  s.special = specialOptions(data, s.hero, fought, rng);
  startRound(s, data, rng);
}
