/**
 * Shared frame of the balancing reports: accuracy presets, flags, a header that states the question,
 * noise estimates, and an optional copy of the report in a file.
 *
 * Every report takes
 *   --accuracy quick|normal|precise   (or --quick / --precise)   how many simulations to run
 *   --sims N                           overrides the main count of the report (lobbies, builds or runs)
 *   --<count> N                        overrides any single count the report lists in its header
 *   --seed S                           another seed gives an independent sample
 *   --out file                         also writes the report to this file
 *   --no-ratings                       bots ignore data/sim/ratings.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Rng, type GameData } from "@backpack-space/core";
import { loadGameData, loadRatings } from "@backpack-space/core/node";
import { useRatings } from "../sim/lobby";
import { parseArgs } from "../cli/args";

export type Accuracy = "quick" | "normal" | "precise";

export interface ReportSpec<C extends Record<string, number>> {
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
  const log = (...out: string[]) => { for (const line of out.length ? out : [""]) { lines.push(line); console.log(line); } };
  const ratings = flags["no-ratings"] ? {} : loadRatings();
  useRatings(ratings);
  const t0 = Date.now();
  log(`# ${spec.title}`);
  log();
  log(`Question: ${spec.question}`);
  log(`Accuracy: ${accuracy}, seed ${seed}. ${keys.map((k) => `${k} ${n[k]} (${spec.explain[k as keyof C]})`).join(", ")}.`);
  log(`Bots: ${Object.keys(ratings).length ? `use the measured item ratings in data/sim/ratings.json (${Object.keys(ratings).length} items)` : "no measured item ratings (price and synergies only)"}.`);
  log(`Game data: data/*.json as it is now. More accuracy: --accuracy precise or --sims N; another sample: --seed S.`);
  return {
    data: loadGameData(), flags, rest, n: n as C, accuracy, seed, rng: new Rng(seed), log,
    progress: (line) => { if (process.stderr.isTTY) process.stderr.write(`\r${line}`.padEnd(60) + "\r"); },
    done: () => {
      log();
      log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      if (flags.out) { writeFileSync(flags.out, lines.join("\n") + "\n"); console.log(`Written to ${flags.out}`); }
    },
  };
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

export interface Target { min?: number; max?: number; what: string }
/** Balancing targets from data/sim/targets.json. */
export function loadTargets(): Record<string, Target> { return JSON.parse(readFileSync("data/sim/targets.json", "utf8")); }
const fmt = (x: number, asPct: boolean) => (asPct ? pct(x) : x.toFixed(1));
/** One line "OK / OFF  what: target …, measured …" for a set of measured values. */
export function checkTarget(t: Target, values: readonly number[], asPct: boolean): string {
  const lo = Math.min(...values), hi = Math.max(...values);
  const ok = (t.min === undefined || lo >= t.min) && (t.max === undefined || hi <= t.max);
  const want = t.min !== undefined && t.max !== undefined ? `${fmt(t.min, asPct)}–${fmt(t.max, asPct)}` : t.min !== undefined ? `at least ${fmt(t.min, asPct)}` : `at most ${fmt(t.max!, asPct)}`;
  const got = lo === hi ? fmt(lo, asPct) : `${fmt(lo, asPct)}–${fmt(hi, asPct)}`;
  return `${ok ? "OK " : "OFF"}  ${t.what}: target ${want}, measured ${got}`;
}
