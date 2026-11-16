/**
 * What is every item worth?
 *   npm run report:items -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--seeds 1,2] [--jobs N] [--out file] [--write-ratings] [--only id,id]
 *
 * Controlled test: take builds the bots really played, give them the item for free (with room for it), and measure how many more fights they win.
 * --write-ratings stores the result in data/sim/ratings.json; the bots then prefer what measured strong. It also stores how it measured
 * (data/sim/ratings-meta.json: seeds, sample sizes, the yardstick per round).
 * --only a,b --write-ratings measures just these items again, with the seeds, sample sizes and yardstick of the stored run, and changes only
 * their ratings. Every item has its own dice, so an item that did not change gets the same rating again: after an item change, re-measure
 * the changed items (and items linked to them) instead of everything, and the other ratings do not move.
 * --seeds 1,2 measures on several seeds and pools them (steadier ratings; use it for a full run).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Build, type ItemDef } from "@backpack-space/core";
import { DATA_DIR, loadRatings } from "@backpack-space/core/node";
import { measureItem, ratedItems, roundOf, type ItemGain } from "../sim/items";
import { useRatings } from "../sim/lobby";
import { jobsFrom, runParallel } from "../sim/parallel";
import { playPanelLobby, type PanelLobby } from "../balance/panel";
import { avg, median, signed, startReport, stderr } from "./common";

const r = startReport({
  id: "items",
  title: "Items",
  question: "How much stronger does a build get from each item, compared with what the item costs? Which items are too strong or too weak, and which do the bots never use?",
  presets: { quick: { builds: 16, lobbies: 8, fights: 6 }, normal: { builds: 50, lobbies: 30, fights: 8 }, precise: { builds: 160, lobbies: 80, fights: 10 } },
  explain: { builds: "builds that receive the item", lobbies: "lobbies that supply builds and opponents", fights: "fights per build, with and without the item" },
});
const data = r.data;
const jobs = jobsFrom(r.flags);
const only = r.flags.only?.split(",").map((s) => s.trim());
for (const id of only ?? []) if (!data.items.has(id)) throw new Error(`--only: no item ${id}`);

/** how the stored ratings were measured */
interface RatingsMeta { seeds: number[]; builds: number; lobbies: number; fights: number; perGold: Record<string, number>; artifactGain: number; written: string;
  /** the ratings the bots had while they played the field (the ratings before this run): an update plays the same field again */
  fieldRatings: Record<string, number> }
const META = join(DATA_DIR, "sim", "ratings-meta.json");
const meta: RatingsMeta | undefined = existsSync(META) ? (JSON.parse(readFileSync(META, "utf8")) as RatingsMeta) : undefined;
/** --only with --write-ratings: measure exactly as the stored run did */
const update = !!(only && r.flags["write-ratings"]);
if (update && !meta) throw new Error("--only with --write-ratings needs a stored full run (data/sim/ratings-meta.json): run npm run ratings once without --only");
const N = update ? { builds: meta!.builds, lobbies: meta!.lobbies, fights: meta!.fights } : r.n;
const seeds = update ? meta!.seeds : (r.flags.seeds ?? `${r.seed}`).split(",").map(Number);
if (update) r.log(`Updating the ratings of ${only!.length} items, measured like the stored run: seeds ${seeds.join(", ")}, builds ${N.builds}, lobbies ${N.lobbies}, fights ${N.fights}.`);
else if (seeds.length > 1) r.log(`Seeds ${seeds.join(", ")} pooled.`);

// an update plays the field with the ratings of the stored run, so that only the changed items differ
const fieldRatings: Record<string, number> = update ? meta!.fieldRatings : r.flags["no-ratings"] ? {} : loadRatings();
const ratingsFile = join("out", `.ratings-${process.pid}.json`);
mkdirSync("out", { recursive: true });
writeFileSync(ratingsFile, JSON.stringify(fieldRatings));
useRatings(fieldRatings);

const items = ratedItems(data).filter((i) => !only || only.includes(i.id));
const ids = items.map((i) => i.id);
const gains = new Map<string, number[]>(ids.map((id) => [id, []]));
const lobbies: PanelLobby[] = [];
mkdirSync("out", { recursive: true });
for (const seed of seeds) {
  // the field: lobbies in which every bot chooses its own path
  const played = await runParallel<PanelLobby>({ kind: "panel", free: true, seed, ratings: true, ratingsFile }, N.lobbies, jobs, (i) => playPanelLobby(data, seed, i, true), (d) => r.progress(`seed ${seed}: lobby ${d}/${N.lobbies}`));
  lobbies.push(...played);
  const byRound: Build[][] = Array.from({ length: data.rules.rounds }, () => []);
  for (const l of played) for (const s of l.seats) s.builds.forEach((b, k) => byRound[k]!.push(b));
  const file = join("out", `.field-${process.pid}-${seed}.json`);
  writeFileSync(file, JSON.stringify(byRound));
  const out = await runParallel<ItemGain>({ kind: "items", seed, ratings: false, field: file, ids, builds: N.builds, fights: N.fights }, ids.length, jobs,
    (i) => measureItem(data, items[i]!, byRound, { builds: N.builds, fights: N.fights }, seed), (d) => r.progress(`seed ${seed}: item ${d}/${ids.length}`));
  rmSync(file, { force: true });
  for (const g of out) gains.get(g.id)!.push(...g.deltas);
}
/** cost in gold; crafted items cost the sum of their inputs; artifacts are free and compared by cells only */
const goldOf = (it: ItemDef) => it.cost;
interface Row { it: ItemDef; delta: number; se: number; n: number; round: number }
rmSync(ratingsFile, { force: true });
const rows: Row[] = items.map((it) => { const d = gains.get(it.id)!; return { it, delta: avg(d), se: stderr(d), n: d.length, round: roundOf(it) }; });

// how often the bots end up with the item
const everOwned = new Map<string, number>();
for (const l of lobbies) for (const s of l.seats) { const seen = new Set(s.builds.flatMap((b) => b.items.map((p) => p.item))); for (const id of seen) everOwned.set(id, (everOwned.get(id) ?? 0) + 1); }
const runsOf = (it: ItemDef) => lobbies.reduce((n, l) => n + l.seats.filter((s) => !it.hero || s.hero === it.hero).length, 0);

// fair value: points of win share per gold, by the round the item is tested in (shop items only set the yardstick)
const perGold = new Map<number, number>(update || (only && meta) ? Object.entries(meta!.perGold).map(([k, v]) => [Number(k), v]) : []);
if (!perGold.size) {
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
}
if (only && meta) r.log("Yardstick (win share per gold by round): from the stored full run.");
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
  r.table(["item", "rarity", "gold", "cells", "round", "gain", "±", "value", "owned", ""], g.map((x) => [
    x.it.name, x.it.crafted ? `craft ${x.it.depth}` : x.it.rarity, goldOf(x.it), x.it.size, x.round, signed(x.delta), x.se.toFixed(1), Number.isNaN(ratio(x)) ? "-" : ratio(x).toFixed(2),
    `${Math.round((100 * (everOwned.get(x.it.id) ?? 0)) / runsOf(x.it))} %`, verdict(x),
  ]), { center: 1, span: 0.75, cols: [7], highIsBad: true });
}
const priced = rows.filter((x) => !Number.isNaN(ratio(x)));
r.log();
r.log(`Summary: ${priced.filter((x) => verdict(x) === "").length} of ${priced.length} priced items within 0.5–1.5; STRONG ${priced.filter((x) => verdict(x) === "STRONG").length}, WEAK ${priced.filter((x) => verdict(x) === "WEAK").length}, unclear ${priced.filter((x) => verdict(x).endsWith("?")).length}.`);
r.log(`Win share per gold by test round: ${[...perGold.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `round ${k}: ${v.toFixed(2)}`).join(", ")}.`);
r.log(`Never owned by a bot: ${rows.filter((x) => !everOwned.get(x.it.id)).map((x) => x.it.name).join(", ") || "none"}.`);
if (r.flags["write-ratings"]) {
  const artifactGain = update ? meta!.artifactGain : median(rows.filter((x) => x.it.rarity === "artifact").map((x) => x.delta));
  const ratings: Record<string, number> = update ? { ...loadRatings() } : {};
  const before = { ...ratings };
  for (const x of rows) {
    const q = Number.isNaN(ratio(x)) ? x.delta / Math.max(1, artifactGain) : ratio(x);
    // shrink towards 1 by the noise, so one lucky sample does not make a favourite
    const noise = x.se / Math.max(0.01, Math.abs(x.delta) + x.se);
    ratings[x.it.id] = Math.round(100 * Math.min(2.5, Math.max(0.3, 1 + (q - 1) * (1 - noise)))) / 100;
  }
  writeFileSync(join(DATA_DIR, "sim", "ratings.json"), JSON.stringify(ratings, null, 1) + "\n");
  r.log();
  if (update) {
    r.log(`Ratings updated in data/sim/ratings.json: ${rows.map((x) => `${x.it.id} ${before[x.it.id] ?? "-"} → ${ratings[x.it.id]}`).join(", ")}. All other ratings unchanged.`);
  } else {
    const m: RatingsMeta = { seeds, builds: N.builds, lobbies: N.lobbies, fights: N.fights, perGold: Object.fromEntries([...perGold].map(([k, v]) => [k, Math.round(1000 * v) / 1000])), artifactGain: Math.round(1000 * artifactGain) / 1000, fieldRatings, written: new Date().toISOString().slice(0, 10) };
    writeFileSync(META, JSON.stringify(m, null, 1) + "\n");
    r.log("Ratings written to data/sim/ratings.json (how they were measured: data/sim/ratings-meta.json).");
  }
}
r.done();
