/**
 * How strongly a path shapes a run, read from played lobbies: how much of a build belongs to its path, how alike
 * two runs of the same path are, how different the paths of a hero are, and whether following a path pays.
 * The numbers a sweep shows per value (npm run balance:sweep).
 */
import { onPath, type GameData } from "@backpack-space/core";
import { metricsOf } from "./metrics";
import { lobbyStat, type PanelLobby } from "./panel";

export interface PullRow { key: string; label: string; unit: "%" | "pts" | ""; /** key in data/sim/targets.json, if the row has a target */ target?: string }
export const PULL_ROWS: PullRow[] = [
  { key: "commit", label: "build on the path (share of item cost), average", unit: "%", target: "pathCommit" },
  { key: "commitMin", label: "build on the path, weakest path", unit: "%", target: "pathCommit" },
  { key: "varietySame", label: "variety: two runs of the same path (share of items not shared)", unit: "%" },
  { key: "varietyOpen", label: "variety: two runs of the hero without a path, for comparison", unit: "%" },
  { key: "apart", label: "two paths of one hero (share of items not shared)", unit: "%" },
  { key: "heroItems", label: "hero's own items in the final build (share of item cost)", unit: "%" },
  { key: "open", label: "path against the hero's open bot, average", unit: "pts", target: "pathOverOpen" },
  { key: "openMin", label: "path against the hero's open bot, weakest path", unit: "pts", target: "pathOverOpen" },
  { key: "pays", label: "going deeper pays: most against least committed third, average", unit: "pts", target: "pathPays" },
  { key: "paysMin", label: "going deeper pays, weakest path", unit: "pts", target: "pathPays" },
  { key: "distinctMin", label: "damage mix of the closest two paths (0 = same)", unit: "", target: "pathDistinct" },
  { key: "spreadMax", label: "best to weakest path of a hero, largest gap", unit: "pts", target: "pathSpread" },
];

/** share of the items of two builds that only one of them has (1 - shared / all, by item id) */
export function itemDistance(a: readonly string[], b: readonly string[]): number {
  const x = new Set(a), y = new Set(b);
  let both = 0;
  for (const id of x) if (y.has(id)) both++;
  const all = x.size + y.size - both;
  return all ? 1 - both / all : 0;
}
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** The numbers of PULL_ROWS plus every hero's win share ("hero:<id>") and every path's ("path:", "open:", "commit:<hero>/<path>"). */
export function pullOf(data: GameData, lobbies: readonly PanelLobby[]): Record<string, number> {
  const out: Record<string, number> = {};
  const final = (l: PanelLobby, seat: number) => l.seats[seat]!.builds[l.seats[seat]!.builds.length - 1]!.items.map((p) => p.item);
  const cost = (id: string) => Math.max(1, data.items.get(id)!.cost);
  const commit = new Map<string, number[]>();
  const same: number[] = [], openV: number[] = [], apart: number[] = [], heroItems: number[] = [];
  lobbies.forEach((l, i) => {
    const next = i % 2 === 0 ? lobbies[i + 1] : undefined;
    l.seats.forEach((s, k) => {
      const items = final(l, k);
      const all = items.reduce((x, id) => x + cost(id), 0) || 1;
      heroItems.push(items.filter((id) => data.items.get(id)!.hero).reduce((x, id) => x + cost(id), 0) / all);
      const path = data.heroes.get(s.hero)!.paths.find((p) => p.id === s.path);
      if (path) {
        const list = commit.get(`${s.hero}/${s.path}`) ?? [];
        list.push(items.filter((id) => onPath(data.items.get(id)!, path)).reduce((x, id) => x + cost(id), 0) / all);
        commit.set(`${s.hero}/${s.path}`, list);
      }
      // the same seat of the next lobby plays the same hero and path with other shops
      if (next && next.seats[k]?.hero === s.hero && next.seats[k]!.path === s.path) (path ? same : openV).push(itemDistance(items, final(next, k)));
      if (path) l.seats.forEach((o, j) => { if (j > k && o.hero === s.hero && o.path && o.path !== s.path) apart.push(itemDistance(items, final(l, j))); });
    });
  });
  for (const [key, list] of commit) out[`commit:${key}`] = mean(list);
  const commits = [...commit.values()].map(mean);
  out.commit = mean(commits); out.commitMin = Math.min(...commits);
  out.varietySame = mean(same); out.varietyOpen = mean(openV); out.apart = mean(apart); out.heroItems = mean(heroItems);
  const m = metricsOf(data, lobbies.map((l) => lobbyStat(data, l.seats, l.fights)));
  const of = (kind: string) => [...m.values()].filter((x) => x.kind === kind);
  for (const x of [...of("hero"), ...of("path"), ...of("open")]) out[x.key] = x.value;
  const open = of("open").map((x) => x.value);
  out.open = mean(open); out.openMin = Math.min(...open);
  const pays = of("pays").map((x) => x.value);
  out.pays = mean(pays); out.paysMin = Math.min(...pays);
  out.distinctMin = Math.min(...of("distinct").map((x) => x.value));
  out.spreadMax = Math.max(...of("spread").map((x) => x.value));
  return out;
}
