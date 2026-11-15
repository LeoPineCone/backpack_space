/**
 * Running numbers of a packed backpack for the shop screen: what it uses and gains per second, how hard it hits.
 * They are estimates from cooldowns and effects without an opponent: no Cryo, Jam, Shield or phase changes on the other side.
 * The fight itself (battle.ts) stays the only truth.
 */
import type { CEffect, CItem, CSide } from "./compile.js";
import { DEBUFFS, type Debuff, type Rules } from "./schema.js";

export interface BuildStats {
  maxHp: number;
  energy: {
    /** Energy per second all weapons would use if they never waited (with their speed bonuses and Overclock from the start) */
    need: number;
    /** Energy per second that comes in: refill plus items */
    income: number;
    /** the refill from the rules plus refill bonuses of items */
    refill: number;
    /** Energy per second from item effects (on use, per phase, on hit …) */
    fromItems: number;
    /** share of a typical fight (20 s) that weapons wait for Energy, after the full bar at the start is used up (0–1) */
    wait: number;
  };
  /** damage per second: weapon hits (after waiting for Energy, with crit) and direct damage of effects */
  dps: { weapons: number; direct: number };
  /** debuff stacks put on the enemy per second */
  inflict: Partial<Record<Debuff, number>>;
  healPerSec: number;
  shieldStart: number;
  shieldPerSec: number;
  melee: number;
  ranged: number;
  /** some effects could not be counted exactly (chance, phase, health, stacks, being hit) */
  rough: boolean;
}

/** Overclock that keeps coming counts with the stacks it has reached halfway through a typical fight */
const HALF_FIGHT = 10;

export function buildStats(side: CSide, rules: Rules): BuildStats {
  const phases = rules.battle.phases;
  const phaseLen = phases.reduce((s, p) => s + p.seconds, 0) / phases.length;
  /** Overclock speeds up every item */
  let global = 1;
  const rate = (it: CItem) => (it.cooldown ? (global * Math.max(0.1, 1 + it.speed / 100)) / it.cooldown : 0);
  const weapons = side.items.filter((it) => it.dmg);
  let need = 0;
  let rough = false;

  /** How often an effect fires per second, and how much it gives once at the start. */
  interface Tally { energy: number; heal: number; direct: number; shield: number; shieldStart: number; power: number; overclock: number; inflict: Partial<Record<Debuff, number>> }
  const tally = (scale: number): Tally => {
    const t: Tally = { energy: 0, heal: 0, direct: 0, shield: 0, shieldStart: 0, power: 0, overclock: 0, inflict: {} };
    const add = (ce: CEffect, perSec: number, once: number) => {
      const e = ce.e;
      if (e.on === "passive") return;
      let k = ce.mult;
      if (e.per?.buff || e.per?.debuff) { rough = true; return; }
      if (e.if?.chance !== undefined) { k *= e.if.chance / 100; rough = true; }
      if (e.if?.phase) { k *= e.if.phase.filter((p) => phases.some((q) => q.id === p)).length / phases.length; rough = true; }
      if (e.if?.hpBelow !== undefined) { rough = true; return; }
      const n = (e.n ?? 0) * k;
      const put = (key: "energy" | "heal" | "direct" | "shield") => { t[key] += n * perSec; if (key === "shield") t.shieldStart += n * once; };
      if (e.do === "energy") put("energy");
      else if (e.do === "heal") put("heal");
      else if (e.do === "damage") put("direct");
      else if (e.gain === "shield") put("shield");
      else if (e.gain === "power") t.power += n * once;
      else if (e.gain === "overclock") { t.overclock += n * once; if (perSec > 0) { t.overclock += n * perSec * HALF_FIGHT; rough = true; } }
      else if (e.inflict) t.inflict[e.inflict] = (t.inflict[e.inflict] ?? 0) + n * perSec;
    };
    const timing = (ce: CEffect, it: CItem | null): [number, number] => {
      const e = ce.e;
      const r = it ? rate(it) * (it.dmg ? scale : 1) : 0;
      switch (e.on) {
        case "use": return [r, 0];
        case "hit": return [r, 0];
        case "start": return [0, 1];
        case "phase":
          if (e.phase) { rough = true; return [0, 0]; }
          return [1 / phaseLen, 1];
        default: rough = true; return [0, 0];
      }
    };
    for (const it of side.items) for (const ce of it.effects) { const [ps, once] = timing(ce, it); add(ce, ps, once); }
    for (const ce of side.heroEffects) { const [ps, once] = timing(ce, null); add(ce, ps, once); }
    // starUse / shipUse: fire when the watched item activates
    side.watchers.forEach((list, j) => { const it = side.items[j]!; for (const ce of list) add(ce, rate(it) * (it.dmg ? scale : 1), 0); });
    return t;
  };

  const refill = Math.max(0, rules.energy.regen + side.energyBonus);
  // first without waiting, then with the waiting that follows (Energy on hit depends on how often weapons hit)
  let scale = 1, t = tally(1);
  const oc = rules.status.overclock;
  global = 1 + Math.min(oc.capPct, t.overclock * oc.speedPct) / 100;
  need = weapons.reduce((s, it) => s + rate(it) * it.energy, 0);
  for (let i = 0; i < 3; i++) { scale = need > 0 ? Math.min(1, (refill + t.energy) / need) : 1; t = tally(scale); }
  const income = refill + t.energy;

  // the full bar at the start covers the first seconds; averaged over a typical fight
  const deficit = need - income, fight = 2 * HALF_FIGHT;
  const wait = deficit > 0 ? (1 - income / need) * Math.max(0, 1 - rules.energy.start / deficit / fight) : 0;
  const critMult = rules.battle.critMult;
  const weaponDps = weapons.reduce((s, it) => {
    const avg = (it.dmg![0] + it.dmg![1]) / 2 + t.power;
    const crit = Math.min(100, it.crit) / 100;
    return s + rate(it) * scale * avg * (1 + crit * (critMult - 1));
  }, 0);
  const inflict: Partial<Record<Debuff, number>> = {};
  for (const d of DEBUFFS) if ((t.inflict[d] ?? 0) > 0) inflict[d] = t.inflict[d]!;
  return {
    maxHp: side.maxHp,
    energy: { need, income, refill, fromItems: t.energy, wait },
    dps: { weapons: weaponDps, direct: t.direct },
    inflict,
    healPerSec: t.heal,
    shieldStart: t.shieldStart,
    shieldPerSec: t.shield,
    melee: weapons.filter((it) => it.range === "melee").length,
    ranged: weapons.filter((it) => it.range === "ranged").length,
    rough,
  };
}
