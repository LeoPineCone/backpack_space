/** Turns a build (hero + placed items) into a battle-ready side: stars resolved, passives applied. */
import type { GameData, ItemDef } from "./gamedata.js";
import { bagsUnder, boardOf, starred } from "./grid.js";
import type { Build, Effect, FilterTag, HeroData, Mod } from "./schema.js";

export interface CEffect {
  e: Effect;
  /** item index, -1 = hero */
  src: number;
  /** static multiplier from per.stars / per.ship (1 when there is none) */
  mult: number;
}
export interface DynMod { phases: string[]; mod: Mod }
export interface CItem {
  def: ItemDef;
  idx: number;
  starred: number[];
  cooldown: number;
  dmg: [number, number] | null;
  crit: number;
  /** percent */
  speed: number;
  ready: number;
  /** triggered effects of this item */
  effects: CEffect[];
  /** phase-dependent passive bonuses */
  dyn: DynMod[];
}
export interface CSide {
  hero: HeroData;
  round: number;
  maxHp: number;
  items: CItem[];
  heroEffects: CEffect[];
  /** starUse and shipUse effects to fire when item i activates */
  watchers: CEffect[][];
}

const has = (def: ItemDef, tag: FilterTag | "any" | undefined) => tag === undefined || tag === "any" || def.tags.includes(tag);

export function compile(build: Build, data: GameData): CSide {
  const hero = data.heroes.get(build.hero);
  if (!hero) throw new Error(`unknown hero ${build.hero}`);
  const { w, h } = data.rules.grid;
  const board = boardOf(w, h, build.bags, build.items, data.shape);
  const items: CItem[] = build.items.map((p, idx) => {
    const def = data.items.get(p.item)!;
    return { def, idx, starred: starred(board, build.items, idx, data.shape), cooldown: def.cooldown ?? 0, dmg: def.damage ? [def.damage[0], def.damage[1]] : null, crit: 0, speed: 0, ready: 0, effects: [], dyn: [] };
  });
  const round = Math.min(Math.max(build.round, 1), data.rules.rounds);
  let maxHp = data.rules.heroHp[round - 1]! + hero.hpBonus;

  const staticMult = (e: Effect, it: CItem | null): number => {
    const per = e.per;
    if (!per || (!per.stars && !per.ship)) return 1;
    let count = 0;
    if (per.stars && it) count += it.starred.filter((j) => has(items[j]!.def, per.stars)).length;
    if (per.ship) count += items.filter((o) => has(o.def, per.ship)).length;
    // stacks divide at runtime, counts here
    if (!per.buff && !per.debuff) { count = Math.floor(count / (per.div ?? 1)); if (per.max !== undefined) count = Math.min(count, per.max); }
    return count;
  };
  const applyMod = (target: CItem, mod: Mod, k: number) => {
    if (mod.damage && target.dmg) { target.dmg[0] += mod.damage * k; target.dmg[1] += mod.damage * k; }
    if (mod.speed) target.speed += mod.speed * k;
    if (mod.crit) target.crit += mod.crit * k;
    if (mod.ready) target.ready = Math.min(100, target.ready + mod.ready * k);
  };
  const scale = (mod: Mod, k: number): Mod => Object.fromEntries(Object.entries(mod).map(([key, v]) => [key, (v as number) * k]));

  const watchers: CEffect[][] = items.map(() => []);
  const heroEffects: CEffect[] = [];
  const handle = (e: Effect, it: CItem | null) => {
    const mult = staticMult(e, it);
    if (e.on === "passive") {
      if (mult === 0) return;
      if (e.to === "hero") { maxHp += (e.mod!.maxHp ?? 0) * mult; return; }
      const targets = e.to === "self" ? (it ? [it] : []) : e.to === "stars" ? it!.starred.map((j) => items[j]!).filter((t) => has(t.def, e.tag)) : items.filter((t) => has(t.def, e.tag));
      for (const t of targets) {
        if (e.if?.phase) t.dyn.push({ phases: e.if.phase, mod: scale(e.mod!, mult) });
        else applyMod(t, e.mod!, mult);
      }
      if (e.mod!.maxHp) maxHp += e.mod!.maxHp * mult;
      return;
    }
    const ce: CEffect = { e, src: it ? it.idx : -1, mult };
    if (e.on === "starUse") { for (const j of it!.starred) if (has(items[j]!.def, e.tag)) watchers[j]!.push(ce); }
    else if (e.on === "shipUse") { for (const t of items) if (has(t.def, e.tag)) watchers[t.idx]!.push(ce); }
    else if (it) it.effects.push(ce);
    else heroEffects.push(ce);
  };
  for (const it of items) for (const e of it.def.effects) handle(e, it);
  for (const e of hero.effects) handle(e, null);
  // bags: passives for the items lying in them
  const under = build.items.map((_, i) => bagsUnder(board, build.items, i, data.shape));
  build.bags.forEach((bp, bi) => {
    for (const e of data.items.get(bp.item)!.effects) {
      if (e.to === "hero") maxHp += e.mod!.maxHp ?? 0;
      else for (const t of items) if (under[t.idx]!.includes(bi) && has(t.def, e.tag)) applyMod(t, e.mod!, 1);
    }
  });
  for (const it of items) if (it.dmg) { it.dmg[0] = Math.max(0, it.dmg[0]); it.dmg[1] = Math.max(it.dmg[0], it.dmg[1]); }
  return { hero, round, maxHp: Math.round(maxHp), items, heroEffects, watchers };
}
