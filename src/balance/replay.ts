/**
 * What does a number change do? Measured in seconds on the stored lobbies of the baseline.
 *   npm run balance:replay -- --patch file.json [--name main] [--all] [--quick | --precise] [--check N] [--full]
 *
 * The baseline's builds fight their stored pairings again with the patched numbers and the same dice. Bots choose
 * items by price, rating, tags and recipes, not by damage or effect numbers, so for such numbers this is the same
 * measurement as a full paired run. The self-check plays a few lobbies again with the patch and compares the
 * builds: if bots would buy differently (price, Energy, tags, shop rules), confirm with --full, which plays every
 * lobby again with the patch (about as long as the baseline took) and compares paired.
 */
import { jobsFrom, runParallel } from "../sim/parallel";
import { loadTargets, startReport, type Target } from "../reports/common";
import type { Mark } from "../reports/html";
import { baselineDir, Bench } from "./bench";
import { KINDS, metricsOf, outside, paired, type Kind, type Metrics } from "./metrics";
import { lobbyStat, playPanelLobby, type Panel, type PanelLobby } from "./panel";
import { describePatch, patchedData, readPatch, touchedBy } from "./patch";
import { KIND_TITLES, markFor, showChange, showMetric, showTarget, showValue } from "./show";
import { join } from "node:path";

const r = startReport({
  id: "replay",
  title: "Replay of a patch",
  question: "What do these number changes do to every fight-level target, measured on the lobbies of the baseline?",
  presets: { quick: { check: 0 }, normal: { check: 8 }, precise: { check: 24 } },
  explain: { check: "lobbies played again with the patch to see whether bots would buy differently" },
});
if (!r.flags.patch) throw new Error("--patch file.json is needed (see src/balance/patch.ts for the format)");
const patch = readPatch(r.flags.patch);
const name = r.flags.name ?? "main";
const bench = new Bench(name);
const T = loadTargets();
const jobs = jobsFrom(r.flags);
r.log(`Baseline "${name}": ${bench.meta.lobbies} lobbies per seed, seeds ${bench.meta.seeds.join(", ")}, taken ${bench.meta.written.slice(0, 16).replace("T", " ")} UTC.${bench.fresh ? "" : " STALE: data/ or the ratings changed since; take a new one (npm run baseline)."}`);
r.log();
r.log(`## Patch${patch.name ? `: ${patch.name}` : ""}`);
for (const line of describePatch(patch, bench.raw)) r.log(`  ${line}`);

const after: Metrics[] = [];
let note = "";
if (r.flags.full) {
  const data = patchedData(patch, bench.raw);
  for (const p of bench.panels) {
    const lobbies = await runParallel<PanelLobby>({ kind: "panel", seed: p.seed, ratings: true, ratingsFile: r.flags.ratings ?? join(baselineDir(name), "ratings.json"), patch }, p.lobbies.length, jobs, (i) => playPanelLobby(data, p.seed, i), (d) => r.progress(`full run, seed ${p.seed}: lobby ${d}/${p.lobbies.length}`));
    after.push(metricsOf(data, lobbies.map((l) => lobbyStat(data, l.seats, l.fights))));
  }
  note = `Full run: every lobby played again with the patch${r.flags.ratings ? ` and the ratings in ${r.flags.ratings}` : ""} (bots shop again).`;
} else {
  const runs = bench.panels.map((_, k) => bench.run(patch, k));
  runs.forEach((x) => after.push(x.metrics));
  const fights = bench.panels.reduce((n, p) => n + p.lobbies.reduce((m, l) => m + l.fights.length, 0), 0);
  const refought = runs.reduce((n, x) => n + x.refought, 0), flipped = runs.reduce((n, x) => n + x.flipped, 0);
  note = `Replay: ${refought} of ${fights} fights involve a patched item, hero or rule and were fought again; ${flipped} changed their winner.`;
}
r.log();
r.log(note);

// ---- table: what moved, what is off
const first = bench.base[0]!;
const real = (k: Kind, c: { d: number; se: number }) => Math.abs(c.d) >= 2 * c.se && Math.abs(c.d) >= (k === "secs" ? 0.2 : 0.005);
const status = (kind: Kind, v: number) => outside(T[KINDS[kind]] as Target | undefined, Math.round(v * 100) / 100) > 0;
let fixed = 0, broken = 0, offBefore = 0, offAfter = 0;
for (const kind of Object.keys(KINDS) as Kind[]) {
  const all = [...first.values()].filter((m) => m.kind === kind);
  for (const m of all) {
    const b = status(kind, m.value), a = status(kind, after[0]!.get(m.key)!.value);
    if (b) offBefore++; if (a) offAfter++; if (b && !a) fixed++; if (!b && a) broken++;
  }
  const rows = all.filter((m) => r.flags.all || real(kind, paired(m, after[0]!.get(m.key)!)) || status(kind, m.value) !== status(kind, after[0]!.get(m.key)!.value));
  if (!rows.length) continue;
  r.log();
  r.log(`## ${KIND_TITLES[kind]} [target ${showTarget(kind, T)}]`);
  const marks: Mark[][] = rows.map((m) => ["", markFor(kind, T, m.value), markFor(kind, T, after[0]!.get(m.key)!.value)]);
  r.table(
    ["", "before", "after", ...bench.panels.map((p) => `change, seed ${p.seed}`)],
    rows.map((m) => [m.label, showMetric(m), showValue(kind, after[0]!.get(m.key)!.value), ...bench.base.map((b, k) => showChange(kind, paired(b.get(m.key)!, after[k]!.get(m.key)!)))]),
    undefined, marks,
  );
}
r.log();
r.log(`Targets off (seed ${bench.panels[0]!.seed}): ${offBefore} before, ${offAfter} after; ${fixed} brought on target, ${broken} pushed off.${r.flags.all ? "" : " Rows shown: changes of at least two standard errors and targets that changed side (--all shows every row)."}`);
r.log("Change: paired on the same lobbies (points of win share, or seconds), ± one standard error from blocks of lobbies, * = at least two standard errors. \"before\" carries the ± of the absolute value, which is much larger than the ± of a change.");

// ---- self-check: would bots buy differently?
if (!r.flags.full && r.n.check > 0) {
  const p: Panel = bench.panels[0]!;
  const n = Math.min(r.n.check, p.lobbies.length);
  const data = patchedData(patch, bench.raw);
  const again = await runParallel<PanelLobby>({ kind: "panel", seed: p.seed, ratings: true, ratingsFile: join(baselineDir(name), "ratings.json"), patch }, n, jobs, (i) => playPanelLobby(data, p.seed, i), (d) => r.progress(`self-check: lobby ${d}/${n}`));
  const touched = touchedBy(patch);
  let seats = 0, bought = 0, laid = 0;
  const owned = new Map<string, [number, number]>([...touched.items].map((id) => [id, [0, 0]]));
  again.forEach((l, i) => l.seats.forEach((s, k) => {
    const was = p.lobbies[i]!.seats[k]!;
    const items = (x: typeof s) => x.builds.map((b) => b.items.map((q) => q.item).sort().join(",")).join("|");
    const layout = (x: typeof s) => JSON.stringify(x.builds.map((b) => [b.bags, b.items]));
    seats++;
    if (items(s) !== items(was)) bought++; else if (layout(s) !== layout(was)) laid++;
    for (const [id, n] of owned) {
      if (was.builds.some((b) => b.items.some((q) => q.item === id))) n[0]++;
      if (s.builds.some((b) => b.items.some((q) => q.item === id))) n[1]++;
    }
  }));
  // a shift in how many bots own a patched item is systematic; anything else is the same bots drifting apart
  const shifted = [...owned].filter(([, [a, b]]) => Math.abs(a - b) >= 3 && Math.abs(a - b) > 2 * Math.sqrt(a + b));
  const drift = (bought + laid) / Math.max(1, seats);
  r.log();
  r.log("## Self-check: do the bots build the same with this patch?");
  r.log(`${n} lobbies played again with the patch: ${bought} of ${seats} bots end up with other items, ${laid} more lay the same items out differently.`);
  if (owned.size) r.log(`Bots that own a patched item at some point, before → after: ${[...owned].map(([id, [a, b]]) => `${id} ${a} → ${b}`).join(", ")}.`);
  r.log(bought + laid === 0 ? "The replay is exact: a full run would play the same builds."
    : shifted.length ? `The patch changes how often bots take ${shifted.map(([id]) => id).join(", ")}. The replay only shows the effect on yesterday's builds: measure with --full.`
    : !owned.size && drift > 0.05 ? "The patch changes a rule or a hero and the bots build differently. The replay only shows the effect on yesterday's builds: measure with --full."
    : "Bots drift to other builds (their layout and Energy bookkeeping read cooldown, Energy and price), but they do not take the patched items more or less often in these lobbies. The replay is an estimate: confirm the final state with --full.");
  r.target({ max: 0, what: "patched items that bots take clearly more or less often with the patch (above 0: use --full)" }, [shifted.length + (!owned.size && drift > 0.05 ? 1 : 0)], false);
}
r.done();
