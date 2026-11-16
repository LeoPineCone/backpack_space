/**
 * Are the free picks fair?
 *   npm run report:picks -- [--accuracy quick|normal|precise] [--seed S] [--jobs N] [--careful] [--out file]
 *
 * After round 4 a bot is shown two of its hero's three hero items, after round 8 three of the general artifacts.
 * This report takes real bots at that moment and plays the rest of the run once with every item of the pool
 * (and once with nothing), with the same shop rolls, the same opponents and the same fight dice. So it can say:
 *   - gain: how many more fights the rest of the run wins with the item than without a pick, per hero;
 *   - choice test: for every offer the rules can show, which option wins the most and which the least.
 * Because every option of the pool is played on the same moment, every possible offer is scored exactly
 * (round 8: all 120 offers of 3 out of 10), without extra fights.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Build } from "@backpack-space/core";
import { seedOf } from "../sim/items";
import { currentRatings } from "../sim/lobby";
import { jobsFrom, runParallel } from "../sim/parallel";
import { playPickLobby, scoreMoment, type Moment, type PickLobby, type Scored } from "../sim/picks";
import { avg, loadTargets, markOf, median, pct, signed, startReport, stderr, type Target } from "./common";
import type { Mark } from "./html";

const r = startReport({
  id: "picks",
  title: "Free picks",
  question: "Is any free pick (hero item after round 4, general artifact after round 8) so strong that it is always taken, or so weak that it is never worth it?",
  presets: { quick: { lobbies: 6, moments: 6, fights: 4 }, normal: { lobbies: 20, moments: 24, fights: 6 }, precise: { lobbies: 50, moments: 70, fights: 8 } },
  explain: { lobbies: "lobbies that supply the moments and the opponents", moments: "pick moments per hero for the general artifacts (hero items: three times as many, they have fewer options to play)", fights: "fights per remaining round and option" },
});
const data = r.data;
const jobs = jobsFrom(r.flags), careful = !!r.flags.careful;
if (careful) r.log("Careful placement: every bot searches its layout much longer after the pick (all options and the run without a pick alike). Compare with the normal run: an item that gains a lot here is laid out badly by the normal bots, not weak.");

// ---- collect pick moments from real lobbies
mkdirSync("out", { recursive: true });
const ratingsFile = join("out", `.ratings-${process.pid}.json`), fieldFile = join("out", `.field-${process.pid}.json`), momentsFile = join("out", `.moments-${process.pid}.json`);
writeFileSync(ratingsFile, JSON.stringify(currentRatings()));
const played = await runParallel<PickLobby>({ kind: "pickLobby", seed: r.seed, ratings: true, ratingsFile }, r.n.lobbies, jobs, (i) => playPickLobby(data, r.seed, i), (d) => r.progress(`lobby ${d}/${r.n.lobbies}`));
const byRound: Build[][] = Array.from({ length: data.rules.rounds }, () => []);
for (const l of played) for (const seat of l.builds) seat.forEach((b, k) => byRound[k]!.push(b));
const moments: Moment[] = played.flatMap((l) => l.moments);

/** how many the rules show */
const specials = data.rules.specials;
const showOf = (after: number) => specials.find((s) => s.afterRound === after)!.show;

/** all k-subsets of xs */
const subsets = <T,>(xs: readonly T[], k: number): T[][] => k === 0 ? [[]] : xs.flatMap((x, i) => subsets(xs.slice(i + 1), k - 1).map((s) => [x, ...s]));

// ---- score every moment: every option of its pool plus "nothing"
const chosen: { m: Moment; seed: number }[] = [];
for (const sp of specials) {
  for (const h of data.heroList) {
    const ms = moments.filter((m) => m.after === sp.afterRound && m.hero === h.id);
    const take = Math.min(sp.pool === "hero" ? 3 * r.n.moments : r.n.moments, ms.length);
    for (let k = 0; k < take; k++) chosen.push({ m: ms[Math.floor((k * ms.length) / take)]!, seed: seedOf(r.seed, `${sp.afterRound}/${h.id}/${k}`) % 2 ** 30 });
  }
}
writeFileSync(fieldFile, JSON.stringify(byRound));
writeFileSync(momentsFile, JSON.stringify(chosen));
const scored = await runParallel<Scored>({ kind: "picks", seed: r.seed, ratings: true, ratingsFile, field: fieldFile, moments: momentsFile, fights: r.n.fights, careful }, chosen.length, jobs,
  (i) => scoreMoment(data, byRound, chosen[i]!.m, chosen[i]!.seed, r.n.fights, careful), (d) => r.progress(`pick moment ${d}/${chosen.length}`));
for (const f of [ratingsFile, fieldFile, momentsFile]) rmSync(f, { force: true });

// ---- tables
const T = loadTargets();
const name = (id: string) => data.items.get(id)!.name;
const short = (h: string) => data.heroes.get(h)!.name.split(" ")[0]!.replace(/"/g, "");
for (const after of specials.map((s) => s.afterRound)) {
  const hero = specials.find((s) => s.afterRound === after)!.pool === "hero";
  const tGain = T[hero ? "pickHeroGain" : "pickGain"]!, tBest = T[hero ? "pickHeroBest" : "pickBest"]!, tWorst = T[hero ? "pickHeroWorst" : "pickWorst"]!;
  const tFloor = T.pickFloor!, tEmpty = T.pickEmpty!;
  const rows = scored.filter((s) => s.after === after);
  if (!rows.length) continue;
  const show = showOf(after);
  r.log();
  r.log(`## ${hero ? `Hero items after round ${after}` : `General artifacts after round ${after}`} (${show} shown${hero ? " of the hero's three" : ` of ${data.generalArtifacts.length}`})`);

  // gain per item and per hero, best/worst in its offers
  const ids = [...new Set(rows.flatMap((s) => Object.keys(s.score)))];
  const gainOf = (id: string, h?: string) => rows.filter((s) => s.score[id] !== undefined && (!h || s.hero === h)).map((s) => s.score[id]! - s.none);
  const best: Record<string, number> = {}, worst: Record<string, number> = {}, seen: Record<string, number> = {};
  const empty: Record<string, { n: number; empty: number }> = {};
  const med = median(ids.map((id) => avg(gainOf(id))));
  for (const s of rows) {
    const opts = Object.keys(s.score);
    for (const offer of subsets(opts, Math.min(show, opts.length))) {
      const vals = offer.map((id) => s.score[id]!);
      const hi = Math.max(...vals), lo = Math.min(...vals);
      const tops = offer.filter((id) => s.score[id] === hi), lows = offer.filter((id) => s.score[id] === lo);
      for (const id of offer) seen[id] = (seen[id] ?? 0) + 1;
      if (hi !== lo) { for (const id of tops) best[id] = (best[id] ?? 0) + 1 / tops.length; for (const id of lows) worst[id] = (worst[id] ?? 0) + 1 / lows.length; }
      else for (const id of offer) { best[id] = (best[id] ?? 0) + 1 / offer.length; worst[id] = (worst[id] ?? 0) + 1 / offer.length; }
      const e = (empty[s.hero] ??= { n: 0, empty: 0 });
      e.n++;
      if (!hero && offer.every((id) => s.score[id]! - s.none < tFloor.min! * med)) e.empty++;
    }
  }
  const table: (string | number)[][] = [], marks: Mark[][] = [];
  const order = [...ids].sort((a, b) => avg(gainOf(b)) - avg(gainOf(a)));
  const gains: number[] = [], bests: number[] = [], worsts: number[] = [], floors: number[] = [];
  for (const id of order) {
    const g = gainOf(id), q = avg(g) / (med || 1);
    const b = (best[id] ?? 0) / Math.max(1, seen[id] ?? 0), w = (worst[id] ?? 0) / Math.max(1, seen[id] ?? 0);
    const per = hero ? [] : data.heroList.map((h) => avg(gainOf(id, h.id)));
    gains.push(q); bests.push(b); worsts.push(w); if (!hero) floors.push(Math.min(...per) / (med || 1));
    table.push([name(id), `${signed(100 * avg(g))} ±${(200 * stderr(g)).toFixed(0)}`, q.toFixed(2), pct(b), pct(w), ...(hero ? [short(data.items.get(id)!.hero!)] : per.map((x) => signed(100 * x)))]);
    marks.push(["", "", markOf(tGain, q), markOf(tBest, b), markOf(tWorst, w), ...(hero ? [] : per.map((x) => markOf(tFloor, x / (med || 1))))]);
  }
  const range = (t: Target) => `${t.min !== undefined ? `≥ ${t.min}` : ""}${t.min !== undefined && t.max !== undefined ? ", " : ""}${t.max !== undefined ? `≤ ${t.max}` : ""}`;
  const fair = (1 / show);
  r.table(["item", "gain (pts, rest of run)", `× median [${range(tGain)}]`, `best in its offer [≤ ${pct(tBest.max!)}; fair ${pct(fair)}]`, `worst in its offer [≤ ${pct(tWorst.max!)}]`, ...(hero ? ["hero"] : data.heroList.map((h) => `gain ${short(h.id)} [≥ ${tFloor.min} × median]`))], table, undefined, marks);
  r.chart({ type: "bar", title: `Gain of every ${hero ? "hero item" : "general artifact"} (points of win share, rest of the run)`, x: order.map(name), unit: "", series: [{ name: "gain", values: order.map((id) => 100 * avg(gainOf(id))) }] });
  r.target({ ...tGain, what: `after round ${after}: ${tGain.what}` }, gains, false);
  r.target({ ...tBest, what: `after round ${after}: ${tBest.what}` }, bests, true);
  r.target({ ...tWorst, what: `after round ${after}: ${tWorst.what}` }, worsts, true);
  if (!hero) {
    r.target({ ...tFloor, what: `after round ${after}: ${tFloor.what}` }, floors, false);
    const emptyShares = data.heroList.map((h) => (empty[h.id] ? empty[h.id]!.empty / Math.max(1, empty[h.id]!.n) : 0));
    r.log(`Offers with no good option (every option below ${tFloor.min} × median): ${data.heroList.map((h, k) => `${short(h.id)} ${pct(emptyShares[k]!)}`).join(", ")}`);
    r.target({ ...tEmpty, what: `after round ${after}: ${tEmpty.what}` }, emptyShares, true);
  }
  for (const id of order) r.value(`${after}:${id}`, [avg(gainOf(id)), (best[id] ?? 0) / Math.max(1, seen[id] ?? 0)]);
  r.log(`Moments: ${rows.length} (${data.heroList.map((h) => `${short(h.id)} ${rows.filter((s) => s.hero === h.id).length}`).join(", ")}). Median gain ${signed(100 * med)} pts.`);
}
r.log();
r.log("Reading: \"gain\" = how many more of the remaining fights (to round 12) the bot wins with the item than with no pick at all, in points of win share; ± = two standard errors.");
r.log("\"× median\" compares the gain with the median item of the same pick. \"best / worst in its offer\" = over every offer the rules can show that contains the item, how often it was the option that won the most / the least of the rest of the run (ties shared).");
r.log("All options of one moment play the same shop rolls, opponents and fight dice, so their difference is the item; the bots shop on after the pick as usual (stale ratings: run npm run ratings first).");
r.done();
