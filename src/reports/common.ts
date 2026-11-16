/**
 * Shared frame of the balancing reports: accuracy presets, flags, a header that states the question,
 * noise estimates, and an optional copy of the report in a file.
 *
 * Every report takes
 *   --accuracy quick|normal|precise   (or --quick / --precise)   how many simulations to run
 *   --sims N                           overrides the main count of the report (lobbies, builds or runs)
 *   --<count> N                        overrides any single count the report lists in its header
 *   --seed S                           another seed gives an independent sample
 *   --out file                         also writes the report to this file (and the HTML page next to it)
 *   --no-html                          no HTML page
 *
 * Every run also writes a static HTML page with tables and charts: out/reports/<id>.html, or next to --out
 * (same name, .html). index.html in that folder links all report pages found there.
 *   --no-ratings                       bots ignore data/sim/ratings.json
 *   --jobs N                           reports that play lobbies use N processor cores (default: all); same result
 *   --baseline file.json               reports that support it compare with an earlier run (its .json page)
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Rng, type GameData } from "@backpack-space/core";
import { loadGameData, loadRatings } from "@backpack-space/core/node";
import { useRatings } from "../sim/lobby";
import { parseArgs } from "../cli/args";
import { renderIndex, renderReport, type Block, type Cell, type Chart, type Heat, type IndexEntry, type Mark, type ReportPage, type TargetResult } from "./html";

export type Accuracy = "quick" | "normal" | "precise";

export interface ReportSpec<C extends Record<string, number>> {
  /** file name of the report: out/reports/<id>.html */
  id: string;
  title: string;
  /** the balancing question the report answers, one or two sentences */
  question: string;
  /** counts per accuracy; the first key is the main count that --sims sets */
  presets: Record<Accuracy, C>;
  /** what the counts mean, shown in the header */
  explain: Record<keyof C, string>;
}

export interface Report<C> {
  data: GameData;
  flags: Record<string, string>;
  rest: string[];
  n: C;
  accuracy: Accuracy;
  seed: number;
  rng: Rng;
  /** prints each argument as one line and keeps it for --out; no argument prints an empty line */
  log: (...lines: string[]) => void;
  /** a table: printed as text, and as a table in the HTML page (heat colours its cells; marks frame cells
   *  checked against a target green ✓ / red ✗, in the text version as a ✓ / ✗ after the value) */
  table: (head: string[], rows: Cell[][], heat?: Heat, marks?: Mark[][]) => void;
  /** a chart, only in the HTML page */
  chart: (chart: Chart) => void;
  /** checks a target and prints its OK / OFF line; in the HTML page it becomes a target light */
  target: (t: Target, values: readonly number[], asPct: boolean) => void;
  /** stores measured numbers in the page's .json, so a later run can compare itself with this one (--baseline) */
  value: (key: string, nums: number[]) => void;
  /** progress on stderr, does not go into the report file */
  progress: (line: string) => void;
  done: () => void;
}

export function startReport<C extends Record<string, number>>(spec: ReportSpec<C>, argv = process.argv.slice(2)): Report<C> {
  const { flags, rest } = parseArgs(argv);
  const accuracy: Accuracy = flags.quick ? "quick" : flags.precise ? "precise" : flags.accuracy === "quick" || flags.accuracy === "precise" ? flags.accuracy : "normal";
  const n = { ...spec.presets[accuracy] } as Record<string, number>;
  const keys = Object.keys(n);
  if (flags.sims) n[keys[0]!] = Number(flags.sims);
  for (const k of keys) if (flags[k] !== undefined) n[k] = Number(flags[k]);
  const seed = Number(flags.seed ?? 1);
  const lines: string[] = [];
  const blocks: Block[] = [];
  const meta: string[] = [];
  const values: Record<string, number[]> = {};
  let inHeader = true;
  const log = (...out: string[]) => {
    for (const line of out.length ? out : [""]) {
      lines.push(line); console.log(line);
      if (inHeader) { if (line && !line.startsWith("# ") && !line.startsWith("Question: ")) meta.push(line); continue; }
      if (!line.trim()) continue;
      blocks.push(line.startsWith("## ") ? { kind: "h", text: line.slice(3) } : { kind: "p", text: line });
    }
  };
  const ratings = flags["no-ratings"] ? {} : loadRatings();
  useRatings(ratings);
  const t0 = Date.now();
  log(`# ${spec.title}`);
  log();
  log(`Question: ${spec.question}`);
  log(`Accuracy: ${accuracy}, seed ${seed}. ${keys.map((k) => `${k} ${n[k]} (${spec.explain[k as keyof C]})`).join(", ")}.`);
  log(`Bots: ${Object.keys(ratings).length ? `use the measured item ratings in data/sim/ratings.json (${Object.keys(ratings).length} items)` : "no measured item ratings (price and synergies only)"}.`);
  log(`Game data: data/*.json as it is now. More accuracy: --accuracy precise or --sims N; another sample: --seed S.`);
  inHeader = false;
  const quiet = (text: string[]) => { for (const line of text) { lines.push(line); console.log(line); } };
  return {
    data: loadGameData(), flags, rest, n: n as C, accuracy, seed, rng: new Rng(seed), log,
    table: (head, rows, heat, marks) => {
      const text = marks ? rows.map((row, k) => row.map((c, i) => (marks[k]?.[i] ? `${c} ${marks[k]![i] === "ok" ? "✓" : "✗"}` : c))) : rows;
      quiet(table(head, text)); blocks.push({ kind: "table", head, rows, heat, marks });
    },
    chart: (chart) => { blocks.push({ kind: "chart", chart }); },
    target: (t, values, asPct) => { const x = targetResult(t, values, asPct); quiet([targetLine(x)]); blocks.push({ kind: "target", target: x }); },
    value: (key, nums) => { values[key] = nums; },
    progress: (line) => { if (process.stderr.isTTY) process.stderr.write(`\r${line}`.padEnd(60) + "\r"); },
    done: () => {
      log();
      log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      const seconds = Math.round((Date.now() - t0) / 1000);
      if (flags.out) { mkdirSync(dirname(flags.out) || ".", { recursive: true }); writeFileSync(flags.out, lines.join("\n") + "\n"); console.log(`Written to ${flags.out}`); }
      if (!flags["no-html"]) {
        const dir = flags.out ? dirname(flags.out) : join("out", "reports");
        const name = flags.out ? basename(flags.out).replace(/\.[^.]*$/, "") : spec.id;
        const page: ReportPage = {
          kind: "backpack-space-report", id: spec.id, title: spec.title, question: spec.question, meta, accuracy, seed, seconds,
          written: new Date().toISOString(), text: flags.out ? basename(flags.out) : undefined, blocks,
          values: Object.keys(values).length ? values : undefined,
        };
        writeReportPage(dir, name, page);
        console.log(`HTML page: ${join(dir, `${name}.html`)} (all reports: ${join(dir, "index.html")})`);
      }
    },
  };
}

/** Report ids in the order the index and report:all list them. */
export const REPORT_IDS = ["battles", "heroes", "runs", "items", "recipes", "placement", "paths", "picks", "synergy", "selftest"] as const;

/** Writes <name>.html and <name>.json into dir and rebuilds dir/index.html from every report page there. */
export function writeReportPage(dir: string, name: string, page: ReportPage): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(page) + "\n");
  writeFileSync(join(dir, `${name}.html`), renderReport(page));
  writeReportIndex(dir);
}

/** index.html for all report pages (<name>.json) in dir; reports that never ran there are listed as missing. */
export function writeReportIndex(dir: string): void {
  const found: IndexEntry[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    try {
      const page = JSON.parse(readFileSync(join(dir, f), "utf8")) as ReportPage;
      if (page.kind === "backpack-space-report") found.push({ id: page.id, file: f.replace(/\.json$/, ".html"), page });
    } catch { /* not a report page */ }
  }
  const order = (id: string) => { const i = (REPORT_IDS as readonly string[]).indexOf(id); return i < 0 ? REPORT_IDS.length : i; };
  const entries: IndexEntry[] = [...found, ...REPORT_IDS.filter((id) => !found.some((e) => e.id === id)).map((id) => ({ id, file: "" }))];
  entries.sort((a, b) => order(a.id) - order(b.id) || a.file.localeCompare(b.file));
  writeFileSync(join(dir, "index.html"), renderIndex(entries));
}

export const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
/** a share with its noise: "54 % ±4" (one standard error in points) */
export const share = (p: number, n: number) => `${pct(p)} ±${n > 0 ? Math.max(1, Math.round(100 * Math.sqrt((p * (1 - p)) / n))) : "-"}`;
/** standard error of a mean */
export const stderr = (xs: readonly number[]) => {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) / xs.length);
};
export const signed = (x: number, digits = 1) => `${x >= 0 ? "+" : ""}${x.toFixed(digits)}`;

/** A plain text table, indented by two spaces, first column left-aligned, the others right-aligned. */
export function table(head: string[], rows: (string | number)[][]): string[] {
  const cells = [head, ...rows.map((r) => r.map(String))];
  const widths = head.map((_, c) => Math.max(...cells.map((r) => (r[c] ?? "").length)));
  return cells.map((r) => "  " + r.map((v, c) => (c === 0 ? v.padEnd(widths[c]!) : v.padStart(widths[c]!))).join("  "));
}

export const median = (xs: readonly number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
export const quantile = (xs: readonly number[], q: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]!; };

export interface Target { min?: number; max?: number; what: string; /** "pts": a difference of shares, shown as "+4 pts" */ unit?: "pts" }
/** Balancing targets from data/sim/targets.json. */
export function loadTargets(): Record<string, Target> { return JSON.parse(readFileSync("data/sim/targets.json", "utf8")); }
/** "ok" when the value lies within the target, else "off" (for table marks) */
export const markOf = (t: Target, v: number): "ok" | "off" => { const x = whole(v); return (t.min === undefined || x >= t.min) && (t.max === undefined || x <= t.max) ? "ok" : "off"; };
/** shares are compared as the whole percent the reports print, so "48 %" never fails a 48–52 % target */
const whole = (v: number) => Math.round(v * 100) / 100;
/** the target as a short range for a table header: "46–54 %", "≥ 2 pts", "≤ 6 pts" */
export function targetRange(t: Target, unit: "%" | "pts"): string {
  const f = (x: number) => (100 * x).toFixed(0);
  const u = unit === "%" ? " %" : " pts";
  return t.min !== undefined && t.max !== undefined ? `${f(t.min)}–${f(t.max)}${u}` : t.min !== undefined ? `≥ ${f(t.min)}${u}` : `≤ ${f(t.max!)}${u}`;
}
/** a difference of shares in points: "+4 pts", "−3 pts", "0 pts" */
export const pts = (x: number) => { const v = Math.round(100 * x); return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} pts`; };
const fmt = (x: number, asPct: boolean, unit?: "pts") => (unit === "pts" ? pts(x) : asPct ? pct(x) : x.toFixed(1));
/** Checks measured values against a target. */
export function targetResult(t: Target, values: readonly number[], asPct: boolean): TargetResult {
  const r = (v: number) => (asPct ? whole(v) : v);
  const lo = r(Math.min(...values)), hi = r(Math.max(...values));
  const ok = (t.min === undefined || lo >= t.min) && (t.max === undefined || hi <= t.max);
  const f = (x: number) => fmt(x, asPct, t.unit);
  const want = t.min !== undefined && t.max !== undefined ? `${f(t.min)}–${f(t.max)}` : t.min !== undefined ? `at least ${f(t.min)}` : `at most ${f(t.max!)}`;
  const got = lo === hi ? f(lo) : `${f(lo)}${t.unit ? " to " : "–"}${f(hi)}`;
  return { ok, what: t.what, want, got };
}
const targetLine = (x: TargetResult) => `${x.ok ? "OK " : "OFF"}  ${x.what}: target ${x.want}, measured ${x.got}`;
/** One line "OK / OFF  what: target …, measured …" for a set of measured values. */
export function checkTarget(t: Target, values: readonly number[], asPct: boolean): string {
  return targetLine(targetResult(t, values, asPct));
}
