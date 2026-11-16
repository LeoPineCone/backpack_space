/**
 * One number at several values: what happens to the paths and heroes when a rule, an item number or a habit of
 * the bots is turned up and down?
 *   npm run balance:sweep -- --knob rule:shop.anchorPathWeight --values 1,2,3,4 [--name main] [--lobbies N]
 *   --knob  rule:<path in rules.json> | item:<id>:<path> | hero:<id>:<path> | bot:pathLiking
 *
 * Every value plays the lobbies of the baseline again from scratch (bots shop again), so this also works for
 * numbers the bots read (price, Energy, cooldown, shop rules). One value takes about as long as the baseline.
 * Each value is compared with the baseline on the same lobbies; a change counts when both seeds show it.
 */
import { join } from "node:path";
import { PATH_LIKING, type BotOpts, type GameData } from "@backpack-space/core";
import { jobsFrom, runParallel } from "../sim/parallel";
import { blockCount, blockSe } from "../sim/paths";
import { loadTargets, markOf, startReport, type Target } from "../reports/common";
import type { Mark } from "../reports/html";
import { baselineDir, Bench } from "./bench";
import { playPanelLobby, type PanelLobby } from "./panel";
import { getPath, patchedData, rawHero, rawItem, type Patch } from "./patch";
import { PULL_ROWS, pullOf, type PullRow } from "./pull";

const argv = process.argv.slice(2);
const knobArg = argv[argv.indexOf("--knob") + 1] ?? "";
const r = startReport({
  id: `sweep-${knobArg.replace(/^[a-z]+:/, "").replace(/[^A-Za-z0-9]+/g, "-") || "knob"}`,
  title: `Sweep: ${knobArg}`,
  question: "What does this number do to the paths and heroes at several values, each measured on the lobbies of the baseline?",
  presets: { quick: { lobbies: 60 }, normal: { lobbies: 240 }, precise: { lobbies: 480 } },
  explain: { lobbies: "lobbies per seed and value (at most those of the baseline)" },
});
if (!r.flags.knob || !r.flags.values) throw new Error("needed: --knob rule:<path> | item:<id>:<path> | hero:<id>:<path> | bot:pathLiking and --values a,b,c");
const name = r.flags.name ?? "main";
const bench = new Bench(name, undefined, r.n.lobbies);
const T = loadTargets();
const jobs = jobsFrom(r.flags);

// ---- the knob: its value now and how a value is played
const [kind, ...restOf] = r.flags.knob.split(":");
const arg = restOf.join(":");
let base: unknown, what = "";
let play: (v: number) => { patch?: Patch; bot?: BotOpts };
if (kind === "rule") { base = getPath(bench.raw.rules, arg); what = `rule ${arg} (data/rules.json)`; play = (v) => ({ patch: { changes: [{ rules: true, set: { [arg]: v } }] } }); }
else if (kind === "item" || kind === "hero") {
  const id = arg.slice(0, arg.indexOf(":")), path = arg.slice(arg.indexOf(":") + 1);
  const obj = kind === "item" ? rawItem(bench.raw, id) : rawHero(bench.raw, id);
  if (!obj) throw new Error(`--knob: no ${kind} ${id}`);
  base = getPath(obj, path); what = `${obj.name} ${path}`;
  play = (v) => ({ patch: { changes: [{ [kind]: id, set: { [path]: v } }] } as Patch });
} else if (kind === "bot" && arg === "pathLiking") { base = PATH_LIKING; what = "how much more a bot on a path values that path's items (bots only, not a game number)"; play = (v) => ({ bot: { pathLiking: v } }); }
else throw new Error(`--knob: unknown "${r.flags.knob}"`);
if (typeof base !== "number") throw new Error(`--knob ${r.flags.knob}: no number there`);
const values = [...new Set([...r.flags.values.split(",").map(Number), base])].sort((a, b) => a - b);
if (values.some((v) => !Number.isFinite(v))) throw new Error("--values: numbers separated by commas");

r.log(`Baseline "${name}": ${bench.panels[0]!.lobbies.length} lobbies per seed, seeds ${bench.meta.seeds.join(", ")}.${bench.fresh ? "" : " STALE: data/ or the ratings changed since; take a new one (npm run baseline)."}`);
r.log(`Knob: ${what}. Now: ${base}. Values: ${values.join(", ")}.`);

// ---- measure: per value and seed the numbers over all lobbies and per block of lobbies
interface Run { all: Record<string, number>; blocks: Record<string, number>[] }
const measure = (data: GameData, lobbies: readonly PanelLobby[]): Run => {
  const K = blockCount(lobbies.length);
  return { all: pullOf(data, lobbies), blocks: Array.from({ length: K }, (_, b) => pullOf(data, lobbies.filter((_, i) => Math.min(K - 1, Math.floor((i * K) / lobbies.length)) === b))) };
};
const runs = new Map<number, Run[]>();
for (const v of values) {
  const per: Run[] = [];
  for (const p of bench.panels) {
    if (v === base) { per.push(measure(bench.data, p.lobbies)); continue; }
    const { patch, bot } = play(v);
    const data = patch ? patchedData(patch, bench.raw) : bench.data;
    const lobbies = await runParallel<PanelLobby>({ kind: "panel", seed: p.seed, ratings: true, ratingsFile: join(baselineDir(name), "ratings.json"), patch, bot }, p.lobbies.length, jobs, (i) => playPanelLobby(data, p.seed, i, false, bot), (d) => r.progress(`value ${v}, seed ${p.seed}: lobby ${d}/${p.lobbies.length}`));
    per.push(measure(data, lobbies));
  }
  runs.set(v, per);
  console.error(`value ${v} done`);
}

// ---- tables
const now = runs.get(base)!;
const value = (v: number, key: string) => runs.get(v)!.reduce((s, x) => s + (x.all[key] ?? NaN), 0) / now.length;
/** the change against the value of today is at least two paired standard errors on every seed, in the same direction */
const sure = (v: number, key: string): boolean => {
  if (v === base) return false;
  const z = runs.get(v)!.map((x, k) => {
    const d = x.all[key]! - now[k]!.all[key]!;
    const se = blockSe(x.blocks.map((b, i) => (b[key] ?? NaN) - (now[k]!.blocks[i]![key] ?? NaN)));
    return Number.isFinite(se) && se > 0 ? d / se : 0;
  });
  return z.every((x) => x >= 2) || z.every((x) => x <= -2);
};
const show = (unit: PullRow["unit"], x: number) => (!Number.isFinite(x) ? "-" : unit === "%" ? `${(100 * x).toFixed(0)} %` : unit === "pts" ? `${x >= 0 ? "+" : "−"}${Math.abs(100 * x).toFixed(1)}` : x.toFixed(2));
const cell = (unit: PullRow["unit"], v: number, key: string) => show(unit, value(v, key)) + (sure(v, key) ? " *" : "");
const head = (first: string) => [first, ...values.map((v) => (v === base ? `${v} (now)` : String(v)))];
const mark = (t: Target | undefined, x: number): Mark => (t && Number.isFinite(x) ? markOf(t, x) : "");
const tText = (row: PullRow) => { const t = row.target ? T[row.target] : undefined; if (!t) return ""; const f = (x: number) => (row.unit === "" ? String(x) : String(Math.round(100 * x))); return ` [${t.min !== undefined ? `≥ ${f(t.min)}` : ""}${t.min !== undefined && t.max !== undefined ? ", " : ""}${t.max !== undefined ? `≤ ${f(t.max)}` : ""}]`; };

r.log();
r.log("## Paths: how strongly they shape a run");
r.table(head(""), PULL_ROWS.map((row) => [row.label + tText(row), ...values.map((v) => cell(row.unit, v, row.key))]), undefined,
  PULL_ROWS.map((row) => ["", ...values.map((v) => mark(row.target ? T[row.target] : undefined, value(v, row.key)))]));
for (const row of PULL_ROWS) r.value(row.key, values.map((v) => value(v, row.key)));
r.value("values", values);

const heroIds = bench.data.heroList.map((h) => h.id);
const rank = (k: string) => { const [h, p] = k.slice(k.indexOf(":") + 1).split("/"); const hi = heroIds.indexOf(h!); return hi * 100 + (p ? bench.data.heroList[hi]!.paths.findIndex((x) => x.id === p) : 0); };
const keys = (prefix: string) => Object.keys(now[0]!.all).filter((k) => k.startsWith(prefix)).sort((a, b) => rank(a) - rank(b));
const short = (h: string) => bench.data.heroes.get(h)!.name.split(" ")[0]!.replace(/"/g, "");
const pathName = (hp: string) => { const [h, p] = hp.split("/"); return `${short(h!)}: ${bench.data.heroes.get(h!)!.paths.find((x) => x.id === p)?.name ?? p}`; };
const section = (title: string, prefix: string, label: (id: string) => string, unit: PullRow["unit"], target?: string) => {
  r.log();
  r.log(`## ${title}`);
  const ks = keys(prefix);
  r.table(head(""), ks.map((k) => [label(k.slice(prefix.length)), ...values.map((v) => cell(unit, v, k))]), undefined, ks.map((k) => ["", ...values.map((v) => mark(target ? T[target] : undefined, value(v, k)))]));
  for (const k of ks) r.value(k, values.map((v) => value(v, k)));
};
section("Heroes: win share against other heroes [48–52 %]", "hero:", short, "%", "pathHeroWinShare");
section("Paths: win share, all rounds [46–54 %]", "path:", pathName, "%", "pathWinShare");
section("Paths against the hero's open bot [≥ 2 pts]", "open:", pathName, "pts", "pathOverOpen");
section("Paths: share of the final build on the path [≥ 50 %]", "commit:", pathName, "%", "pathCommit");

const line = (title: string, rows: [string, string][], f = 100, band?: { min?: number; max?: number }) =>
  r.chart({ type: "line", title, x: values, xLabel: r.flags.knob!, unit: f === 100 ? "%" : "", band, series: rows.map(([n, key]) => ({ name: n, values: values.map((v) => Number((f * value(v, key)).toFixed(2))) })) });
line("Build on the path (share of item cost)", [["average", "commit"], ["weakest path", "commitMin"]], 100, { min: 100 * (T.pathCommit?.min ?? 0) });
line("Variety: share of items two runs do not share", [["same path", "varietySame"], ["no path", "varietyOpen"], ["two paths of one hero", "apart"]]);
line("Path against the hero's open bot (points)", [["average", "open"], ["weakest path", "openMin"]], 100, { min: 100 * (T.pathOverOpen?.min ?? 0) });
line("Heroes: win share", keys("hero:").map((k): [string, string] => [short(k.slice(5)), k]), 100, { min: 100 * T.pathHeroWinShare!.min!, max: 100 * T.pathHeroWinShare!.max! });

r.log();
r.log(`Values are the mean of seeds ${bench.meta.seeds.join(" and ")}. * = the change against the value of today is at least two standard errors on every seed (paired on the same lobbies). ✓ / ✗ = inside / outside the target.`);
r.log("Variety: for two final builds, the share of their items (by id) that only one of them has; 0 % = the same items, 100 % = nothing shared. \"Same path\" compares the same hero and path in two lobbies.");
r.done();
