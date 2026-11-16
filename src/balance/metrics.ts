/**
 * Fight-level balancing numbers from lobby stats, each with its target (data/sim/targets.json) and with the
 * value per block of lobbies, so that two measurements on the same lobbies can be compared paired.
 */
import type { GameData } from "@backpack-space/core";
import { aggregatePaths, blockCount, blockSe, profileDistance, profileOf, type Profile } from "../sim/paths";
import type { Target } from "../reports/common";
import type { LobbyStat } from "./panel";

/** metric kinds and the target each is checked against */
export const KINDS = {
  hero: "pathHeroWinShare", third: "heroWinShare", path: "pathWinShare", late: "pathLateWinShare", open: "pathOverOpen", spread: "pathSpread",
  duel: "heroDuel", secs: "fightSeconds", nova: "supernovaReached", main: "pathMainShare", distinct: "pathDistinct",
} as const;
export type Kind = keyof typeof KINDS;
/** kinds measured in seconds; all others are shares (shown in points) */
export const isSeconds = (kind: Kind) => kind === "secs";

export interface Metric { key: string; kind: Kind; label: string; value: number; blocks: number[]; se: number }
export type Metrics = Map<string, Metric>;

const short = (data: GameData, hero: string) => data.heroes.get(hero)!.name.split(" ")[0]!.replace(/"/g, "");

function compute(data: GameData, stats: readonly LobbyStat[]): Record<string, number> {
  const out: Record<string, number> = {};
  const groups = aggregatePaths(stats.map((s) => s.seats));
  const R = data.rules.rounds;
  for (const h of data.heroList) {
    const hero = groups.get(`${h.id}/*`);
    if (!hero) continue;
    out[`hero:${h.id}`] = hero.all.p;
    const open = groups.get(`${h.id}/`);
    const shares: number[] = [], profs: Profile[] = [];
    for (const p of h.paths) {
      const g = groups.get(`${h.id}/${p.id}`);
      if (!g) continue;
      out[`path:${h.id}/${p.id}`] = g.all.p;
      out[`late:${h.id}/${p.id}`] = g.late.p;
      if (open) out[`open:${h.id}/${p.id}`] = g.all.p - open.all.p;
      const pr = profileOf(g);
      out[`main:${h.id}/${p.id}`] = pr.mix[pr.main];
      shares.push(g.all.p); profs.push(pr);
    }
    if (shares.length > 1) out[`spread:${h.id}`] = Math.max(...shares) - Math.min(...shares);
    let closest = Infinity;
    for (let i = 0; i < profs.length; i++) for (let j = i + 1; j < profs.length; j++) closest = Math.min(closest, profileDistance(profs[i]!, profs[j]!));
    if (Number.isFinite(closest)) out[`distinct:${h.id}`] = closest;
    for (let t = 0; t < 3; t++) {
      let w = 0, n = 0;
      for (const s of stats) { const x = s.third[h.id]?.[t]; if (x) { w += x[0]; n += x[1]; } }
      if (n) out[`third:${h.id}:${t + 1}`] = w / n;
    }
    for (const o of data.heroList) {
      if (o.id === h.id) continue;
      let w = 0, n = 0;
      for (const s of stats) { const x = s.duel[`${h.id}>${o.id}`]; if (x) { w += x[0]; n += x[1]; } }
      if (n) out[`duel:${h.id}>${o.id}`] = w / n;
    }
  }
  for (let r = 0; r < R; r++) {
    let secs = 0, n = 0, nova = 0;
    for (const s of stats) { const x = s.rounds[r]; if (x) { secs += x[0]; n += x[1]; nova += x[2]; } }
    if (n) { out[`secs:r${r + 1}`] = secs / n; out[`nova:r${r + 1}`] = nova / n; }
  }
  return out;
}

function labelOf(data: GameData, key: string): string {
  const [kind, rest] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  const pathName = (hp: string) => { const [h, p] = hp.split("/"); return `${short(data, h!)}: ${data.heroes.get(h!)!.paths.find((x) => x.id === p)?.name ?? p}`; };
  const third = (t: string) => { const R = data.rules.rounds, k = Number(t); return `rounds ${Math.floor(((k - 1) * R) / 3) + 1}–${Math.floor((k * R) / 3)}`; };
  switch (kind) {
    case "hero": return `${short(data, rest)} overall`;
    case "third": return `${short(data, rest.split(":")[0]!)} ${third(rest.split(":")[1]!)}`;
    case "path": return pathName(rest);
    case "late": return `${pathName(rest)}, late rounds`;
    case "open": return `${pathName(rest)} vs open bot`;
    case "spread": return `${short(data, rest)}: best to weakest path`;
    case "duel": return `${short(data, rest.split(">")[0]!)} against ${short(data, rest.split(">")[1]!)}`;
    case "secs": return `fight length round ${rest.slice(1)}`;
    case "nova": return `Supernova reached round ${rest.slice(1)}`;
    case "main": return `${pathName(rest)}: main mechanic`;
    case "distinct": return `${short(data, rest)}: closest two paths`;
    default: return key;
  }
}

/** Every fight-level number of these lobbies, with block values (blocks in lobby order, as report:paths). */
export function metricsOf(data: GameData, stats: readonly LobbyStat[]): Metrics {
  const K = blockCount(stats.length);
  const all = compute(data, stats);
  const perBlock = Array.from({ length: K }, (_, b) => compute(data, stats.filter((_, i) => Math.min(K - 1, Math.floor((i * K) / stats.length)) === b)));
  const out: Metrics = new Map();
  for (const [key, value] of Object.entries(all)) {
    const blocks = perBlock.map((x) => x[key] ?? value);
    out.set(key, { key, kind: key.slice(0, key.indexOf(":")) as Kind, label: labelOf(data, key), value, blocks, se: blockSe(blocks) });
  }
  return out;
}

/** change of a metric between two measurements on the same lobbies, with its paired standard error */
export function paired(before: Metric, after: Metric): { d: number; se: number } {
  return { d: after.value - before.value, se: blockSe(after.blocks.map((x, i) => x - before.blocks[i]!)) };
}

/** how far a value lies outside its target band, with a margin kept to the edges (0 = inside) */
export function outside(t: Target | undefined, v: number, margin = 0): number {
  if (!t) return 0;
  if (t.min !== undefined && t.max !== undefined && t.max - t.min < 2 * margin) margin = (t.max - t.min) / 2;
  if (t.min !== undefined && v < t.min + margin) return t.min + margin - v;
  if (t.max !== undefined && v > t.max - margin) return v - (t.max - margin);
  return 0;
}

export interface LossOpts {
  /** metric kinds that count */
  kinds: readonly Kind[];
  /** distance kept to the edge of a band: shares (0.005 = half a point) and seconds */
  margin: number; marginSeconds: number;
}
export const DEFAULT_KINDS: readonly Kind[] = ["hero", "third", "path", "late", "spread", "duel", "secs", "nova"];

/** Sum of squared distances to the target bands: points of win share and seconds count alike. 0 = everything on target. */
export function loss(values: (key: string) => number | undefined, metrics: Metrics, targets: Record<string, Target>, o: LossOpts): number {
  let sum = 0;
  for (const m of metrics.values()) {
    if (!o.kinds.includes(m.kind)) continue;
    const v = values(m.key) ?? m.value;
    const d = outside(targets[KINDS[m.kind]], v, isSeconds(m.kind) ? o.marginSeconds : o.margin);
    sum += (isSeconds(m.kind) ? d : 100 * d) ** 2;
  }
  return sum;
}
