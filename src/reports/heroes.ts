/**
 * Are the heroes even?
 *   npm run report:heroes -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 */
import { compile, simulate } from "@backpack-space/core";
import { makeField } from "../sim/lobby";
import { loadTargets, pct, share, startReport } from "./common";

const r = startReport({
  id: "heroes",
  title: "Heroes",
  question: "Does every hero win about half of the fights, in every part of the run and against every other hero?",
  presets: { quick: { lobbies: 8, duels: 150 }, normal: { lobbies: 40, duels: 600 }, precise: { lobbies: 160, duels: 2500 } },
  explain: { lobbies: "lobbies of 16 bots (4 per hero) playing all 12 rounds", duels: "extra fights per hero pair for the matrix" },
});
const data = r.data;
const { lobbies, byRound } = makeField(data, r.n.lobbies, r.seed, {}, (i) => r.progress(`lobby ${i + 1}/${r.n.lobbies}`));
const heroes = data.heroList.map((h) => h.id);
const parts: [string, number, number][] = [["rounds 1–4", 1, 4], ["rounds 5–8", 5, 8], ["rounds 9–12", 9, 12], ["all", 1, 12]];
r.log();
r.log("Win share in lobby fights (the hero attacks a random other bot of the lobby):");
const shares: number[] = [];
r.table(["hero", ...parts.map((p) => p[0])], heroes.map((h) => [
  data.heroes.get(h)!.name,
  ...parts.map(([, from, to]) => {
    let w = 0, n = 0;
    for (const l of lobbies) for (const f of l.fights) if (f.round >= from && f.round <= to && l.seats[f.a]!.bot.hero === h && l.seats[f.b]!.bot.hero !== h) { n++; if (f.res.winner === 0) w++; }
    shares.push(w / n);
    return share(w / n, n);
  }),
]), { center: 50, span: 10 });
const T = loadTargets();
const thirds = parts.slice(0, 3);
r.chart({
  type: "line", title: "Win share by part of the run", x: thirds.map((p) => p[0]), unit: "%", ref: 50,
  band: { min: 100 * T.heroWinShare!.min!, max: 100 * T.heroWinShare!.max! },
  series: heroes.map((h, i) => ({ name: data.heroes.get(h)!.name, values: thirds.map((_, k) => 100 * shares[i * parts.length + k]!) })),
});
r.log();
r.log(`Hero against hero (row wins against column), builds of rounds 4, 8 and 12, ${r.n.duels} fights per pair:`);
const pick = (h: string, round: number) => { const list = byRound[round - 1]!.filter((b) => b.hero === h); return list[r.rng.int(list.length)]!; };
const rows: (string | number)[][] = [];
const duels: number[] = [];
for (const a of heroes) {
  const row: (string | number)[] = [data.heroes.get(a)!.name];
  for (const b of heroes) {
    if (a === b) { row.push("-"); continue; }
    let w = 0;
    for (let i = 0; i < r.n.duels; i++) {
      const round = [4, 8, 12][i % 3]!;
      const res = simulate(compile(pick(a, round), data), compile(pick(b, round), data), data.rules, r.rng.int(2 ** 31));
      w += res.winner === 0 ? 1 : res.winner === -1 ? 0.5 : 0;
    }
    row.push(pct(w / r.n.duels)); duels.push(w / r.n.duels);
  }
  rows.push(row);
}
r.table(["", ...heroes.map((h) => data.heroes.get(h)!.name)], rows, { center: 50, span: 20 });
r.log();
r.log("## Targets (data/sim/targets.json)");
r.target(T.heroWinShare!, shares, true);
r.target(T.heroDuel!, duels, true);
r.log("(Each share has a noise of about ±2 points at normal accuracy, see the ± in the table.)");
r.log();
r.log("Run results by hero are in report:runs.");
r.done();
