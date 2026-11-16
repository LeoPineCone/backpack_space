/**
 * Item strength from the baseline's lobbies, two views that need no bot to shop:
 *   remove one   builds that own the item fight the same fight again without it: what the item is worth where it is really used
 *   regression   a logistic model over all fights (items of the attacker minus items of the defender, hero and third of the run):
 *                which items go with winning, everything else equal. Observational: a flag, not a proof.
 * The third view, "add one" (a free extra copy for a typical build), is the item measurement behind data/sim/ratings.json.
 */
import { compile, simulate, type CSide, type GameData } from "@backpack-space/core";
import type { Panel } from "./panel";

export interface Removed { n: number; /** mean loss of win share without the item, and its standard error (fractions) */ drop: number; se: number }

/** Remove-one: at most `cap` fights per item, spread evenly over the panel's fights that have the item on the attacker's side. */
export function removeOne(panels: readonly Panel[], data: GameData, cap: number, onLobby?: (done: number, of: number) => void): Map<string, Removed> {
  // how often every item stands in an attacker's build
  const count = new Map<string, number>();
  for (const p of panels) for (const l of p.lobbies) for (const f of l.fights) for (const id of new Set(l.seats[f.a]!.builds[f.round - 1]!.items.map((x) => x.item))) count.set(id, (count.get(id) ?? 0) + 1);
  const seen = new Map<string, number>();
  const sum = new Map<string, [number, number, number]>(); // n, sum, sum of squares
  const total = panels.reduce((n, p) => n + p.lobbies.length, 0);
  let done = 0;
  for (const p of panels) for (const l of p.lobbies) {
    const sides = new Map<number, CSide>();
    const side = (seat: number, round: number) => { const k = seat * 100 + round; let c = sides.get(k); if (!c) { c = compile(l.seats[seat]!.builds[round - 1]!, data); sides.set(k, c); } return c; };
    for (const f of l.fights) {
      const build = l.seats[f.a]!.builds[f.round - 1]!;
      for (const id of new Set(build.items.map((x) => x.item))) {
        const k = seen.get(id) ?? 0;
        seen.set(id, k + 1);
        const every = Math.max(1, Math.floor(count.get(id)! / cap));
        if (k % every !== 0 || k / every >= cap) continue;
        const at = build.items.findIndex((x) => x.item === id);
        const without = compile({ ...build, items: build.items.filter((_, i) => i !== at) }, data);
        const d = f.rec.w - (simulate(without, side(f.b, f.round), data.rules, f.seed).winner === 0 ? 1 : 0);
        const s = sum.get(id) ?? [0, 0, 0];
        s[0]++; s[1] += d; s[2] += d * d;
        sum.set(id, s);
      }
    }
    onLobby?.(++done, total);
  }
  return new Map([...sum].map(([id, [n, s, ss]]) => { const m = s / n; return [id, { n, drop: m, se: n > 1 ? Math.sqrt(Math.max(0, ss / n - m * m) / (n - 1)) : NaN }]; }));
}

/** Solves A x = b for a symmetric positive definite A (Cholesky), in place. */
export function solveSpd(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j]!;
    for (let k = 0; k < j; k++) d -= A[j * n + k]! ** 2;
    d = Math.sqrt(Math.max(d, 1e-12));
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let v = A[i * n + j]!;
      for (let k = 0; k < j; k++) v -= A[i * n + k]! * A[j * n + k]!;
      A[i * n + j] = v / d;
    }
  }
  const x = Float64Array.from(b);
  for (let i = 0; i < n; i++) { let v = x[i]!; for (let k = 0; k < i; k++) v -= A[i * n + k]! * x[k]!; x[i] = v / A[i * n + i]!; }
  for (let i = n - 1; i >= 0; i--) { let v = x[i]!; for (let k = i + 1; k < n; k++) v -= A[k * n + i]! * x[k]!; x[i] = v / A[i * n + i]!; }
  return x;
}

/** One fight as sparse features: [index, value] pairs and the result. */
export interface Row { x: [number, number][]; y: number }

/** Ridge logistic regression (Newton steps). Returns one weight per feature. */
export function ridgeLogistic(rows: readonly Row[], features: number, lambda = 3, steps = 8): Float64Array {
  let w: Float64Array = new Float64Array(features);
  for (let it = 0; it < steps; it++) {
    const H = new Float64Array(features * features), g = new Float64Array(features);
    for (let i = 0; i < features; i++) { H[i * features + i] = lambda; g[i] = lambda * w[i]!; }
    for (const r of rows) {
      let z = 0;
      for (const [i, v] of r.x) z += w[i]! * v;
      const p = 1 / (1 + Math.exp(-z)), q = p * (1 - p);
      for (const [i, v] of r.x) {
        g[i]! += (p - r.y) * v;
        for (const [j, u] of r.x) H[i * features + j]! += q * v * u;
      }
    }
    const step = solveSpd(H, g, features);
    let moved = 0;
    for (let i = 0; i < features; i++) { w[i]! -= step[i]!; moved = Math.max(moved, Math.abs(step[i]!)); }
    if (moved < 1e-6) break;
  }
  return w;
}

/**
 * Item weights of the fight model for one panel, as points of win share at an even fight (weight × 25).
 * Features: item counts of the attacker minus the defender's, plus hero × third of the run (so that a strong hero
 * or a strong stage is not credited to its items).
 */
export function fightModel(panel: Panel, data: GameData): Map<string, number> {
  const ids = data.itemList.filter((i) => !i.isBag).map((i) => i.id);
  const ix = new Map(ids.map((id, i) => [id, i]));
  const heroIx = new Map(data.heroList.map((h, i) => [h.id, i]));
  const P = ids.length, R = data.rules.rounds;
  const rows: Row[] = [];
  for (const l of panel.lobbies) for (const f of l.fights) {
    const x = new Map<number, number>();
    const add = (i: number, v: number) => x.set(i, (x.get(i) ?? 0) + v);
    const a = l.seats[f.a]!, b = l.seats[f.b]!, third = Math.min(2, Math.floor(((f.round - 1) * 3) / R));
    for (const p of a.builds[f.round - 1]!.items) add(ix.get(p.item)!, 1);
    for (const p of b.builds[f.round - 1]!.items) add(ix.get(p.item)!, -1);
    add(P + heroIx.get(a.hero)! * 3 + third, 1);
    add(P + heroIx.get(b.hero)! * 3 + third, -1);
    rows.push({ x: [...x].filter(([, v]) => v !== 0), y: f.rec.w });
  }
  const w = ridgeLogistic(rows, P + data.heroList.length * 3);
  return new Map(ids.map((id, i) => [id, 0.25 * w[i]!]));
}

/** Robust z-scores within a group: (x − median) / (1.4826 × median absolute deviation). */
export function robustZ(values: readonly number[]): number[] {
  const med = (xs: readonly number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2) : 0; };
  const m = med(values), mad = 1.4826 * med(values.map((v) => Math.abs(v - m)));
  return values.map((v) => (mad > 0 ? (v - m) / mad : 0));
}

/** Pearson correlation. */
export function correlation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { ab += (a[i]! - ma) * (b[i]! - mb); aa += (a[i]! - ma) ** 2; bb += (b[i]! - mb) ** 2; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : NaN;
}
