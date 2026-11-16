/**
 * The settled meta of a matchup table: how often each option would be played once everybody has adapted.
 * Not the exact Nash equilibrium (which jumps when a number in the table moves a little and plays many options
 * never) but its smoothed form: players choose an option more often the better it does against the current mix,
 * without always taking the very best (logit response). One steady point exists for a zero-sum table.
 */

/** softness: an option that wins one point of win share more against the meta is chosen e^(RESPONSE/100) ≈ 1.22 times as often */
export const RESPONSE = 20;

/**
 * @param win win[i][j] = share of fights option i wins against option j (0..1); the table is made zero-sum first
 * @returns share of every option in the settled meta (sums to 1)
 */
export function metaShares(win: readonly (readonly number[])[], response = RESPONSE): number[] {
  const n = win.length;
  // edge of i over j: mean of "i wins as attacker" and "j loses as attacker", minus one half
  const edge = win.map((row, i) => row.map((w, j) => (i === j ? 0 : (w + 1 - win[j]![i]!) / 2 - 0.5)));
  let x = Array.from({ length: n }, () => 1 / n);
  for (let it = 0; it < 4000; it++) {
    const u = edge.map((row) => row.reduce((s, e, j) => s + e * x[j]!, 0));
    const top = Math.max(...u);
    const e = u.map((v) => Math.exp(response * (v - top)));
    const z = e.reduce((a, b) => a + b, 0);
    let moved = 0;
    const next = x.map((v, i) => { const t = 0.95 * v + 0.05 * (e[i]! / z); moved = Math.max(moved, Math.abs(t - v)); return t; });
    x = next;
    if (moved < 1e-9) break;
  }
  return x;
}

/**
 * How far a matchup table is from "one order of strength": 0 = every result follows from each option's average
 * strength (the stronger simply wins), 1 = pure rock-paper-scissors (averages explain nothing).
 */
export function cycleShare(win: readonly (readonly number[])[]): number {
  const n = win.length;
  const edge = win.map((row, i) => row.map((w, j) => (i === j ? 0 : (w + 1 - win[j]![i]!) / 2 - 0.5)));
  const s = edge.map((row) => row.reduce((a, b) => a + b, 0) / n);
  let total = 0, rest = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (i === j) continue; total += edge[i]![j]! ** 2; rest += (edge[i]![j]! - (s[i]! - s[j]!)) ** 2; }
  return total > 0 ? rest / total : 0;
}
