/**
 * What is every item worth?
 *   npm run report:items -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file] [--write-ratings] [--only id,id]
 *
 * Controlled test: take builds the bots really played, give them the item for free (with room for it), and measure how many more fights they win.
 * --write-ratings stores the result in data/sim/ratings.json; the bots then prefer what measured strong.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { arrange, compile, simulate, type Build, type GameData, type ItemDef, type Placement, Rng } from "@backpack-space/core";
import { DATA_DIR } from "@backpack-space/core/node";
import { makeField } from "../sim/lobby";
import { avg, median, signed, startReport, stderr, table } from "./common";

const r = startReport({
  title: "Items",
  question: "How much stronger does a build get from each item, compared with what the item costs? Which items are too strong or too weak, and which do the bots never use?",
  presets: { quick: { builds: 16, lobbies: 8, fights: 6 }, normal: { builds: 50, lobbies: 30, fights: 8 }, precise: { builds: 160, lobbies: 80, fights: 10 } },
  explain: { builds: "builds that receive the item", lobbies: "lobbies that supply builds and opponents", fights: "fights per build, with and without the item" },
});
const data = r.data;
const { byRound, lobbies } = makeField(data, r.n.lobbies, r.seed, {}, (i) => r.progress(`lobby ${i + 1}/${r.n.lobbies}`));

/** round in which the item is typically new */
const roundOf = (it: ItemDef): number =>
  it.rarity === "artifact" ? (it.hero ? 5 : 9) : it.crafted ? [0, 5, 8, 11][it.depth]! : { common: 3, rare: 5, epic: 7, legendary: 9 }[it.rarity as "common"]!;
/** cost in gold; crafted items cost the sum of their inputs; artifacts are free and compared by cells only */
const goldOf = (it: ItemDef) => it.cost;

/** every free grid cell gets a plain pouch, so the extra item never has to push something out */
function withRoom(d: GameData, b: Build): Placement[] {
  const { w, h } = d.rules.grid;
  const used = new Set<number>();
  for (const p of b.bags) for (const [cx, cy] of d.shape(p.item, p.rot).cells) used.add((p.y + cy) * w + p.x + cx);
  const pouch = d.itemList.find((i) => i.isBag && i.size === 1 && i.effects.length === 0)!;
  const bags = [...b.bags];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!used.has(y * w + x)) bags.push({ item: pouch.id, x, y, rot: 0 });
  return bags;
}

const only = r.flags.only?.split(",");
const items = data.itemList.filter((i) => !i.isBag && (!only || only.includes(i.id)));
interface Row { it: ItemDef; delta: number; se: number; n: number; round: number }
const rows: Row[] = [];
items.forEach((it, k) => {
  r.progress(`item ${k + 1}/${items.length} ${it.id}`);
  const round = roundOf(it);
  const pool = byRound[round - 1]!.filter((b) => !it.hero || b.hero === it.hero);
  const deltas: number[] = [];
  for (let s = 0; s < r.n.builds; s++) {
    const base = pool[r.rng.int(pool.length)]!;
    const bags = withRoom(data, base);
    const seed = r.rng.int(2 ** 31);
    const a0 = arrange(data, bags, base.items.map((p) => p.item), new Rng(seed), { moves: 120 });
    const a1 = arrange(data, bags, [...base.items.map((p) => p.item), it.id], new Rng(seed), { moves: 120 });
    if (a1.left.length || a0.left.length) continue;
    const c0 = compile({ ...base, bags, items: a0.items }, data), c1 = compile({ ...base, bags, items: a1.items }, data);
    let w0 = 0, w1 = 0;
    for (let f = 0; f < r.n.fights; f++) {
      const opp = compile(byRound[round - 1]![r.rng.int(byRound[round - 1]!.length)]!, data), fs = r.rng.int(2 ** 31);
      const x0 = simulate(c0, opp, data.rules, fs).winner, x1 = simulate(c1, opp, data.rules, fs).winner;
      w0 += x0 === 0 ? 1 : x0 === -1 ? 0.5 : 0; w1 += x1 === 0 ? 1 : x1 === -1 ? 0.5 : 0;
    }
    deltas.push((100 * (w1 - w0)) / r.n.fights);
  }
  rows.push({ it, delta: avg(deltas), se: stderr(deltas), n: deltas.length, round });
});

// how often the bots end up with the item
const finals = lobbies.flatMap((l) => l.seats.map((s) => s.builds[data.rules.rounds - 1]!)).filter(Boolean);
const everOwned = new Map<string, number>();
for (const l of lobbies) for (const s of l.seats) { const seen = new Set(s.builds.flatMap((b) => b.items.map((p) => p.item))); for (const id of seen) everOwned.set(id, (everOwned.get(id) ?? 0) + 1); }
const runsOf = (it: ItemDef) => lobbies.reduce((n, l) => n + l.seats.filter((s) => !it.hero || s.bot.hero === it.hero).length, 0);

// fair value: points of win share per gold, by the round the item is tested in (shop items only set the yardstick)
const perGold = new Map<number, number>();
const known: [number, number][] = [];
for (const round of [...new Set(rows.map((x) => x.round))].sort((a, b) => a - b)) {
  const base = rows.filter((x) => x.round === round && x.it.inShop && goldOf(x.it) > 0);
  if (base.length >= 4) known.push([round, median(base.map((x) => x.delta / goldOf(x.it)))]);
}
for (const round of new Set(rows.map((x) => x.round))) {
  // rounds without shop items of their own (crafted tiers): interpolate between the neighbouring yardsticks
  const exact = known.find((k) => k[0] === round), lo = [...known].reverse().find((k) => k[0] < round), hi = known.find((k) => k[0] > round);
  const v = exact ? exact[1] : lo && hi ? lo[1] + ((hi[1] - lo[1]) * (round - lo[0])) / (hi[0] - lo[0]) : lo && known.length >= 2 ? Math.max(0.2 * lo[1], lo[1] + ((lo[1] - known[known.length - 2]![1]) * (round - lo[0])) / (lo[0] - known[known.length - 2]![0])) : (lo ?? hi ?? [0, median(rows.filter((x) => goldOf(x.it) > 0).map((x) => x.delta / goldOf(x.it)))])[1];
  perGold.set(round, v);
}
const ratio = (x: Row) => (goldOf(x.it) > 0 && perGold.get(x.round)! > 0 ? x.delta / (perGold.get(x.round)! * goldOf(x.it)) : NaN);
const verdict = (x: Row) => {
  const q = ratio(x);
  if (Number.isNaN(q)) return "";
  const lo = (x.delta - 2 * x.se) / (perGold.get(x.round)! * goldOf(x.it)), hi = (x.delta + 2 * x.se) / (perGold.get(x.round)! * goldOf(x.it));
  return lo > 1.5 ? "STRONG" : hi < 0.5 ? "WEAK" : q > 1.5 ? "strong?" : q < 0.5 ? "weak?" : "";
};

r.log();
r.log("gain: points of win share a build gains when it gets the item for free, tested on builds of the round where the item is typically new (±: one standard error).");
r.log("value: gain compared with what shop items of that round give per gold (1.0 = worth its price; crafted items are priced at the sum of their inputs). STRONG/WEAK: outside 0.5–1.5 even after noise; with '?': may be noise.");
r.log("owned: share of bot runs that ever held the item (hero items: runs of that hero).");
const groups: [string, (i: ItemDef) => boolean][] = [
  ["General shop items", (i) => i.inShop && !i.hero], ...data.heroList.map((h): [string, (i: ItemDef) => boolean] => [`${h.name}: shop and start items`, (i) => i.hero === h.id && !i.crafted && i.rarity !== "artifact"]),
  ["Crafted items", (i) => i.crafted], ["Artifacts (free picks)", (i) => i.rarity === "artifact"],
];
for (const [name, f] of groups) {
  const g = rows.filter((x) => f(x.it)).sort((a, b) => (Number.isNaN(ratio(b)) ? b.delta - a.delta : ratio(b) - ratio(a)));
  if (!g.length) continue;
  r.log();
  r.log(`## ${name}`);
  r.log(...table(["item", "rarity", "gold", "cells", "round", "gain", "±", "value", "owned", ""], g.map((x) => [
    x.it.name, x.it.crafted ? `craft ${x.it.depth}` : x.it.rarity, goldOf(x.it), x.it.size, x.round, signed(x.delta), x.se.toFixed(1), Number.isNaN(ratio(x)) ? "-" : ratio(x).toFixed(2),
    `${Math.round((100 * (everOwned.get(x.it.id) ?? 0)) / runsOf(x.it))} %`, verdict(x),
  ])));
}
const priced = rows.filter((x) => !Number.isNaN(ratio(x)));
r.log();
r.log(`Summary: ${priced.filter((x) => verdict(x) === "").length} of ${priced.length} priced items within 0.5–1.5; STRONG ${priced.filter((x) => verdict(x) === "STRONG").length}, WEAK ${priced.filter((x) => verdict(x) === "WEAK").length}, unclear ${priced.filter((x) => verdict(x).endsWith("?")).length}.`);
r.log(`Win share per gold by test round: ${[...perGold.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `round ${k}: ${v.toFixed(2)}`).join(", ")}.`);
r.log(`Never owned by a bot: ${rows.filter((x) => !everOwned.get(x.it.id)).map((x) => x.it.name).join(", ") || "none"}.`);
void finals;
if (r.flags["write-ratings"]) {
  const ratings: Record<string, number> = {};
  const artifactGain = median(rows.filter((x) => x.it.rarity === "artifact").map((x) => x.delta));
  for (const x of rows) {
    const q = Number.isNaN(ratio(x)) ? x.delta / Math.max(1, artifactGain) : ratio(x);
    // shrink towards 1 by the noise, so one lucky sample does not make a favourite
    const noise = x.se / Math.max(0.01, Math.abs(x.delta) + x.se);
    ratings[x.it.id] = Math.round(100 * Math.min(2.5, Math.max(0.3, 1 + (q - 1) * (1 - noise)))) / 100;
  }
  writeFileSync(join(DATA_DIR, "sim", "ratings.json"), JSON.stringify(ratings, null, 1) + "\n");
  r.log();
  r.log("Ratings written to data/sim/ratings.json.");
}
r.done();
