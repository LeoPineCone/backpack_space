/**
 * Which number moves which target, and by how much?
 *   npm run balance:sense -- --knobs hero:venn [--name main] [--sims N] [--price] [--allow-hero-rules]
 *   --knobs: hero:<id> | path:<hero>/<path> | item:<id,id> | rule:<path>@<step> | herorule:<id>, joined with "+"
 *
 * Turns every knob one step towards "stronger" (about 10 %, see knobs.ts) and replays the baseline's lobbies:
 * one line per knob with the paired change of the hero, its paths and the other heroes. Shows the strong levers,
 * the dead numbers (no fight changed) and the side effects before anything is tuned.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startReport } from "../reports/common";
import { Bench } from "./bench";
import { changeOf, selectKnobs, showKnobValue, valueAt, type Knob } from "./knobs";
import { paired, type Metrics } from "./metrics";

export interface Sensed {
  knob: Knob;
  refought: number;
  flipped: number;
  /** metric key -> [change, standard error] for one step */ d: Record<string, [number, number]>;
}

/** One replay per knob, one step stronger. */
export function senseKnobs(bench: Bench, knobs: readonly Knob[], onKnob?: (i: number, k: Knob) => void): Sensed[] {
  const out: Sensed[] = [];
  knobs.forEach((knob, i) => {
    onKnob?.(i, knob);
    const c = changeOf(knob, 1);
    if (!c) return;
    const x = bench.run({ changes: [c] });
    const d: Record<string, [number, number]> = {};
    for (const [key, m] of bench.base[0]!) {
      const p = paired(m, x.metrics.get(key)!);
      d[key] = [p.d, Number.isFinite(p.se) ? p.se : 0];
    }
    out.push({ knob, refought: x.refought, flipped: x.flipped, d });
  });
  return out;
}

const isMain = process.argv[1]?.endsWith("sense.ts");
if (isMain) {
  const r = startReport({
    id: "sense",
    title: "Sensitivity of the targets",
    question: "Which item number moves which target by how much (one step stronger, about 10 %)?",
    presets: { quick: { lobbies: 60 }, normal: { lobbies: 120 }, precise: { lobbies: 1000 } },
    explain: { lobbies: "lobbies of the baseline's first seed that are replayed (at most what the baseline has)" },
  });
  if (!r.flags.knobs) throw new Error("--knobs is needed: hero:<id> | path:<hero>/<path> | item:<id,id> | rule:<path>@<step>, joined with +");
  const name = r.flags.name ?? "main";
  const bench = new Bench(name, undefined, r.n.lobbies);
  const data = bench.data;
  const knobs = selectKnobs(data, bench.raw, r.flags.knobs, { price: !!r.flags.price, heroRules: !!r.flags["allow-hero-rules"] });
  r.log(
    `Baseline "${name}", seed ${bench.panels[0]!.seed}, ${bench.panels[0]!.lobbies.length} lobbies.${bench.fresh ? "" : " STALE: data/ or the ratings changed since; take a new one (npm run baseline)."} ${knobs.length} knobs.`,
  );
  const sensed = senseKnobs(bench, knobs, (i, k) => r.progress(`knob ${i + 1}/${knobs.length} ${k.id}`));

  const pp = (x: [number, number] | undefined) => {
    if (!x) return "";
    const v = 100 * x[0];
    return Math.abs(v) < 0.05 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}${Math.abs(x[0]) >= 2 * x[1] && Math.abs(v) >= 0.3 ? " *" : ""}`;
  };
  const base: Metrics = bench.base[0]!;
  const heroesOf = (s: Sensed) => (s.knob.where.item ? data.items.get(s.knob.where.item)!.hero : s.knob.where.hero);
  for (const h of data.heroList) {
    const rows = sensed.filter((s) => heroesOf(s) === h.id).sort((a, b) => Math.abs(b.d[`hero:${h.id}`]?.[0] ?? 0) - Math.abs(a.d[`hero:${h.id}`]?.[0] ?? 0));
    if (!rows.length) continue;
    const others = data.heroList.filter((o) => o.id !== h.id);
    r.log();
    r.log(`## ${h.name}: one step stronger, change in points of win share`);
    r.table(
      [
        "knob",
        "step",
        "fights",
        "winner changed",
        `${h.id} overall`,
        ...h.paths.map((p) => p.name),
        ...h.paths.map((p) => `${p.name}, late`),
        ...others.map((o) => `${o.id} overall`),
        "",
      ],
      rows.map((s) => [
        s.knob.label,
        `${showKnobValue(s.knob.base)} → ${showKnobValue(valueAt(s.knob, 1))}`,
        s.refought,
        s.flipped,
        pp(s.d[`hero:${h.id}`]),
        ...h.paths.map((p) => pp(s.d[`path:${h.id}/${p.id}`])),
        ...h.paths.map((p) => pp(s.d[`late:${h.id}/${p.id}`])),
        ...others.map((o) => pp(s.d[`hero:${o.id}`])),
        s.refought === 0 ? "not owned" : s.flipped === 0 ? "dead" : s.knob.botsRead ? "bots read it" : "",
      ]),
    );
  }
  const rest = sensed.filter((s) => !heroesOf(s));
  if (rest.length) {
    r.log();
    r.log("## General items and rules: one step stronger, change in points of win share");
    r.table(
      ["knob", "step", "fights", "winner changed", ...data.heroList.map((o) => `${o.id} overall`), ""],
      rest.map((s) => [
        s.knob.label,
        `${showKnobValue(s.knob.base)} → ${showKnobValue(valueAt(s.knob, 1))}`,
        s.refought,
        s.flipped,
        ...data.heroList.map((o) => pp(s.d[`hero:${o.id}`])),
        s.refought === 0 ? "not owned" : s.flipped === 0 ? "dead" : s.knob.botsRead ? "bots read it" : "",
      ]),
    );
  }
  r.log();
  r.log(
    'Reading: every line is one replay with only that number changed. "fights" = fights with the item that were fought again; "winner changed" = how many of them flipped.',
  );
  r.log(
    '* = at least two standard errors (paired). "dead": no fight changed its winner, the number is saturated or irrelevant. "not owned": no bot of the baseline holds the item.',
  );
  r.log(
    '"bots read it": bots use this number when they shop or lay out (cooldown, Energy, price); the replay is an estimate, confirm with balance:replay --full.',
  );
  void base;
  mkdirSync(join("out", "balance"), { recursive: true });
  writeFileSync(join("out", "balance", "sense.json"), JSON.stringify(sensed) + "\n");
  r.log("All numbers (every metric per knob): out/balance/sense.json");
  r.done();
}
