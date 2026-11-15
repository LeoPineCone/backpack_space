/**
 * Do the recipe chains get played?
 *   npm run report:recipes -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 */
import { makeField } from "../sim/lobby";
import { avg, pct, startReport, table } from "./common";

const r = startReport({
  title: "Recipes",
  question: "Which recipes do the bots complete, in which round, and how deep do the chains get in a run?",
  presets: { quick: { lobbies: 10 }, normal: { lobbies: 50 }, precise: { lobbies: 200 } },
  explain: { lobbies: "lobbies of 16 bots playing all 12 rounds" },
});
const data = r.data;
const { lobbies } = makeField(data, r.n.lobbies, r.seed, {}, (i) => r.progress(`lobby ${i + 1}/${r.n.lobbies}`));
const seats = lobbies.flatMap((l) => l.seats);
const made = new Map<string, number[]>();
const depthReached = [0, 0, 0, 0];
const perRun: number[] = [];
for (const s of seats) {
  const first = new Map<string, number>();
  for (const log of s.bot.log) for (const id of log.crafted) if (!first.has(id)) first.set(id, log.round);
  for (const [id, round] of first) made.set(id, [...(made.get(id) ?? []), round]);
  perRun.push(s.bot.log.reduce((n, l) => n + l.crafted.length, 0));
  depthReached[Math.max(0, ...[...first.keys()].map((id) => data.items.get(id)!.depth))]!++;
}
r.log();
r.log(`Rules: at most ${data.rules.recipes.maxDepth} steps in a chain, at most ${data.rules.recipes.maxInputs} inputs. ${data.recipes.length} recipes, ${data.recipes.filter((x) => x.in.length === 3).length} of them with 3 inputs.`);
r.log(`Combinations per run: ${avg(perRun).toFixed(1)}. Deepest chain step reached in a run: ${depthReached.map((n, d) => `${d === 0 ? "none" : `step ${d}`} ${pct(n / seats.length)}`).join(", ")}.`);
r.log();
r.log("Bots combine as soon as they own all inputs, and they value an item higher when it completes a recipe. A human will chase chains more deliberately, so read the shares as a lower bound.");
for (const depth of [1, 2, 3]) {
  r.log();
  r.log(`## Chain step ${depth}`);
  const rows = data.recipes.filter((x) => data.items.get(x.out)!.depth === depth).map((x) => {
    const out = data.items.get(x.out)!;
    const runs = out.hero ? seats.filter((s) => s.bot.hero === out.hero).length : seats.length;
    const rounds = made.get(x.out) ?? [];
    return { name: out.name, inputs: x.in.map((i) => data.items.get(i)!.name).join(" + "), share: rounds.length / runs, round: avg(rounds), hero: out.hero ?? "" };
  }).sort((a, b) => b.share - a.share);
  r.log(...table(["result", "made in runs", "avg round", "hero", "inputs"], rows.map((x) => [x.name, pct(x.share), x.share ? x.round.toFixed(1) : "-", x.hero, x.inputs])));
}
r.log();
r.log(`Never made: ${data.recipes.filter((x) => !made.has(x.out)).map((x) => data.items.get(x.out)!.name).join(", ") || "none"}.`);
r.done();
