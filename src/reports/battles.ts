/**
 * How do fights go, round by round?
 *   npm run report:battles -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 */
import { makeField } from "../sim/lobby";
import { avg, pct, quantile, share, startReport, table } from "./common";

const r = startReport({
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
for (let round = 1; round <= r.data.rules.rounds; round++) {
  const fs = fights.filter((f) => f.round === round);
  const secs = fs.map((f) => f.res.seconds);
  const novaFs = fs.filter((f) => f.res.supernova);
  const led = novaFs.filter((f) => f.res.leaderAtNova >= 0);
  const dmg = (k: (typeof srcs)[number]) => fs.reduce((s, f) => s + f.res.stats[0][k] + f.res.stats[1][k], 0);
  const novaDmg = fs.reduce((s, f) => s + f.res.stats[0].nova + f.res.stats[1].nova, 0);
  const total = srcs.reduce((s, k) => s + dmg(k), 0) + novaDmg;
  rows.push([
    round, r.data.rules.heroHp[round - 1]!, avg(secs).toFixed(1), `${quantile(secs, 0.1).toFixed(0)}–${quantile(secs, 0.9).toFixed(0)}`,
    share(novaFs.length / fs.length, fs.length), led.length ? pct(led.filter((f) => f.res.winner === f.res.leaderAtNova).length / led.length) : "-",
    ...srcs.map((k) => pct(dmg(k) / total)), pct(novaDmg / total),
    avg(fs.map((f) => (f.res.stats[0].healed + f.res.stats[1].healed) / 2)).toFixed(0), avg(fs.map((f) => (f.res.stats[0].shielded + f.res.stats[1].shielded) / 2)).toFixed(0),
    pct(fs.filter((f) => f.res.winner === -1).length / fs.length),
  ]);
}
r.log(...table(["round", "health", "seconds", "10–90 %", "reaches nova", "leader wins", "weapons", "direct", "burn", "toxin", "spikes", "nova", "healed", "shield", "draws"], rows));
r.log();
r.log("seconds: average fight length. reaches nova: share of fights still running when the Supernova starts. leader wins: of those, how often the hero with more health at that moment wins.");
r.log("weapons … nova: share of all health lost by source. healed / shield: average per hero and fight.");
r.done();
