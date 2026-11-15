/**
 * The fight screen: runs the battle once in the core, then plays the log back over time.
 * Health and statuses shown during playback are rebuilt from the log events (the core is not asked again).
 */
import { BUFFS, DEBUFFS, compile, simulate, type BattleEvent, type BattleResult, type Build, type CSide, type GameData, type Status } from "@backpack-space/core";
import { boardView, cap, h, setKids, type BoardView } from "./view";

export interface FightSetup { player: Build; ghost: Build; seed: number; note?: string }

const STATUSES: Status[] = [...BUFFS, ...DEBUFFS];
const SOURCES = ["weapon", "direct", "burn", "toxin", "spikes"] as const;

/** Running state of one side during playback. */
interface Live { hp: number; st: Record<Status, number>; shieldRough: boolean }

export function mountFight(root: HTMLElement, data: GameData, setup: FightSetup, onContinue: (won: boolean) => void): () => void {
  const rules = data.rules, B = rules.battle, R = rules.status;
  const sides: [CSide, CSide] = [compile(setup.player, data), compile(setup.ghost, data)];
  const result: BattleResult = simulate(sides[0], sides[1], rules, setup.seed, { log: true });
  const log: BattleEvent[] = result.log ?? [];
  const names = [`You · ${sides[0].hero.name}`, `Ghost · ${sides[1].hero.name}`];
  const short = ["You", "Ghost"];

  const live: [Live, Live] = [0, 1].map((i) => ({ hp: result.maxHp[i as 0 | 1], st: Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>, shieldRough: false })) as [Live, Live];
  let phaseIdx = 0, evIdx = 0, tickDone = 0, time = 0, speed = 1, done = false, raf = 0, last = 0;
  const endTick = Math.round(result.seconds / B.tick);
  const every = (interval: number) => tickDone % Math.max(1, Math.round(interval / B.tick)) === 0;

  // ---- DOM ----
  const phaseDefs = [...B.phases.map((p) => ({ name: p.name, seconds: p.seconds })), { name: B.supernova.name, seconds: Math.max(...B.phases.map((p) => p.seconds)) }];
  const novaAt = B.phases.reduce((a, p) => a + p.seconds, 0);
  const phaseEls = phaseDefs.map((p, i) => h("div", { class: "ph" + (i === phaseDefs.length - 1 ? " nova" : ""), style: `flex:${p.seconds}` }, h("div", { class: "ph-fill" }), h("span", null, p.name)));
  const clock = h("span", { class: "clock" }, "0.0 s");
  const boards: BoardView[] = [boardView(data, setup.player.bags, setup.player.items), boardView(data, setup.ghost.bags, setup.ghost.items)];
  const hpFill = [h("div", { class: "hp-fill" }), h("div", { class: "hp-fill foe" })];
  const hpNum = [h("span", { class: "hp-num" }), h("span", { class: "hp-num" })];
  const chips = [h("div", { class: "chips" }), h("div", { class: "chips" })];
  const sideEls = [0, 1].map((i) => h("div", { class: "fside" },
    h("div", { class: "fname" }, names[i]),
    h("div", { class: "hp" }, hpFill[i]!, hpNum[i]!),
    chips[i]!,
    h("div", { class: "fboard" }, boards[i]!.root)));
  const logEl = h("div", { class: "flog" });
  const speedBtns = [1, 2, 4].map((v) => h("button", { class: "btn small" + (v === 1 ? " on" : ""), "data-speed": v, onclick: () => { speed = v; speedBtns.forEach((b) => b.classList.toggle("on", b.dataset["speed"] === String(v))); } }, `${v}×`));
  const skipBtn = h("button", { class: "btn small", id: "skip", onclick: () => finish() }, "Skip ⏭");
  const resultEl = h("div", { class: "fresult" });
  setKids(root,
    h("div", { class: "topbar" }, h("b", null, `Round ${setup.player.round}/${rules.rounds} — Fight`), h("span", { class: "spacer" }), ...speedBtns, skipBtn),
    setup.note ? h("div", { class: "note" }, setup.note) : null,
    h("div", { class: "phasebar" }, ...phaseEls),
    h("div", { class: "clockrow" }, "Star clock: ", clock),
    h("div", { class: "fsides" }, sideEls[0]!, h("div", { class: "vs" }, "VS"), sideEls[1]!),
    resultEl,
    h("div", { class: "flog-title" }, "Battle log"),
    logEl,
  );

  const itemLabel = (s: number, i: number) => (i >= 0 ? sides[s]!.items[i]?.def.name ?? "Item" : sides[s]!.hero.name);
  const line = (e: BattleEvent): { text: string; cls: string } | null => {
    const me = short[e.s]!, foe = short[1 - e.s]!, src = itemLabel(e.s, e.i);
    switch (e.k) {
      case "attack": return { text: e.v > 0 ? `${me}: ${src} hits for ${e.v}${e.crit ? " — CRIT!" : ""}` : `${me}: ${src} hits${e.crit ? " (crit)" : ""}, fully blocked`, cls: e.crit ? "crit" : "" };
      case "miss": return { text: `${me}: ${src} misses (Jam)`, cls: "dimline" };
      case "damage": return { text: e.w === "spikes" ? `${me}: Spikes deal ${e.v} to ${foe}` : `${me}: ${src} deals ${e.v} damage`, cls: "" };
      case "heal": return { text: e.w === "regen" ? `${me}: Regen heals ${e.v}` : `${me}: ${src} heals ${e.v}`, cls: "good" };
      case "gain": return { text: `${me}: ${src} gives +${e.v} ${cap(e.w ?? "")}`, cls: "good" };
      case "inflict": return { text: `${me}: ${src} inflicts ${e.v} ${cap(e.w ?? "")} on ${foe}`, cls: "bad" };
      case "cleanse": return { text: `${me}: ${src} removes ${e.v} debuff stack${e.v === 1 ? "" : "s"}`, cls: "good" };
      case "strip": return { text: `${me}: ${src} destroys ${e.v} Shield of ${foe}`, cls: "bad" };
      case "tick": return { text: `${cap(e.w ?? "")} deals ${e.v} to ${foe}`, cls: "bad" };
      case "phase": return { text: `★ The star enters ${phaseDefs[e.v]?.name ?? e.w ?? "a new phase"}`, cls: "phaseline" };
      case "nova": return { text: `${B.supernova.name} burns ${me} for ${e.v}`, cls: "novaline" };
      case "energy": return { text: `${me}: ${src} gives +${e.v} Energy`, cls: "good" };
      case "use": return null;
    }
  };

  /** Shield a blocked hit took away: the log only carries the health lost, so a fully blocked hit is estimated. */
  const block = (victim: Live, dmgKnown: number | null, lost: number, estimate: number) => {
    if (lost > 0 && dmgKnown === null) { victim.st.shield = 0; victim.shieldRough = false; return; }
    if (dmgKnown !== null) { victim.st.shield = Math.max(0, victim.st.shield - Math.max(0, dmgKnown - lost)); return; }
    if (victim.st.shield > 0) { victim.st.shield = Math.max(0, victim.st.shield - Math.round(estimate)); victim.shieldRough = true; }
  };
  const flashItem = (s: number, i: number, cls: string) => {
    const el = boards[s]!.items[i];
    if (!el || done) return;
    el.classList.remove("flash", "flash-miss");
    void el.offsetWidth;
    el.classList.add(cls);
  };
  const applyEvent = (e: BattleEvent, quiet: boolean) => {
    const me = live[e.s], foe = live[1 - e.s]!;
    switch (e.k) {
      case "attack": {
        const it = sides[e.s]!.items[e.i];
        foe.hp -= e.v;
        block(foe, null, e.v, it?.dmg ? (it.dmg[0] + it.dmg[1]) / 2 + me.st.power : 0);
        if (!quiet) flashItem(e.s, e.i, "flash");
        break;
      }
      case "miss": if (!quiet) flashItem(e.s, e.i, "flash-miss"); break;
      case "use": if (!quiet) flashItem(e.s, e.i, "flash"); break;
      case "damage":
        foe.hp -= e.v;
        if (e.w === "spikes") block(foe, me.st.spikes, e.v, 0);
        else {
          const effects = e.i >= 0 ? sides[e.s]!.items[e.i]?.def.effects ?? [] : sides[e.s]!.hero.effects;
          block(foe, null, e.v, effects.find((x) => x.do === "damage")?.n ?? 0);
        }
        break;
      case "tick":
        foe.hp -= e.v;
        if (e.w === "burn") { block(foe, foe.st.burn, e.v, 0); foe.st.burn = Math.max(0, foe.st.burn - R.burn.decay); }
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
      case "phase": phaseIdx = e.v; break;
    }
    const l = line(e);
    if (l) {
      logEl.append(h("div", { class: `ll ${e.k === "phase" || e.k === "tick" || e.k === "nova" ? "" : e.s === 0 ? "mine" : "theirs"} ${l.cls}` }, h("span", { class: "lt" }, e.t.toFixed(1)), l.text));
      while (logEl.childElementCount > 300) logEl.firstElementChild!.remove();
    }
  };
  /** One battle tick: its events, then the silent decay of Cryo and Jam (not in the log). */
  const stepTick = (quiet: boolean) => {
    tickDone++;
    const T = tickDone * B.tick + 1e-6;
    let decayed = false;
    const decay = () => {
      if (decayed) return;
      decayed = true;
      for (const s of live) {
        if (s.st.cryo > 0 && every(R.cryo.decayInterval)) s.st.cryo--;
        if (s.st.jam > 0 && every(R.jam.decayInterval)) s.st.jam--;
      }
    };
    while (evIdx < log.length && log[evIdx]!.t <= T) {
      const e = log[evIdx++]!;
      if (e.k === "phase" || e.k === "nova") decay();
      applyEvent(e, quiet);
    }
    decay();
  };

  const paint = () => {
    for (const i of [0, 1] as const) {
      const s = live[i], max = result.maxHp[i];
      const hp = Math.max(0, s.hp);
      hpFill[i]!.style.width = `${Math.max(0, Math.min(100, (hp / max) * 100))}%`;
      hpNum[i]!.textContent = `${hp} / ${max}`;
      const list = STATUSES.filter((k) => s.st[k] > 0).map((k) => h("span", { class: `chip ${(BUFFS as readonly string[]).includes(k) ? "buff" : "debuff"} c-${k}`, title: k === "shield" && s.shieldRough ? "Shield (estimated: blocked hits are not in the log)" : cap(k) }, `${cap(k)} ${k === "shield" && s.shieldRough ? "≈" : ""}${s.st[k]}`));
      chips[i]!.replaceChildren(...(list.length ? list : [h("span", { class: "chip none" }, "no statuses")]));
    }
    let start = 0;
    phaseEls.forEach((el, i) => {
      const len = phaseDefs[i]!.seconds;
      const p = i < phaseIdx ? 1 : i > phaseIdx ? 0 : Math.max(0, Math.min(1, (time - start) / len));
      (el.firstElementChild as HTMLElement).style.width = `${p * 100}%`;
      el.classList.toggle("now", i === phaseIdx);
      start += len;
    });
    clock.textContent = `${Math.min(time, result.seconds).toFixed(1)} s · ${phaseDefs[phaseIdx]?.name ?? ""}${time > novaAt && phaseIdx === phaseDefs.length - 1 ? " — both take rising damage" : ""}`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const showResult = () => {
    const won = result.winner === 0;
    const st = result.stats;
    const rows = setup.player.items.map((p, i) => ({ name: data.items.get(p.item)?.name ?? p.item, uses: st[0].uses[i] ?? 0, dmg: st[0].itemDamage[i] ?? 0 })).sort((a, b) => b.dmg - a.dmg || b.uses - a.uses);
    const maxDmg = Math.max(1, ...rows.map((r) => r.dmg));
    const total = [0, 1].map((i) => SOURCES.reduce((a, k) => a + st[i as 0 | 1][k], 0));
    const bar = (v: number, max: number, cls = "") => h("div", { class: "bar" }, h("div", { class: `bar-fill ${cls}`, style: `width:${max > 0 ? (v / max) * 100 : 0}%` }));
    resultEl.replaceChildren(
      h("div", { class: `banner ${won ? "win" : "loss"}` },
        h("div", { class: "banner-title" }, won ? "Victory" : result.winner === -1 ? "Draw — counts as a defeat" : "Defeat"),
        h("div", { class: "banner-sub" }, `${result.seconds.toFixed(1)} s · ${result.supernova ? `ended in the ${B.supernova.name}` : `ended during ${phaseDefs[phaseIdx]?.name ?? "the fight"}`} · you ${Math.max(0, result.hp[0])}/${result.maxHp[0]} · ghost ${Math.max(0, result.hp[1])}/${result.maxHp[1]}`),
        h("button", { class: "btn primary", id: "continue", onclick: () => onContinue(won) }, "Continue ▶")),
      h("div", { class: "panel" },
        h("div", { class: "panel-title" }, "Your items"),
        h("table", { class: "tbl" },
          h("thead", null, h("tr", null, h("th", null, "Item"), h("th", { class: "num" }, "Uses"), h("th", { class: "num" }, "Damage"), h("th", null, ""))),
          h("tbody", null, ...rows.map((r) => h("tr", null, h("td", null, r.name), h("td", { class: "num" }, r.uses), h("td", { class: "num" }, r.dmg), h("td", { class: "barcell" }, bar(r.dmg, maxDmg))))))),
      h("div", { class: "panel" },
        h("div", { class: "panel-title" }, "Damage by source"),
        h("table", { class: "tbl" },
          h("thead", null, h("tr", null, h("th", null, "Source"), h("th", { class: "num" }, "You"), h("th", null, ""), h("th", { class: "num" }, "Ghost"), h("th", null, ""))),
          h("tbody", null,
            ...SOURCES.map((k) => h("tr", null, h("td", null, cap(k === "direct" ? "direct effects" : k === "weapon" ? "weapons" : k)), h("td", { class: "num" }, st[0][k]), h("td", { class: "barcell" }, bar(st[0][k], total[0]!)), h("td", { class: "num" }, st[1][k]), h("td", { class: "barcell" }, bar(st[1][k], total[1]!, "foe")))),
            h("tr", { class: "sum" }, h("td", null, "Total dealt"), h("td", { class: "num" }, total[0]), h("td", null, ""), h("td", { class: "num" }, total[1]), h("td", null, "")),
            h("tr", null, h("td", null, `${B.supernova.name} taken`), h("td", { class: "num" }, st[0].nova), h("td", null, ""), h("td", { class: "num" }, st[1].nova), h("td", null, "")),
            h("tr", null, h("td", null, "Healed"), h("td", { class: "num" }, st[0].healed), h("td", null, ""), h("td", { class: "num" }, st[1].healed), h("td", null, "")),
            h("tr", null, h("td", null, "Shield gained"), h("td", { class: "num" }, st[0].shielded), h("td", null, ""), h("td", { class: "num" }, st[1].shielded), h("td", null, ""))))),
    );
  };

  function finish(): void {
    if (done) return;
    while (tickDone < endTick || evIdx < log.length) { if (tickDone > endTick + 5) { while (evIdx < log.length) applyEvent(log[evIdx++]!, true); break; } stepTick(true); }
    done = true;
    cancelAnimationFrame(raf);
    time = result.seconds;
    // the core's numbers are the truth
    live[0].hp = result.hp[0]; live[1].hp = result.hp[1];
    for (const b of boards) for (const el of b.items) el.classList.remove("flash", "flash-miss");
    speedBtns.forEach((b) => (b.disabled = true)); skipBtn.disabled = true;
    paint();
    showResult();
  }
  const frame = (now: number) => {
    if (done) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt * speed;
    while (tickDone < endTick && (tickDone + 1) * B.tick <= time) stepTick(false);
    if (tickDone >= endTick) { finish(); return; }
    paint();
    raf = requestAnimationFrame(frame);
  };
  // events before the first tick (battle start, first phase)
  while (evIdx < log.length && log[evIdx]!.t <= 1e-6) applyEvent(log[evIdx++]!, false);
  paint();
  last = performance.now();
  raf = requestAnimationFrame(frame);
  return () => { done = true; cancelAnimationFrame(raf); };
}
