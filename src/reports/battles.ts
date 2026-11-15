/**
 * How do fights go, round by round?
 *   npm run report:battles -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 */
import { makeField } from "../sim/lobby";
import { avg, loadTargets, pct, quantile, share, startReport } from "./common";

const r = startReport({
  id: "battles",
  title: "Battles",
  question: "How long do fights last in each round, how often does the Supernova decide them, and where does the damage come from?",
  presets: { quick: { lobbies: 8 }, normal: { lobbies: 40 }, precise: { lobbies: 160 } },
  explain: { lobbies: "lobbies of 16 bots playing all 12 rounds" },
});
const { lobbies } = makeField(r.data, r.n.lobbies, r.seed, {}, (i) => r.progress(`lobby ${i + 1}/${r.n.lobbies}`));
const fights = lobbies.flatMap((l) => l.fights);
const nova = r.data.rules.battle.phases.reduce((s, p) => s + p.seconds, 0);
r.log();
r.log(`Star clock: ${r.data.rules.battle.phases.map((p) => `${p.name} ${p.seconds} s`).join(", ")}, then ${r.data.rules.battle.supernova.name} at ${nova} s.`);
r.log();
const rows: (string | number)[][] = [];
const srcs = ["weapon", "direct", "burn", "toxin", "spikes"] as const;
const rounds = Array.from({ length: r.data.rules.rounds }, (_, i) => i + 1);
const novaShare: number[] = [], dmgBy: Record<string, number[]> = { ...Object.fromEntries(srcs.map((k) => [k, [] as number[]])), nova: [] };
for (let round = 1; round <= r.data.rules.rounds; round++) {
  const fs = fights.filter((f) => f.round === round);
  const secs = fs.map((f) => f.res.seconds);
  const novaFs = fs.filter((f) => f.res.supernova);
  const led = novaFs.filter((f) => f.res.leaderAtNova >= 0);
  const dmg = (k: (typeof srcs)[number]) => fs.reduce((s, f) => s + f.res.stats[0][k] + f.res.stats[1][k], 0);
  const novaDmg = fs.reduce((s, f) => s + f.res.stats[0].nova + f.res.stats[1].nova, 0);
  const total = srcs.reduce((s, k) => s + dmg(k), 0) + novaDmg;
  novaShare.push((100 * novaFs.length) / fs.length);
  for (const k of srcs) dmgBy[k]!.push((100 * dmg(k)) / total);
  dmgBy.nova!.push((100 * novaDmg) / total);
  rows.push([
    round, r.data.rules.heroHp[round - 1]!, avg(secs).toFixed(1), `${quantile(secs, 0.1).toFixed(0)}–${quantile(secs, 0.9).toFixed(0)}`,
    share(novaFs.length / fs.length, fs.length), led.length ? pct(led.filter((f) => f.res.winner === f.res.leaderAtNova).length / led.length) : "-",
    ...srcs.map((k) => pct(dmg(k) / total)), pct(novaDmg / total),
    avg(fs.map((f) => (f.res.stats[0].healed + f.res.stats[1].healed) / 2)).toFixed(0), avg(fs.map((f) => (f.res.stats[0].shielded + f.res.stats[1].shielded) / 2)).toFixed(0),
    pct(fs.filter((f) => f.res.winner === -1).length / fs.length),
  ]);
}
r.table(["round", "health", "seconds", "10–90 %", "reaches nova", "leader wins", "weapons", "direct", "burn", "toxin", "spikes", "nova", "healed", "shield", "draws"], rows);
r.log();
const T = loadTargets();
r.chart({ type: "line", title: "Average fight length", x: rounds, xLabel: "round", unit: "s", series: [{ name: "seconds", values: rounds.map((_, i) => Number(rows[i]![2])) }], band: T.fightSeconds });
r.chart({ type: "line", title: "Fights that reach the Supernova", x: rounds, xLabel: "round", unit: "%", series: [{ name: "reaches nova", values: novaShare }], band: { min: 100 * (T.supernovaReached!.min ?? 0), max: 100 * (T.supernovaReached!.max ?? 1) } });
r.chart({ type: "stack", title: "Where the damage comes from (share of all health lost)", x: rounds, xLabel: "round", unit: "%", series: [...srcs, "nova" as const].map((k) => ({ name: k, values: dmgBy[k]! })) });
r.log("seconds: average fight length. reaches nova: share of fights still running when the Supernova starts. leader wins: of those, how often the hero with more health at that moment wins.");
r.log("weapons … nova: share of all health lost by source. healed / shield: average per hero and fight.");

// where on the star clock the fights end
const B = r.data.rules.battle;
const starts: { name: string; at: number }[] = [];
{ let at = 0; for (const p of B.phases) { starts.push({ name: p.name, at }); at += p.seconds; } starts.push({ name: B.supernova.name, at }); }
const phaseOf = (sec: number) => { let k = 0; for (let i = 0; i < starts.length; i++) if (sec > starts[i]!.at) k = i; return k; };
r.log();
r.log("## Where on the star clock the fights end");
const rows2: (string | number)[][] = [];
const perRound = { secs: [] as number[], longest: [] as number[], reached: [] as number[], lasts90: [] as number[] };
for (let round = 1; round <= r.data.rules.rounds; round++) {
  const fs = fights.filter((f) => f.round === round);
  const ends = starts.map((_, k) => fs.filter((f) => phaseOf(f.res.seconds) === k).length / fs.length);
  const after = fs.filter((f) => f.res.supernova).map((f) => f.res.seconds - nova);
  perRound.secs.push(avg(fs.map((f) => f.res.seconds))); perRound.longest.push(Math.max(...fs.map((f) => f.res.seconds)));
  perRound.reached.push(after.length / fs.length); if (after.length) perRound.lasts90.push(quantile(after, 0.9));
  rows2.push([round, ...ends.map(pct), after.length ? after.length >= 1 ? avg(after).toFixed(1) : "-" : "-", after.length ? quantile(after, 0.9).toFixed(0) : "-", Math.max(...fs.map((f) => f.res.seconds)).toFixed(0)]);
}
r.table(["round", ...starts.map((p) => p.name), "nova lasts", "90 %", "longest"], rows2);
r.chart({ type: "stack", title: "Phase of the star clock in which the fights end", x: rounds, xLabel: "round", unit: "%", series: starts.map((p, k) => ({ name: p.name, values: rows2.map((row) => Number.parseFloat(String(row[k + 1]))) })) });
r.chart({ type: "line", title: "Longest fight of the round", x: rounds, xLabel: "round", unit: "s", series: [{ name: "longest", values: perRound.longest }], band: { max: T.longestFight!.max } });
r.log();
r.log(`Each phase column: share of the fights that end in it. nova lasts: average seconds from the start of the ${B.supernova.name} to the end of the fight, for the fights that reach it; 90 %: nine in ten of them are over by then. longest: longest fight of the round in seconds.`);

// Supernova by hero
const seats = lobbies.map((l) => l.seats);
const heroOf = (li: number, seat: number) => seats[li]![seat]!.bot.hero;
const perHero = new Map<string, { n: number; nova: number; novaWins: number }>();
lobbies.forEach((l, li) => { for (const f of l.fights) for (const side of [0, 1] as const) {
  const h = heroOf(li, side === 0 ? f.a : f.b);
  const x = perHero.get(h) ?? { n: 0, nova: 0, novaWins: 0 };
  x.n++; if (f.res.supernova) { x.nova++; if (f.res.winner === side) x.novaWins++; }
  perHero.set(h, x);
} });
// Energy
{
  const E = r.data.rules.energy;
  r.log();
  r.log("## Energy");
  r.log(`Every attack costs Energy; Energy refills by ${E.regen} per second up to ${E.max} (start ${E.start}). A weapon without enough Energy waits.`);
  const rowsE: (string | number)[][] = [];
  for (let round = 1; round <= r.data.rules.rounds; round++) {
    const sides = lobbies.flatMap((l, li) => l.fights.filter((f) => f.round === round).flatMap((f) => [0, 1].map((side) => {
      const build = seats[li]![side === 0 ? f.a : f.b]!.builds[round - 1]!;
      const weapons = build.items.map((p) => r.data.items.get(p.item)!).filter((d) => d.damage);
      const st = f.res.stats[side]!;
      return { weapons: weapons.length, need: weapons.reduce((s, d) => s + (d.energy ?? 0) / d.cooldown!, 0), wait: weapons.length ? st.energyWait / (weapons.length * f.res.seconds) : 0, gained: st.energyGained / f.res.seconds, spent: st.energySpent / f.res.seconds };
    })));
    rowsE.push([round, avg(sides.map((x) => x.weapons)).toFixed(1), avg(sides.map((x) => x.need)).toFixed(1), avg(sides.map((x) => x.spent)).toFixed(1), avg(sides.map((x) => x.gained)).toFixed(1), pct(avg(sides.map((x) => x.wait))), pct(sides.filter((x) => x.wait > 0.25).length / sides.length)]);
  }
  r.table(["round", "weapons", "need/s", "spent/s", "from items/s", "waiting", "starved"], rowsE);
  r.chart({ type: "line", title: "Energy per second", x: rounds, xLabel: "round", series: [{ name: "need", values: rowsE.map((x) => Number(x[2])) }, { name: "spent", values: rowsE.map((x) => Number(x[3])) }, { name: "from items", values: rowsE.map((x) => Number(x[4])) }] });
  r.chart({ type: "line", title: "Weapons waiting for Energy", x: rounds, xLabel: "round", unit: "%", series: [{ name: "waiting", values: rowsE.map((x) => Number.parseFloat(String(x[5]))) }, { name: "starved", values: rowsE.map((x) => Number.parseFloat(String(x[6]))) }] });
  r.log();
  r.log("weapons: average weapons in a backpack. need/s: Energy per second all weapons would use without waiting (before speed buffs). spent/s: Energy really spent per second. from items/s: Energy per second from items (on top of the refill). waiting: share of weapon time spent waiting for Energy. starved: share of backpacks whose weapons wait more than a quarter of the time.");
}

r.log();
r.log("## Targets (data/sim/targets.json)");
r.target(T.fightSeconds!, perRound.secs, false);
r.target(T.longestFight!, perRound.longest, false);
r.target(T.supernovaReached!, perRound.reached, true);
r.target(T.supernovaLasts90!, perRound.lasts90, false);
r.log();
r.log(`## ${B.supernova.name} by hero`);
r.table(["hero", "resists", "fights reaching it", "wins of those"], r.data.heroList.map((h) => { const x = perHero.get(h.id)!; return [h.name, `${h.supernovaResist} %`, share(x.nova / x.n, x.n), x.nova ? share(x.novaWins / x.nova, x.nova) : "-"]; }));
r.done();
