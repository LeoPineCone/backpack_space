/**
 * How do whole runs go by the real rules (lives, 12 rounds)?
 *   npm run report:runs -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 */
import { playLobby } from "../sim/lobby";
import { avg, pct, startReport, table } from "./common";

const r = startReport({
  title: "Runs",
  question: "How far do runs get with the lives the rules give, how do backpack and gold grow, and does valuing items beat buying at random?",
  presets: { quick: { lobbies: 10 }, normal: { lobbies: 50 }, precise: { lobbies: 200 } },
  explain: { lobbies: "lobbies of 16 bots; a bot leaves when its lives are gone" },
});
const data = r.data, rules = data.rules;
const lobbies = Array.from({ length: r.n.lobbies }, (_, i) => { r.progress(`lobby ${i + 1}/${r.n.lobbies}`); return playLobby(data, r.seed * 7919 + i); });
const seats = lobbies.flatMap((l) => l.seats);
r.log();
r.log(`Rules: ${rules.rounds} rounds, ${rules.lives} lives. ${seats.length} runs.`);
r.log();
r.log("Where runs end:");
const dist = Array.from({ length: rules.rounds }, (_, i) => seats.filter((s) => s.endedAfter === i + 1).length);
r.log(...table(["after round", ...dist.map((_, i) => String(i + 1))], [["share of runs", ...dist.map((n) => pct(n / seats.length))]]));
const full = seats.filter((s) => s.endedAfter === rules.rounds && s.livesLeft > 0);
r.log();
r.log(`Runs that survive all ${rules.rounds} rounds: ${pct(full.length / seats.length)}. Average wins per run: ${avg(seats.map((s) => s.wins)).toFixed(1)}; average rounds played: ${avg(seats.map((s) => s.endedAfter)).toFixed(1)}.`);
r.log();
r.log("By hero:");
r.log(...table(["hero", "wins per run", "rounds played", "survives all rounds"], data.heroList.map((h) => {
  const ss = seats.filter((s) => s.bot.hero === h.id);
  return [h.name, avg(ss.map((s) => s.wins)).toFixed(2), avg(ss.map((s) => s.endedAfter)).toFixed(1), pct(ss.filter((s) => s.endedAfter === rules.rounds && s.livesLeft > 0).length / ss.length)];
})));
r.log();
r.log("Backpack and gold by round (bots still in the run):");
const size = (ids: string[]) => ids.reduce((n, id) => n + data.items.get(id)!.size, 0);
r.log(...table(["round", "bots", "items", "item cells", "bag cells", "crafted items", "bought", "rerolls", "gold left"], Array.from({ length: rules.rounds }, (_, i) => {
  const ss = seats.filter((s) => s.builds[i]);
  return [
    i + 1, ss.length, avg(ss.map((s) => s.builds[i]!.items.length)).toFixed(1), avg(ss.map((s) => size(s.builds[i]!.items.map((p) => p.item)))).toFixed(1),
    avg(ss.map((s) => size(s.builds[i]!.bags.map((p) => p.item)))).toFixed(1), avg(ss.map((s) => s.builds[i]!.items.filter((p) => data.items.get(p.item)!.crafted).length)).toFixed(1),
    avg(ss.map((s) => s.bot.log[i]!.bought.length)).toFixed(1), avg(ss.map((s) => s.bot.log[i]!.rerolls)).toFixed(1), avg(ss.map((s) => s.bot.log[i]!.goldLeft)).toFixed(1),
  ];
})));
r.log();
r.log("Does skill pay? Lobbies where half of the seats play differently (all bots play all rounds), win share of the changed seats:");
const variants: [string, object][] = [["buys at random", { randomBuys: true }], ["never combines", { noCraft: true }], ["random layout", { layout: "random" }]];
const n2 = Math.max(4, Math.round(r.n.lobbies / 3));
r.log(...table(["changed seats", "their win share", "the others"], variants.map(([name, o]) => {
  let w = [0, 0], n = [0, 0];
  for (let i = 0; i < n2; i++) {
    r.progress(`${name} ${i + 1}/${n2}`);
    const l = playLobby(data, r.seed * 104729 + i, { immortal: true, bot: (seat) => (seat % 8 < 4 ? o : {}) });
    for (const f of l.fights) { const k = f.a % 8 < 4 ? 0 : 1; if ((f.b % 8 < 4 ? 0 : 1) === k) continue; n[k]!++; if (f.res.winner === 0) w[k]!++; }
  }
  return [name, pct(w[0]! / n[0]!), pct(w[1]! / n[1]!)];
})));
r.done();
