/**
 * Proposes the smallest set of number changes that brings the targets into their bands.
 *   npm run balance:propose -- --knobs hero:venn [--name main] [--out-name venn] [--kinds hero,third,path,late,spread,duel,secs,nova]
 *       [--max-knobs 4] [--max-steps 3] [--margin 0.5] [--sims N] [--price] [--allow-hero-rules]
 *
 * It only proposes: the result is a patch file (out/proposals/<name>.json) and this report. Nothing in data/ changes.
 * How it works: (1) one replay per knob gives a first guess of what each number does; (2) a search takes the step
 * that, by that guess, brings the targets closest to their bands for the least change, checks it with a real replay
 * and keeps it only if it really helped; (3) every kept step is tried smaller again; (4) the proposal is measured
 * on the baseline's second seed, which the search never saw.
 * "Loss" = sum of squared distances to the target bands (points of win share, seconds); 0 = everything on target.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTargets, startReport } from "../reports/common";
import type { Mark } from "../reports/html";
import { Bench } from "./bench";
import { changeOf, selectKnobs, showKnobValue, valueAt } from "./knobs";
import { DEFAULT_KINDS, isSeconds, KINDS, loss, outside, paired, type Kind, type LossOpts, type Metrics } from "./metrics";
import { mergePatches, type Patch } from "./patch";
import { senseKnobs } from "./sense";
import { KIND_TITLES, markFor, showChange, showMetric, showTarget, showValue } from "./show";

const r = startReport({
  id: "propose",
  title: "Proposal",
  question: "Which few number changes bring the targets into their bands, and what else do they move?",
  presets: { quick: { lobbies: 60 }, normal: { lobbies: 240 }, precise: { lobbies: 1000 } },
  explain: { lobbies: "lobbies per seed that are replayed (at most what the baseline has)" },
});
if (!r.flags.knobs) throw new Error("--knobs is needed: hero:<id> | path:<hero>/<path> | item:<id,id> | rule:<path>@<step>, joined with +");
const name = r.flags.name ?? "main";
const bench = new Bench(name, undefined, r.n.lobbies);
const data = bench.data, T = loadTargets();
const o: LossOpts = { kinds: (r.flags.kinds?.split(",") as Kind[] | undefined) ?? DEFAULT_KINDS, margin: Number(r.flags.margin ?? 0.5) / 100, marginSeconds: 0.5 };
const maxKnobs = Number(r.flags["max-knobs"] ?? 4), maxSteps = Number(r.flags["max-steps"] ?? 3);
/** a step must lower the loss by at least this much; a knob not used yet costs more (few changes, each worth it) */
const STEP_COST = 0.25, NEW_KNOB_COST = 0.5, TRIES = 3, MAX_ROUNDS = 24;

const knobs = selectKnobs(data, bench.raw, r.flags.knobs, { price: !!r.flags.price, heroRules: !!r.flags["allow-hero-rules"] });
const byId = new Map(knobs.map((k) => [k.id, k]));
r.log(`Baseline "${name}", ${bench.panels[0]!.lobbies.length} lobbies per seed; search on seed ${bench.panels[0]!.seed}${bench.panels[1] ? `, check on seed ${bench.panels[1].seed}` : ""}.${bench.fresh ? "" : " STALE: data/ or the ratings changed since; take a new one (npm run baseline)."}`);
r.log(`Targets that count: ${o.kinds.join(", ")} (aim ${(100 * o.margin).toFixed(1)} points inside each band). At most ${maxKnobs} numbers changed, each at most ${maxSteps} steps. ${knobs.length} knobs.`);

const base = bench.base[0]!;
const lossOf = (m: Metrics) => loss((k) => m.get(k)?.value, base, T, o);
const patchOf = (state: Map<string, number>): Patch => mergePatches(...[...state].map(([id, steps]) => ({ changes: [changeOf(byId.get(id)!, steps)!] })));
const cost = (state: Map<string, number>) => [...state.values()].reduce((s, v) => s + STEP_COST * Math.abs(v) + NEW_KNOB_COST, 0);

// ---- 1. first guess: what one step of every knob does
const sensed = senseKnobs(bench, knobs, (i, k) => r.progress(`first guess: knob ${i + 1}/${knobs.length} ${k.id}`));
const guess = new Map(sensed.filter((s) => s.flipped > 0).map((s) => [s.knob.id, new Map(Object.entries(s.d).map(([k, v]) => [k, v[0]]))]));
r.log(`${guess.size} of ${knobs.length} knobs change at least one fight (the others are dead or not owned and stay out).`);

// ---- 2. search
const state = new Map<string, number>();
let cur = base, L = lossOf(cur);
const L0 = L;
const tabu = new Set<string>();
const steps: string[] = [];
for (let round = 0; round < MAX_ROUNDS && L > 0; round++) {
  const cands: { id: string; to: number; gain: number }[] = [];
  for (const [id, g] of guess) {
    const at = state.get(id) ?? 0;
    for (const dir of [1, -1]) {
      const to = at + dir;
      if (Math.abs(to) > maxSteps || tabu.has(`${id}@${to}`) || changeOf(byId.get(id)!, to) === undefined) continue;
      if (at === 0 && state.size >= maxKnobs) continue;
      const next = new Map(state); if (to === 0) next.delete(id); else next.set(id, to);
      const predicted = loss((k) => cur.get(k)!.value + dir * (g.get(k) ?? 0), base, T, o);
      cands.push({ id, to, gain: L + cost(state) - predicted - cost(next) });
    }
  }
  cands.sort((a, b) => b.gain - a.gain);
  let best: { id: string; to: number; m: Metrics; l: number; score: number } | undefined;
  for (const c of cands.slice(0, TRIES)) {
    if (c.gain <= 0) break;
    r.progress(`search: round ${round + 1}, loss ${L.toFixed(1)}, trying ${c.id} → step ${c.to}`);
    const next = new Map(state); if (c.to === 0) next.delete(c.id); else next.set(c.id, c.to);
    const m = bench.run(patchOf(next)).metrics, l = lossOf(m);
    const score = L + cost(state) - l - cost(next);
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, to: c.to, m, l, score };
    else tabu.add(`${c.id}@${c.to}`);
  }
  if (!best) break;
  const at = state.get(best.id) ?? 0, dir = best.to - at;
  // what the step really did replaces the first guess for this knob
  guess.set(best.id, new Map([...best.m].map(([k, m]) => [k, dir * (m.value - cur.get(k)!.value)])));
  if (best.to === 0) state.delete(best.id); else state.set(best.id, best.to);
  const k = byId.get(best.id)!;
  steps.push(`${k.label}: ${showKnobValue(valueAt(k, at))} → ${showKnobValue(valueAt(k, best.to))}   loss ${L.toFixed(1)} → ${best.l.toFixed(1)}`);
  cur = best.m; L = best.l;
}
// ---- 3. every kept change once more a step smaller: keep the smaller one when it is as good
for (const [id, at] of [...state]) {
  const to = at - Math.sign(at);
  const next = new Map(state); if (to === 0) next.delete(id); else next.set(id, to);
  const m = bench.run(patchOf(next)).metrics, l = lossOf(m);
  if (l + cost(next) <= L + cost(state)) {
    const k = byId.get(id)!;
    steps.push(`${k.label}: back to ${showKnobValue(valueAt(k, to))}   loss ${L.toFixed(1)} → ${l.toFixed(1)}`);
    if (to === 0) state.delete(id); else state.set(id, to);
    cur = m; L = l;
  }
}

// ---- result
const patch: Patch = { name: r.flags["out-name"] ?? r.flags.knobs, ...patchOf(state) };
r.log();
r.log("## Search");
if (!steps.length) r.log(L0 === 0 ? "  Every target that counts is on target already: nothing to propose." : "  No step of these knobs brings the targets closer for a change that is worth it.");
for (const s of steps) r.log(`  ${s}`);
r.log();
r.log(`## Proposed changes (${state.size})`);
if (!state.size) r.log("  none");
const rows = [...state].map(([id, st]) => { const k = byId.get(id)!; return [k.label, showKnobValue(k.base), showKnobValue(valueAt(k, st)), `${st > 0 ? "+" : ""}${st} ${Math.abs(st) === 1 ? "step" : "steps"}`, k.botsRead ? "bots read it: confirm with --full" : "replay is exact"]; });
if (rows.length) r.table(["number", "now", "proposed", "", ""], rows);
r.log(`Loss (distance to the targets that count): ${L0.toFixed(1)} → ${L.toFixed(1)}${L === 0 ? " (everything that counts is on target)" : ""}.`);

if (state.size) {
  const check = bench.panels[1] ? bench.run(patch, 1).metrics : undefined;
  const status = (kind: Kind, v: number) => outside(T[KINDS[kind]], Math.round(v * 100) / 100) > 0;
  for (const kind of Object.keys(KINDS) as Kind[]) {
    const all = [...base.values()].filter((m) => m.kind === kind);
    const shown = all.filter((m) => { const p = paired(m, cur.get(m.key)!); return (Math.abs(p.d) >= 2 * p.se && Math.abs(p.d) >= (isSeconds(kind) ? 0.2 : 0.005)) || status(kind, m.value) !== status(kind, cur.get(m.key)!.value); });
    if (!shown.length) continue;
    r.log();
    r.log(`## ${KIND_TITLES[kind]} [target ${showTarget(kind, T)}]${o.kinds.includes(kind) ? "" : " (does not count in this search)"}`);
    const marks: Mark[][] = shown.map((m) => ["", markFor(kind, T, m.value), markFor(kind, T, cur.get(m.key)!.value)]);
    r.table(["", "before", "after", `change, seed ${bench.panels[0]!.seed}`, ...(check ? [`change, seed ${bench.panels[1]!.seed} (check)`] : [])],
      shown.map((m) => [m.label, showMetric(m), showValue(kind, cur.get(m.key)!.value), showChange(kind, paired(m, cur.get(m.key)!)), ...(check ? [showChange(kind, paired(bench.base[1]!.get(m.key)!, check.get(m.key)!))] : [])]), undefined, marks);
  }
  const still = [...base.values()].filter((m) => o.kinds.includes(m.kind) && status(m.kind, cur.get(m.key)!.value));
  r.log();
  r.log(still.length ? `Still off with these knobs (${still.length}): ${still.map((m) => `${m.label} ${showValue(m.kind, cur.get(m.key)!.value)}`).join("; ")}. More knobs (--max-knobs, --max-steps), other knobs, or a design change.` : "Nothing that counts stays off.");
  mkdirSync(join("out", "proposals"), { recursive: true });
  const file = join("out", "proposals", `${(r.flags["out-name"] ?? r.flags.knobs).replace(/[^a-z0-9_-]+/gi, "-")}.json`);
  writeFileSync(file, JSON.stringify(patch, null, 1) + "\n");
  r.log();
  r.log(`Patch: ${file}. Nothing in data/ was changed.`);
  r.log(`Next: npm run balance:replay -- --patch ${file} --full   (bots shop again; then the designer decides, the numbers go into data/ by hand, npm run ratings -- --only <ids>, npm run baseline)`);
}
r.log("Reading: the search only sees seed " + bench.panels[0]!.seed + "; the check seed shows whether the effect holds on lobbies it never saw. Changes are paired (± one standard error, * = at least two).");
r.done();
