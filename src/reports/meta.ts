/**
 * Who beats whom, and what would a settled meta look like?
 *   npm run report:meta -- [--quick | --precise] [--name main] [--out file]
 *
 * Builds of the baseline (rounds 4, 8 and 12) of every path fight the builds of every other path. From the
 * path-against-path table: the hero-against-hero table, how much of it is rock-paper-scissors, and the meta share:
 * how often each path would be played once players have adapted (see src/balance/meta.ts). A hero far above its
 * fair share dominates; a path near zero is one nobody would pick. The hero target is wide on purpose: it only
 * catches blunders. Needs a baseline (npm run baseline); no bot shops in this report.
 */
import { compile, simulate, Rng, type Build, type CSide } from "@backpack-space/core";
import { Bench } from "../balance/bench";
import { cycleShare, metaShares, RESPONSE } from "../balance/meta";
import { loadTargets, markOf, pct, startReport } from "./common";
import type { Mark } from "./html";

const r = startReport({
  id: "meta",
  title: "Matchups and meta",
  question: "Which path beats which, does one hero dominate, and which paths would be played in a settled meta?",
  presets: { quick: { fights: 30 }, normal: { fights: 100 }, precise: { fights: 300 } },
  explain: { fights: "fights per pair of paths (attacker, defender), stage and seed" },
});
const name = r.flags.name ?? "main";
const bench = new Bench(name);
const data = bench.data, T = loadTargets();
r.log(`Baseline "${name}": ${bench.meta.lobbies} lobbies per seed, seeds ${bench.meta.seeds.join(", ")}.${bench.fresh ? "" : " STALE: data/ or the ratings changed since; take a new one (npm run baseline)."}`);
const STAGES = [4, 8, 12].filter((s) => s <= data.rules.rounds);
const paths = data.heroList.flatMap((h) => h.paths.map((p) => ({ hero: h.id, id: p.id, key: `${h.id}/${p.id}`, name: `${h.name.split(" ")[0]!.replace(/"/g, "")}: ${p.name}` })));
const N = paths.length;

/** win[i][j] of one panel: path i attacking path j, all stages */
function tableOf(k: number): number[][] {
  const panel = bench.panels[k]!;
  const rng = new Rng(panel.seed * 7919 + 13);
  const pool = new Map<string, CSide[]>();
  for (const round of STAGES) for (const p of paths) {
    const builds: Build[] = panel.lobbies.flatMap((l) => l.seats.filter((s) => s.hero === p.hero && s.path === p.id).map((s) => s.builds[round - 1]!));
    pool.set(`${round}/${p.key}`, builds.map((b) => compile(b, data)));
  }
  const win = paths.map(() => paths.map(() => 0));
  paths.forEach((a, i) => paths.forEach((b, j) => {
    r.progress(`seed ${panel.seed}: ${a.key} against ${b.key}`);
    let w = 0, n = 0;
    for (const round of STAGES) {
      const A = pool.get(`${round}/${a.key}`)!, B = pool.get(`${round}/${b.key}`)!;
      for (let f = 0; f < r.n.fights; f++) { const res = simulate(rng.pick(A), rng.pick(B), data.rules, rng.int(2 ** 31)); w += res.winner === 0 ? 1 : res.winner === -1 ? 0.5 : 0; n++; }
    }
    win[i]![j] = w / n;
  }));
  return win;
}
const tables = bench.panels.map((_, k) => tableOf(k));
const pooled = tables[0]!.map((row, i) => row.map((_, j) => tables.reduce((s, t) => s + t[i]![j]!, 0) / tables.length));
const perPair = r.n.fights * STAGES.length * tables.length;

// ---- path against path
r.log();
r.log("## Path against path");
r.log(`Row attacks column, builds of rounds ${STAGES.join(", ")}, ${perPair} fights per cell (± about ${Math.round(100 * Math.sqrt(0.25 / perPair))} points). The diagonal is a path against itself.`);
r.table(["", ...paths.map((p) => p.key), "average"], paths.map((p, i) => [p.name, ...pooled[i]!.map((w) => pct(w)), pct(pooled[i]!.filter((_, j) => paths[j]!.hero !== p.hero).reduce((a, b) => a + b, 0) / paths.filter((q) => q.hero !== p.hero).length)]),
  { center: 50, span: 15, cols: paths.map((_, j) => j + 1) });
r.log("average: against the paths of the other heroes.");

// ---- hero against hero
const heroes = data.heroList;
const duel = heroes.map((a) => heroes.map((b) => { const xs: number[] = []; paths.forEach((p, i) => paths.forEach((q, j) => { if (p.hero === a.id && q.hero === b.id) xs.push(pooled[i]![j]!); })); return xs.reduce((s, v) => s + v, 0) / xs.length; }));
r.log();
r.log("## Hero against hero (every path of the row hero against every path of the column hero)");
const tDuel = T.heroDuel!;
r.table(["", ...heroes.map((h) => h.id)], heroes.map((h, i) => [h.name, ...duel[i]!.map((w) => pct(w))]), { center: 50, span: 15, cols: heroes.map((_, j) => j + 1) }, heroes.map((_, i) => ["", ...heroes.map((__, j): Mark => (i === j ? "" : markOf(tDuel, duel[i]![j]!)))]));
r.target(tDuel, heroes.flatMap((_, i) => heroes.map((__, j) => (i === j ? 0.5 : duel[i]![j]!))), true);
const beatsAll = heroes.filter((_, i) => heroes.every((__, j) => i === j || duel[i]![j]! > 0.52));
r.log(beatsAll.length ? `${beatsAll.map((h) => h.name).join(", ")} beats every other hero (above 52 %).` : "No hero beats every other hero.");
r.log(`Rock-paper-scissors share of the path table: ${pct(cycleShare(pooled))} (0 % = the stronger path simply wins, 100 % = pure rock-paper-scissors).`);

// ---- meta
const shares = metaShares(pooled), perSeed = tables.map((t) => metaShares(t));
const heroShare = (x: number[], hero: string) => paths.reduce((s, p, i) => s + (p.hero === hero ? x[i]! : 0), 0);
const tMeta = T.metaHero;
r.log();
r.log("## Meta share: how often each would be played in a settled meta");
r.log(`Players pick a path more often the better it does against the current mix (one point of win share more = chosen about ${Math.round(100 * (Math.exp(RESPONSE / 100) - 1))} % more often). Fair share: ${pct(1 / heroes.length)} per hero, ${pct(1 / N)} per path.`);
r.table(["hero", `meta share${tMeta ? ` [target ${pct(tMeta.min!)}–${pct(tMeta.max!)}]` : ""}`, ...bench.panels.map((p) => `seed ${p.seed} alone`)],
  heroes.map((h) => [h.name, pct(heroShare(shares, h.id)), ...perSeed.map((x) => pct(heroShare(x, h.id)))]), undefined, tMeta ? heroes.map((h) => ["", markOf(tMeta, heroShare(shares, h.id))]) : undefined);
if (tMeta) r.target(tMeta, heroes.map((h) => heroShare(shares, h.id)), true);
r.table(["path", "meta share", ...bench.panels.map((p) => `seed ${p.seed} alone`), "wins against the meta"],
  paths.map((p, i) => [p.name, pct(shares[i]!), ...perSeed.map((x) => pct(x[i]!)), pct(0.5 + pooled[i]!.reduce((s, w, j) => s + shares[j]! * (i === j ? 0 : (w + 1 - pooled[j]![i]!) / 2 - 0.5), 0))]),
  { center: 100 / N, span: 100 / N, cols: [1] });
const dead = paths.filter((_, i) => shares[i]! < 0.25 / N);
r.log(dead.length ? `Hardly played (under a quarter of the fair share): ${dead.map((p) => p.name).join(", ")}. Information, not a target: a path may be a niche pick.` : "Every path is played at least a quarter of its fair share.");
r.chart({ type: "bar", title: "Meta share of every path", x: paths.map((p) => p.name), unit: "%", ref: 100 / N, series: [{ name: "meta share", values: shares.map((s) => 100 * s) }] });
for (const h of heroes) r.value(`meta:${h.id}`, [heroShare(shares, h.id)]);
r.log();
r.log("Reading: the meta share uses bot builds, so it shows which paths the numbers favour, not what players will discover. The seed columns show how steady the number is: differences between them are noise.");
r.done();
