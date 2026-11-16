/**
 * Plays a finished battle back over time. The battle is computed once (`simulate` with a log); a client steps this
 * replay forward and draws what it reports. Health and statuses are rebuilt from the log events only.
 */
import type { BattleEvent, BattleResult, Status } from "./battle.js";
import type { CSide } from "./compile.js";
import { BUFFS, DEBUFFS, type Rules } from "./schema.js";

export interface ReplaySide {
  hp: number;
  /** rebuilt from the refill rate, the attacks and the Energy events */
  energy: number;
  st: Record<Status, number>;
  /** the shown Shield is an estimate (a fully blocked hit is not in the log) */
  shieldRough: boolean;
}

export class Replay {
  readonly sides: [ReplaySide, ReplaySide];
  /** index into the star phases; phases.length = supernova */
  phaseIdx = 0;
  time = 0;
  done = false;
  private evIdx = 0;
  private tickDone = 0;
  private readonly log: BattleEvent[];
  private readonly endTick: number;

  constructor(private readonly c: [CSide, CSide], readonly result: BattleResult, private readonly rules: Rules) {
    this.log = result.log ?? [];
    this.endTick = Math.round(result.seconds / rules.battle.tick);
    this.sides = [0, 1].map((i) => ({
      hp: result.maxHp[i as 0 | 1], energy: Math.min(rules.energy.max, rules.energy.start), shieldRough: false,
      st: Object.fromEntries([...BUFFS, ...DEBUFFS].map((s) => [s, 0])) as Record<Status, number>,
    })) as [ReplaySide, ReplaySide];
  }

  /** Events before the first tick (battle start, first phase). Call once before stepping. */
  start(): BattleEvent[] {
    const out: BattleEvent[] = [];
    while (this.evIdx < this.log.length && this.log[this.evIdx]!.t <= 1e-6) { const e = this.log[this.evIdx++]!; this.apply(e); out.push(e); }
    return out;
  }

  /** Moves the replay forward by `seconds` of battle time and returns the events that happened. */
  advance(seconds: number): BattleEvent[] {
    const out: BattleEvent[] = [];
    if (this.done) return out;
    const tick = this.rules.battle.tick;
    this.time += seconds;
    while (this.tickDone < this.endTick && (this.tickDone + 1) * tick <= this.time) this.stepTick(out);
    if (this.tickDone >= this.endTick) this.finish(out);
    return out;
  }

  /** Jumps to the end. */
  finish(out: BattleEvent[] = []): BattleEvent[] {
    if (this.done) return out;
    while (this.tickDone < this.endTick) this.stepTick(out);
    while (this.evIdx < this.log.length) { const e = this.log[this.evIdx++]!; this.apply(e); out.push(e); }
    this.done = true;
    this.time = this.result.seconds;
    // the battle's own numbers are the truth
    this.sides[0].hp = this.result.hp[0]; this.sides[1].hp = this.result.hp[1];
    return out;
  }

  /** One battle tick: its events, then the silent decay of Cryo and Jam (not in the log). */
  private stepTick(out: BattleEvent[]): void {
    const B = this.rules.battle, R = this.rules.status;
    this.tickDone++;
    const T = this.tickDone * B.tick + 1e-6;
    const every = (interval: number) => this.tickDone % Math.max(1, Math.round(interval / B.tick)) === 0;
    this.sides.forEach((s, i) => { s.energy = Math.min(this.rules.energy.max, s.energy + Math.max(0, this.rules.energy.regen + this.c[i]!.energyBonus) * (1 + Math.min(R.overclock.capPct, s.st.overclock * R.overclock.energyPct) / 100) * B.tick); });
    let decayed = false;
    const decay = () => {
      if (decayed) return;
      decayed = true;
      for (const s of this.sides) {
        if (s.st.cryo > 0 && every(R.cryo.decayInterval)) s.st.cryo--;
        if (s.st.jam > 0 && every(R.jam.decayInterval)) s.st.jam--;
      }
    };
    while (this.evIdx < this.log.length && this.log[this.evIdx]!.t <= T) {
      const e = this.log[this.evIdx++]!;
      if (e.k === "phase" || e.k === "nova") decay();
      this.apply(e);
      out.push(e);
    }
    decay();
  }

  /** Shield a blocked hit took away: the log only carries the health lost, so a fully blocked hit is estimated. */
  private block(victim: ReplaySide, dmgKnown: number | null, lost: number, estimate: number): void {
    if (lost > 0 && dmgKnown === null) { victim.st.shield = 0; victim.shieldRough = false; return; }
    if (dmgKnown !== null) { victim.st.shield = Math.max(0, victim.st.shield - Math.max(0, dmgKnown - lost)); return; }
    if (victim.st.shield > 0) { victim.st.shield = Math.max(0, victim.st.shield - Math.round(estimate)); victim.shieldRough = true; }
  }

  private apply(e: BattleEvent): void {
    const me = this.sides[e.s], foe = this.sides[1 - e.s]!;
    const R = this.rules.status;
    switch (e.k) {
      case "attack": {
        const it = this.c[e.s]!.items[e.i];
        me.energy = Math.max(0, me.energy - (it?.energy ?? 0));
        foe.hp -= e.v;
        this.block(foe, null, e.v, it?.dmg ? (it.dmg[0] + it.dmg[1]) / 2 + me.st.power : 0);
        break;
      }
      case "damage":
        foe.hp -= e.v;
        if (e.w === "spikes") this.block(foe, me.st.spikes, e.v, 0);
        else {
          const effects = e.i >= 0 ? this.c[e.s]!.items[e.i]?.def.effects ?? [] : this.c[e.s]!.hero.effects;
          this.block(foe, null, e.v, effects.find((x) => x.do === "damage")?.n ?? 0);
        }
        break;
      case "tick":
        foe.hp -= e.v;
        if (e.w === "burn") { this.block(foe, foe.st.burn, e.v, 0); foe.st.burn = Math.max(0, foe.st.burn - R.burn.decay); }
        break;
      case "nova": me.hp -= e.v; break;
      case "heal": me.hp += e.v; break;
      case "gain": if (e.w) me.st[e.w as Status] += e.v; break;
      case "inflict": if (e.w) foe.st[e.w as Status] += e.v; break;
      case "strip": foe.st.shield = Math.max(0, foe.st.shield - e.v); break;
      case "cleanse": {
        let left = e.v;
        while (left > 0) {
          let top: (typeof DEBUFFS)[number] | null = null;
          for (const d of DEBUFFS) if (me.st[d] > 0 && (top === null || me.st[d] > me.st[top])) top = d;
          if (!top) break;
          const take = Math.min(left, me.st[top]); me.st[top] -= take; left -= take;
        }
        break;
      }
      case "phase": this.phaseIdx = e.v; break;
      case "miss": me.energy = Math.max(0, me.energy - (this.c[e.s]!.items[e.i]?.energy ?? 0)); break;
      case "energy": me.energy = Math.min(this.rules.energy.max, me.energy + e.v); break;
      case "use": break;
    }
  }
}
