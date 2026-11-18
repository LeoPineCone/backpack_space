/**
 * The deterministic battle. Two compiled sides fight on a fixed tick; the same inputs and seed always give the same result.
 * The star ages through its phases while they fight; when the last phase ends it goes supernova and both heroes take rising damage.
 */
import type { CEffect, CItem, CSide } from "./compile.js";
import { Rng } from "./rng.js";
import { BUFFS, DEBUFFS, type Buff, type Debuff, type Rules } from "./schema.js";

export type Status = Buff | Debuff;
export interface BattleEvent {
  t: number;
  /** acting side */
  s: 0 | 1;
  /** item index, -1 = hero or the star */
  i: number;
  k: "attack" | "miss" | "damage" | "heal" | "gain" | "inflict" | "cleanse" | "strip" | "tick" | "phase" | "nova" | "use" | "energy";
  /** amount */
  v: number;
  /** status id, phase id, damage source or (attack, miss) the weapon's range */
  w?: string;
  crit?: boolean;
}
export interface SideStats {
  /** damage dealt to the enemy by source */
  weapon: number;
  direct: number;
  burn: number;
  toxin: number;
  spikes: number;
  /** received */
  nova: number;
  healed: number;
  shielded: number;
  /** Energy spent on attacks and gained from items (not the steady refill) */
  energySpent: number;
  energyGained: number;
  /** seconds weapons stood ready but waited for Energy, summed over weapons */
  energyWait: number;
  /** per item: activations and damage */
  uses: number[];
  itemDamage: number[];
  /** damage dealt to the enemy from the third star phase on (how late a build does its work) */
  late: number;
  /** weapon attacks (hits and misses) */
  attacks: number;
}
export interface BattleResult {
  /** 0 or 1; -1 = draw */
  winner: 0 | 1 | -1;
  seconds: number;
  hp: [number, number];
  maxHp: [number, number];
  /** the fight reached the supernova */
  supernova: boolean;
  /** side that had the higher health share when the supernova began (-1 = none/even) */
  leaderAtNova: number;
  stats: [SideStats, SideStats];
  log?: BattleEvent[];
}

interface Side {
  c: CSide;
  hp: number;
  energy: number;
  st: Record<Status, number>;
  prog: number[];
  low: boolean;
  stats: SideStats;
  /** healing from leech not yet paid out (below 1) */
  leech: number;
}

const newSide = (c: CSide, rules: Rules): Side => ({
  c,
  hp: c.maxHp,
  energy: Math.min(rules.energy.max, rules.energy.start),
  low: false,
  leech: 0,
  st: Object.fromEntries([...BUFFS, ...DEBUFFS].map((s) => [s, 0])) as Record<Status, number>,
  prog: c.items.map((it) => (it.cooldown * it.ready) / 100),
  stats: {
    weapon: 0,
    direct: 0,
    burn: 0,
    toxin: 0,
    spikes: 0,
    nova: 0,
    healed: 0,
    shielded: 0,
    energySpent: 0,
    energyGained: 0,
    energyWait: 0,
    uses: c.items.map(() => 0),
    itemDamage: c.items.map(() => 0),
    late: 0,
    attacks: 0,
  },
});

export function simulate(a: CSide, b: CSide, rules: Rules, seed: number, opts: { log?: boolean } = {}): BattleResult {
  const rng = new Rng(seed);
  const S: [Side, Side] = [newSide(a, rules), newSide(b, rules)];
  const R = rules.status,
    B = rules.battle;
  const log: BattleEvent[] | undefined = opts.log ? [] : undefined;
  const dt = B.tick;
  let tick = 0,
    t = 0;
  let phase = B.phases[0]!.id;
  const phaseStarts: { at: number; id: string }[] = [];
  {
    let at = 0;
    for (const p of B.phases) {
      phaseStarts.push({ at, id: p.id });
      at += p.seconds;
    }
    phaseStarts.push({ at, id: B.supernova.id });
  }
  const novaAt = phaseStarts[phaseStarts.length - 1]!.at;
  const lateAt = phaseStarts[Math.min(2, phaseStarts.length - 1)]!.at;
  let leaderAtNova = -1;
  const ev = (s: number, i: number, k: BattleEvent["k"], v: number, w?: string, crit?: boolean) => {
    if (log) log.push({ t: Math.round(t * 10) / 10, s: s as 0 | 1, i, k, v, ...(w ? { w } : {}), ...(crit ? { crit } : {}) });
  };

  /** Damage to side `to`; returns health lost. */
  const hurt = (to: number, amount: number, source: "weapon" | "direct" | "burn" | "toxin" | "spikes" | "nova", pierce: boolean, item = -1): number => {
    const d = S[to]!,
      o = S[1 - to]!;
    let dmg = Math.max(0, Math.round(amount));
    if (!pierce && d.st.shield > 0) {
      const block = Math.min(d.st.shield, dmg);
      d.st.shield -= block;
      dmg -= block;
    }
    d.hp -= dmg;
    if (source === "nova") d.stats.nova += dmg;
    else {
      o.stats[source] += dmg;
      if (t >= lateAt) o.stats.late += dmg;
    }
    if (item >= 0) o.stats.itemDamage[item]! += dmg;
    return dmg;
  };
  /** Heals side `side` by up to n; healing above full health becomes Shield for sides with overheal. Returns health gained. */
  const heal = (side: number, n: number, src: number, w?: string): number => {
    const me = S[side]!;
    const v = Math.min(me.c.maxHp - me.hp, n);
    if (v > 0) {
      me.hp += v;
      me.stats.healed += v;
      ev(side, src, "heal", v, w);
    }
    const over = me.c.overheal > 0 ? Math.floor(((n - Math.max(0, v)) * me.c.overheal) / 100) : 0;
    if (over > 0) {
      me.st.shield += over;
      me.stats.shielded += over;
      ev(side, src, "gain", over, "shield");
    }
    return v;
  };
  /** Leech: part of the damage an item deals heals its owner; fractions are kept until they make a whole point. */
  const leech = (side: number, it: CItem | undefined, dmg: number) => {
    if (!it || it.leech <= 0 || dmg <= 0) return;
    const me = S[side]!;
    me.leech += (dmg * it.leech) / 100;
    const whole = Math.floor(me.leech);
    if (whole > 0) {
      me.leech -= whole;
      heal(side, Math.round(reduced(me, whole)), it.idx, "leech");
    }
  };
  const reduced = (s: Side, n: number) => n * (1 - Math.min(R.radiation.capPct, s.st.radiation * R.radiation.reducePct) / 100);

  const apply = (side: number, ce: CEffect) => {
    const me = S[side]!,
      foe = S[1 - side]!,
      e = ce.e;
    if (e.if) {
      if (e.if.phase && !e.if.phase.includes(phase)) return;
      if (e.if.hpBelow !== undefined && me.hp >= (me.c.maxHp * e.if.hpBelow) / 100) return;
      if (e.if.chance !== undefined && rng.next() * 100 >= e.if.chance) return;
    }
    let k = ce.mult;
    const per = e.per;
    if (per && (per.buff || per.debuff)) {
      let stacks = (per.buff ? me.st[per.buff] : 0) + (per.debuff ? foe.st[per.debuff] : 0);
      if (per.stars || per.ship || per.cells) stacks *= ce.mult;
      k = Math.floor(stacks / (per.div ?? 1));
      if (per.max !== undefined) k = Math.min(k, per.max);
    }
    const n = Math.floor((e.n ?? 0) * k);
    if (n <= 0) return;
    if (e.gain) {
      const v = e.gain === "shield" ? Math.round(reduced(me, n)) : n;
      me.st[e.gain] += v;
      if (e.gain === "shield") me.stats.shielded += v;
      ev(side, ce.src, "gain", v, e.gain);
    } else if (e.inflict) {
      foe.st[e.inflict] += n;
      ev(side, ce.src, "inflict", n, e.inflict);
    } else if (e.do === "damage") {
      ev(side, ce.src, "damage", hurt(1 - side, n, "direct", false, ce.src), "direct");
      if (ce.src >= 0) leech(side, me.c.items[ce.src], n);
    } else if (e.do === "heal") {
      heal(side, Math.round(reduced(me, n)), ce.src);
    } else if (e.do === "cleanse") {
      let left = n;
      while (left > 0) {
        let top: Debuff | null = null;
        for (const d of DEBUFFS) if (me.st[d] > 0 && (top === null || me.st[d] > me.st[top])) top = d;
        if (!top) break;
        const take = Math.min(left, me.st[top]);
        me.st[top] -= take;
        left -= take;
      }
      if (left < n) ev(side, ce.src, "cleanse", n - left);
    } else if (e.do === "energy") {
      const v = Math.min(rules.energy.max - me.energy, n);
      if (v > 0) {
        me.energy += v;
        me.stats.energyGained += v;
        ev(side, ce.src, "energy", v);
      }
    } else if (e.do === "strip") {
      const take = Math.min(n, foe.st.shield);
      if (take > 0) {
        foe.st.shield -= take;
        ev(side, ce.src, "strip", take);
      }
    }
  };
  const fire = (side: number, on: CEffect["e"]["on"], it: CItem | null, phaseId?: string) => {
    const list = it ? it.effects : S[side]!.c.heroEffects;
    for (const ce of list) if (ce.e.on === on && (on !== "phase" || !ce.e.phase || ce.e.phase === phaseId)) apply(side, ce);
  };
  const fireAll = (side: number, on: CEffect["e"]["on"], phaseId?: string) => {
    fire(side, on, null, phaseId);
    for (const it of S[side]!.c.items) fire(side, on, it, phaseId);
  };
  const checkLow = (side: number) => {
    const s = S[side]!;
    if (!s.low && s.hp > 0 && s.hp < (s.c.maxHp * B.lowHpPct) / 100) {
      s.low = true;
      fireAll(side, "lowHp");
    }
  };

  const activate = (side: number, it: CItem) => {
    const me = S[side]!,
      foe = S[1 - side]!;
    me.stats.uses[it.idx]!++;
    if (it.dmg) {
      const miss = Math.min(R.jam.capPct, me.st.jam * R.jam.missPct);
      me.energy -= it.energy;
      me.stats.energySpent += it.energy;
      me.stats.attacks++;
      if (rng.next() * 100 < miss) ev(side, it.idx, "miss", 0, it.range ?? undefined);
      else {
        let bonus = 0,
          crit = it.crit;
        for (const d of it.dyn)
          if (d.phases.includes(phase)) {
            bonus += d.mod.damage ?? 0;
            crit += d.mod.crit ?? 0;
          }
        let dmg = it.dmg[0] + rng.int(it.dmg[1] - it.dmg[0] + 1) + bonus + me.st.power;
        const isCrit = crit > 0 && rng.next() * 100 < crit;
        if (isCrit) dmg *= B.critMult;
        ev(side, it.idx, "attack", hurt(1 - side, dmg, "weapon", false, it.idx), it.range ?? undefined, isCrit);
        leech(side, it, dmg);
        fire(side, "hit", it);
        if (foe.st.spikes > 0) ev(1 - side, -1, "damage", hurt(side, foe.st.spikes, "spikes", false), "spikes");
        fireAll(1 - side, "attacked");
      }
    } else ev(side, it.idx, "use", 0);
    fire(side, "use", it);
    for (const ce of me.c.watchers[it.idx]!) apply(side, ce);
  };

  const every = (interval: number) => {
    const n = Math.round(interval / dt);
    return tick % n === 0;
  };
  let winner: 0 | 1 | -1 | null = null;
  let nextPhase = 0;
  const maxTicks = Math.round(B.maxSeconds / dt);

  while (winner === null) {
    // star phases
    while (nextPhase < phaseStarts.length && t >= phaseStarts[nextPhase]!.at - 1e-9) {
      phase = phaseStarts[nextPhase]!.id;
      ev(0, -1, "phase", nextPhase, phase);
      if (phase === B.supernova.id) {
        const r0 = S[0].hp / S[0].c.maxHp,
          r1 = S[1].hp / S[1].c.maxHp;
        leaderAtNova = r0 === r1 ? -1 : r0 > r1 ? 0 : 1;
      }
      const first = tick % 2;
      if (nextPhase === 0) {
        fireAll(first, "start");
        fireAll(1 - first, "start");
      }
      fireAll(first, "phase", phase);
      fireAll(1 - first, "phase", phase);
      nextPhase++;
    }
    tick++;
    t = tick * dt;
    const order = tick % 2 === 0 ? [0, 1] : [1, 0];
    // items
    for (const side of order) {
      const me = S[side]!;
      // Overclock also refills Energy faster, so that faster weapons do not starve
      me.energy = Math.min(
        rules.energy.max,
        me.energy + Math.max(0, rules.energy.regen + me.c.energyBonus) * (1 + Math.min(R.overclock.capPct, me.st.overclock * R.overclock.energyPct) / 100) * dt,
      );
      const global =
        (1 + Math.min(R.overclock.capPct, me.st.overclock * R.overclock.speedPct) / 100) * (1 - Math.min(R.cryo.capPct, me.st.cryo * R.cryo.slowPct) / 100);
      for (const it of me.c.items) {
        if (!it.cooldown) continue;
        let speed = it.speed;
        for (const d of it.dyn) if (d.mod.speed && d.phases.includes(phase)) speed += d.mod.speed;
        me.prog[it.idx]! += dt * global * Math.max(0.1, 1 + speed / 100);
        let guard = 0;
        while (me.prog[it.idx]! >= it.cooldown - 1e-9 && guard++ < 5) {
          // a weapon without enough Energy stays ready and waits
          if (it.dmg && me.energy < it.energy - 1e-9) {
            me.prog[it.idx] = it.cooldown;
            me.stats.energyWait += dt;
            break;
          }
          me.prog[it.idx]! -= it.cooldown;
          activate(side, it);
        }
      }
    }
    // statuses
    for (const side of order) {
      const me = S[side]!;
      if (me.st.burn > 0 && every(R.burn.interval)) {
        ev(1 - side, -1, "tick", hurt(side, me.st.burn, "burn", false), "burn");
        me.st.burn = Math.max(0, me.st.burn - R.burn.decay);
      }
      if (me.st.toxin > 0 && every(R.toxin.interval)) ev(1 - side, -1, "tick", hurt(side, me.st.toxin, "toxin", true), "toxin");
      if (me.st.regen > 0 && every(R.regen.interval)) {
        heal(side, Math.round(reduced(me, me.st.regen)), -1, "regen");
      }
      if (me.st.cryo > 0 && every(R.cryo.decayInterval)) me.st.cryo--;
      if (me.st.jam > 0 && every(R.jam.decayInterval)) me.st.jam--;
    }
    // supernova
    if (t > novaAt + 1e-9) {
      const n = Math.round(B.supernova.interval / dt),
        since = tick - Math.round(novaAt / dt);
      if (since % n === 0) {
        const k = since / n;
        for (const side of order) {
          const me = S[side]!;
          const pct = (B.supernova.basePct + B.supernova.growthPct * (k - 1)) * (1 - me.c.hero.supernovaResist / 100);
          ev(side, -1, "nova", hurt(side, (me.c.maxHp * pct) / 100, "nova", true));
        }
      }
    }
    checkLow(0);
    checkLow(1);
    const d0 = S[0].hp <= 0,
      d1 = S[1].hp <= 0;
    if (d0 || d1) winner = d0 && d1 ? (S[0].hp === S[1].hp ? -1 : S[0].hp > S[1].hp ? 0 : 1) : d0 ? 1 : 0;
    else if (tick >= maxTicks) {
      const r0 = S[0].hp / S[0].c.maxHp,
        r1 = S[1].hp / S[1].c.maxHp;
      winner = r0 === r1 ? -1 : r0 > r1 ? 0 : 1;
    }
  }
  return {
    winner,
    seconds: Math.round(t * 10) / 10,
    hp: [S[0].hp, S[1].hp],
    maxHp: [S[0].c.maxHp, S[1].c.maxHp],
    supernova: t > novaAt,
    leaderAtNova,
    stats: [S[0].stats, S[1].stats],
    ...(log ? { log } : {}),
  };
}
