/**
 * Do the recipe chains get played?
 *   npm run report:recipes -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 */
import { makeField } from "../sim/lobby";
import { avg, loadTargets, pct, signed, startReport } from "./common";

const r = startReport({
  id: "recipes",
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
r.log(
  `Rules: at most ${data.rules.recipes.maxDepth} steps in a chain, at most ${data.rules.recipes.maxInputs} inputs. ${data.recipes.length} recipes, ${data.recipes.filter((x) => x.in.length === 3).length} of them with 3 inputs.`,
);
const missed = seats.map((s) => s.bot.log.reduce((n, l) => n + l.missed, 0));
r.log(
  `Combinations per run: ${avg(perRun).toFixed(1)}. Rounds in which an owned recipe did not lie together before the fight: ${avg(missed).toFixed(1)} per run. Deepest chain step reached in a run: ${depthReached.map((n, d) => `${d === 0 ? "none" : `step ${d}`} ${pct(n / seats.length)}`).join(", ")}.`,
);
r.chart({
  type: "bar",
  title: "Deepest chain step reached in a run",
  x: depthReached.map((_, d) => (d === 0 ? "none" : `step ${d}`)),
  unit: "%",
  series: [{ name: "share of runs", values: depthReached.map((n) => (100 * n) / seats.length) }],
});
r.log();
r.log(
  "Bots merge by the player's rules: they lay owned inputs next to each other and the recipe merges after that round's fight. They value an item higher when it completes a recipe but do not plan chains, so read the shares as a lower bound.",
);
for (const depth of [1, 2, 3]) {
  r.log();
  r.log(`## Chain step ${depth}`);
  const rows = data.recipes
    .filter((x) => data.items.get(x.out)!.depth === depth)
    .map((x) => {
      const out = data.items.get(x.out)!;
      const runs = out.hero ? seats.filter((s) => s.bot.hero === out.hero).length : seats.length;
      const rounds = made.get(x.out) ?? [];
      return {
        name: out.name,
        inputs: x.in.map((i) => data.items.get(i)!.name).join(" + "),
        share: rounds.length / runs,
        round: avg(rounds),
        hero: out.hero ?? "",
      };
    })
    .sort((a, b) => b.share - a.share);
  r.table(
    ["result", "made in runs", "avg round", "hero", "inputs"],
    rows.map((x) => [x.name, pct(x.share), x.share ? x.round.toFixed(1) : "-", x.hero, x.inputs]),
  );
}
r.log();

// does one recipe result dominate? Win share while holding it against the same hero in the same round without it
r.log();
r.log("## Does a recipe dominate?");
const stat = new Map<string, { n: number; w: number; lift: number }>();
const base = new Map<string, { n: number; w: number }>();
const held = (l: (typeof lobbies)[number], seat: number, round: number) =>
  new Set(l.seats[seat]!.builds[round - 1]!.items.map((p) => p.item).filter((id) => data.items.get(id)!.crafted));
for (const l of lobbies)
  for (const f of l.fights) {
    const k = `${l.seats[f.a]!.bot.hero}:${f.round}`,
      x = base.get(k) ?? { n: 0, w: 0 };
    x.n++;
    if (f.res.winner === 0) x.w++;
    base.set(k, x);
  }
// strata: hero and round; compare holders with non-holders of the same stratum
const strata = new Map<string, Map<string, { n: number; w: number }>>();
for (const l of lobbies)
  for (const f of l.fights) {
    const k = `${l.seats[f.a]!.bot.hero}:${f.round}`;
    const m = strata.get(k) ?? new Map();
    strata.set(k, m);
    for (const id of held(l, f.a, f.round)) {
      const x = m.get(id) ?? { n: 0, w: 0 };
      x.n++;
      if (f.res.winner === 0) x.w++;
      m.set(id, x);
    }
  }
for (const [k, m] of strata) {
  const b = base.get(k)!;
  for (const [id, x] of m) {
    const restN = b.n - x.n;
    if (restN < 5) continue;
    const lift = x.w / x.n - (b.w - x.w) / restN;
    const s = stat.get(id) ?? { n: 0, w: 0, lift: 0 };
    s.n += x.n;
    s.w += x.w;
    s.lift += lift * x.n;
    stat.set(id, s);
  }
}
const T = loadTargets();
const domRows = [...stat]
  .filter(([, s]) => s.n >= 60)
  .map(([id, s]) => {
    const out = data.items.get(id)!;
    const runs = out.hero ? seats.filter((x) => x.bot.hero === out.hero).length : seats.length;
    const madeShare = (made.get(id) ?? []).length / runs;
    return { id, name: out.name, depth: out.depth, hero: out.hero ?? "", fights: s.n, wins: s.w / s.n, lift: s.lift / s.n, madeShare };
  })
  .sort((a, b) => b.lift - a.lift);
// the first upgrade of a start item is meant to be made by almost everyone of that hero
const startIds = new Set(data.heroList.flatMap((h) => h.start.map((p) => p.item)));
const fromStart = (id: string) => data.recipes.some((x) => x.out === id && x.in.some((i) => startIds.has(i)));
const flag = (x: (typeof domRows)[number]) =>
  (x.lift > T.recipeLift!.max! ? "too strong" : "") +
  (x.madeShare > T.recipeMadeShare!.max! && !fromStart(x.id) ? `${x.lift > T.recipeLift!.max! ? ", " : ""}everyone makes it` : "");
r.table(
  ["result", "step", "hero", "fights held", "wins", "lift", "made in runs", ""],
  domRows.slice(0, 15).map((x) => [x.name, x.depth, x.hero, x.fights, pct(x.wins), `${signed(x.lift * 100, 0)} pts`, pct(x.madeShare), flag(x)]),
  { center: 0, span: 100 * T.recipeLift!.max!, cols: [5], highIsBad: true },
);
r.log();
r.log(
  "lift: win share of a hero while the result lies in its backpack, minus the win share of the same hero in the same round without it (results held in at least 60 fights; the top 15). A good build holds more crafted items anyway, so a lift of a few points is normal.",
);
r.target(
  T.recipeLift!,
  domRows.map((x) => x.lift),
  true,
);
r.target(
  T.recipeMadeShare!,
  domRows.filter((x) => !fromStart(x.id)).map((x) => x.madeShare),
  true,
);
r.log("(Upgrades of a hero's start items are left out of the second check: almost every run of that hero is meant to make one of them.)");
const off = domRows.filter((x) => flag(x));
r.log(off.length ? `Off target: ${off.map((x) => `${x.name} (${flag(x)})`).join(", ")}.` : "No recipe result is off target.");
r.log();
r.log(
  `Never made: ${
    data.recipes
      .filter((x) => !made.has(x.out))
      .map((x) => data.items.get(x.out)!.name)
      .join(", ") || "none"
  }.`,
);
r.done();
