/**
 * What is placement worth?
 *   npm run report:placement -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 */
import { arrange, compile, shuffleLayout, simulate, type Build, type CSide } from "@backpack-space/core";
import { makeField } from "../sim/lobby";
import { avg, pct, signed, startReport, stderr, table } from "./common";

const r = startReport({
  title: "Placement",
  question: "How much does a build lose when the same items lie in the same bags at random instead of where the stars and bags help them?",
  presets: { quick: { builds: 40, lobbies: 6, fights: 8 }, normal: { builds: 150, lobbies: 20, fights: 10 }, precise: { builds: 500, lobbies: 50, fights: 12 } },
  explain: { builds: "builds per round", lobbies: "lobbies that supply builds and opponents", fights: "fights per build and layout" },
});
const data = r.data;
const { byRound } = makeField(data, r.n.lobbies, r.seed, {}, (i) => r.progress(`lobby ${i + 1}/${r.n.lobbies}`));
r.log();
const rows: (string | number)[][] = [];
for (const round of [2, 4, 6, 8, 10, 12]) {
  const field = byRound[round - 1]!;
  const d: number[] = [], dBest: number[] = [];
  let planned = 0, random = 0, links = 0;
  for (let i = 0; i < r.n.builds; i++) {
    r.progress(`round ${round} build ${i + 1}/${r.n.builds}`);
    const b = field[r.rng.int(field.length)]!;
    const ids = b.items.map((p) => p.item);
    const sh = shuffleLayout(data, b.bags, ids, r.rng);
    const again = arrange(data, b.bags, ids, r.rng, { moves: 1500, tries: 6 });
    if (sh.left.length || again.left.length) continue;
    const sides: CSide[] = [compile(b, data), compile({ ...b, items: sh.items } as Build, data), compile({ ...b, items: again.items } as Build, data)];
    const w = [0, 0, 0];
    for (let f = 0; f < r.n.fights; f++) {
      const opp = compile(field[r.rng.int(field.length)]!, data), seed = r.rng.int(2 ** 31);
      sides.forEach((s, k) => { const x = simulate(s, opp, data.rules, seed).winner; w[k]! += x === 0 ? 1 : x === -1 ? 0.5 : 0; });
    }
    planned += w[0]!; random += w[1]!;
    d.push((100 * (w[0]! - w[1]!)) / r.n.fights); dBest.push((100 * (w[2]! - w[0]!)) / r.n.fights);
    links += sides[0]!.items.reduce((n, it) => n + it.starred.length, 0);
  }
  rows.push([round, pct(planned / (d.length * r.n.fights)), pct(random / (d.length * r.n.fights)), `${signed(avg(d))} ±${stderr(d).toFixed(1)}`, `${signed(avg(dBest))} ±${stderr(dBest).toFixed(1)}`, (links / d.length).toFixed(1)]);
}
r.log(...table(["round", "as the bot laid it", "random layout", "bot − random", "long search − bot", "star links"], rows));
r.log();
r.log("bot − random: points of win share placement is worth. long search − bot: what a six times longer layout search adds on top (how much the bots leave on the table).");
r.log("star links: items lying on a star of another item, per build.");
r.done();
