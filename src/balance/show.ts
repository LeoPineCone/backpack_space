/** Shared text for the balance tools: how a metric, its target and a paired change are printed. */
import { markOf, pct, pts, type Target } from "../reports/common";
import type { Mark } from "../reports/html";
import { isSeconds, KINDS, type Kind, type Metric } from "./metrics";

const isDiff = (kind: Kind) => kind === "open" || kind === "spread" || kind === "pays";
export const showValue = (kind: Kind, v: number): string =>
  isSeconds(kind) ? `${v.toFixed(1)} s` : kind === "distinct" || kind === "style" ? v.toFixed(2) : isDiff(kind) ? pts(v) : pct(v);
export const showSe = (kind: Kind, se: number): string =>
  !Number.isFinite(se)
    ? ""
    : ` ±${isSeconds(kind) ? se.toFixed(1) : kind === "distinct" || kind === "style" ? se.toFixed(2) : Math.max(1, Math.round(100 * se))}`;
export const showMetric = (m: Metric): string => showValue(m.kind, m.value) + showSe(m.kind, m.se);
/** a paired change: "+2.3 ±0.4 *" (points of win share, or seconds); * = at least two standard errors */
export function showChange(kind: Kind, c: { d: number; se: number }): string {
  const f = isSeconds(kind) || kind === "distinct" || kind === "style" ? 1 : 100;
  const digits = kind === "distinct" || kind === "style" ? 2 : 1;
  const d = c.d * f,
    se = (Number.isFinite(c.se) ? c.se : 0) * f;
  if (Math.abs(d) < 0.5 * 10 ** -digits) return "0";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)} ±${se.toFixed(digits)}${Math.abs(c.d) >= 2 * c.se ? " *" : ""}`;
}
export function showTarget(kind: Kind, T: Record<string, Target>): string {
  const t = T[KINDS[kind]];
  if (!t) return "";
  const f = (x: number) =>
    isSeconds(kind) ? `${x} s` : kind === "distinct" || kind === "style" ? `${x}` : isDiff(kind) ? `${Math.round(100 * x)} pts` : `${Math.round(100 * x)} %`;
  return t.min !== undefined && t.max !== undefined ? `${f(t.min).replace(/ .*/, "")}–${f(t.max)}` : t.min !== undefined ? `≥ ${f(t.min)}` : `≤ ${f(t.max!)}`;
}
export const markFor = (kind: Kind, T: Record<string, Target>, v: number): Mark => (T[KINDS[kind]] ? markOf(T[KINDS[kind]]!, v) : "");
export const KIND_TITLES: Record<Kind, string> = {
  hero: "Heroes overall",
  third: "Heroes by third of the run",
  path: "Paths, all rounds",
  late: "Paths, late rounds",
  open: "Paths against the hero's open bot",
  spread: "Best to weakest path",
  duel: "Hero against hero (attacker first, all rounds)",
  secs: "Fight length",
  nova: "Supernova reached",
  main: "Path profile: main mechanic",
  distinct: "Path profile: closest two paths",
  style: "Path profile: play style of the two paths most alike (1 = clearly different)",
  pays: "Does going deeper into the path pay? (most against least committed third of its bots)",
};
