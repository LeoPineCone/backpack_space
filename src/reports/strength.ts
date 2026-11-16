/**
 * Which items are outliers? Three views side by side.
 *   npm run report:strength -- [--quick | --precise] [--name main] [--out file]
 *
 *   add one      a typical build gets the item for free: the rating in data/sim/ratings.json (1.0 = worth its price)
 *   remove one   builds of the baseline that own the item fight again without it (what it is worth where it is used)
 *   regression   logistic model over all baseline fights (which items go with winning, hero and stage held equal)
 * Remove-one and regression are compared within the item's class (rarity, crafted tier, kind of artifact): z = how
 * far from the class median, in robust standard deviations. An item is an outlier when two of the three views agree.
 * Needs a baseline (npm run baseline); no bot shops in this report.
 */
import type { ItemDef } from "@backpack-space/core";
import { loadRatings } from "@backpack-space/core/node";
import { Bench } from "../balance/bench";
import { correlation, fightModel, removeOne, robustZ } from "../balance/strength";
import { signed, startReport } from "./common";

const r = startReport({
  id: "strength",
  title: "Item strength in three views",
  question: "Which items are too strong or too weak, judged by three independent measurements?",
  presets: { quick: { fights: 60 }, normal: { fights: 200 }, precise: { fights: 600 } },
  explain: { fights: "fights per item for the remove-one view (at most)" },
});
const name = r.flags.name ?? "main";
const bench = new Bench(name);
const data = bench.data;
r.log(`Baseline "${name}": ${bench.meta.lobbies} lobbies per seed, seeds ${bench.meta.seeds.join(", ")}.${bench.fresh ? "" : " STALE: data/ or the ratings changed since; take a new one (npm run baseline)."}`);
const ratings = loadRatings();
const removed = removeOne(bench.panels, data, r.n.fights, (d, n) => r.progress(`remove one: lobby ${d}/${n}`));
r.progress("regression");
const models = bench.panels.map((p) => fightModel(p, data));

// owned: share of the bots that can have the item and hold it at some point
const owners = new Map<string, number>(), bots = new Map<string, number>();
for (const p of bench.panels) for (const l of p.lobbies) for (const s of l.seats) {
  bots.set(s.hero, (bots.get(s.hero) ?? 0) + 1); bots.set("", (bots.get("") ?? 0) + 1);
  for (const id of new Set(s.builds.flatMap((b) => b.items.map((x) => x.item)))) owners.set(id, (owners.get(id) ?? 0) + 1);
}
const owned = (it: ItemDef) => (owners.get(it.id) ?? 0) / Math.max(1, bots.get(it.hero ?? "") ?? 0);

const starts = new Set(data.heroList.flatMap((h) => h.start.map((p) => p.item)));
/** items are compared with their like: start items, free picks, crafted tier, rarity; hero items apart from general ones */
const classOf = (it: ItemDef) => (starts.has(it.id) ? "start item" : it.rarity === "artifact" ? (it.hero ? "hero item (free pick)" : "general artifact (free pick)") : `${it.hero ? "hero " : ""}${it.crafted ? `crafted, step ${it.depth}` : it.rarity}`);
const MIN_FIGHTS = 30, MIN_OWNED = 0.02;
interface Line { it: ItemDef; add: number | undefined; rem: number; remSe: number; n: number; reg: number; zRem: number; zReg: number; enough: boolean }
const lines: Line[] = data.itemList.filter((i) => !i.isBag).map((it) => {
  const x = removed.get(it.id);
  const reg = models.reduce((s, m) => s + (m.get(it.id) ?? 0), 0) / models.length;
  return { it, add: ratings[it.id], rem: x?.drop ?? NaN, remSe: x?.se ?? NaN, n: x?.n ?? 0, reg, zRem: 0, zReg: 0, enough: (x?.n ?? 0) >= MIN_FIGHTS && owned(it) >= MIN_OWNED };
});
for (const c of new Set(lines.map((l) => classOf(l.it)))) {
  const g = lines.filter((l) => classOf(l.it) === c && l.enough);
  const zr = robustZ(g.map((l) => l.rem)), zg = robustZ(g.map((l) => l.reg));
  g.forEach((l, i) => { l.zRem = zr[i]!; l.zReg = zg[i]!; });
}
const Z = 2;
const verdict = (l: Line): string => {
  const hi = [l.add !== undefined && l.add > 1.5, l.enough && l.zRem > Z, l.enough && l.zReg > Z].filter(Boolean).length;
  const lo = [l.add !== undefined && l.add < 0.5, l.enough && l.zRem < -Z, l.enough && l.zReg < -Z].filter(Boolean).length;
  if (hi >= 2) return "STRONG";
  if (lo >= 2) return "WEAK";
  if (!l.enough) return owned(l.it) < MIN_OWNED ? "rarely owned" : "";
  if (l.add !== undefined && l.add < 0.8 && l.zRem > 1 && l.zReg > 0) return "needs its build";
  if (hi === 1) return "strong?";
  if (lo === 1) return "weak?";
  return "";
};

r.log();
r.log("add one: rating (1.0 = worth its price; above 1.5 strong, below 0.5 weak). remove one / regression: points of win share, and z = distance to the median of the item's class (beyond ±2: unusual).");
r.log(`owned: share of the bots that can have the item and hold it at some point. Items in fewer than ${MIN_FIGHTS} sampled fights or with under ${100 * MIN_OWNED} % owners are listed but not judged by the last two views.`);
const groups: [string, (i: ItemDef) => boolean][] = [
  ["General shop items", (i) => i.inShop && !i.hero], ...data.heroList.map((h): [string, (i: ItemDef) => boolean] => [`${h.name}: shop and start items`, (i) => i.hero === h.id && !i.crafted && i.rarity !== "artifact"]),
  ["Crafted items", (i) => i.crafted], ["Free picks (hero items and general artifacts)", (i) => i.rarity === "artifact"],
];
const order: Record<string, number> = { STRONG: 0, WEAK: 1, "strong?": 2, "weak?": 3, "needs its build": 4, "": 5, "rarely owned": 6 };
for (const [title, f] of groups) {
  const g = lines.filter((l) => f(l.it)).sort((a, b) => order[verdict(a)]! - order[verdict(b)]! || b.zRem + b.zReg - a.zRem - a.zReg);
  if (!g.length) continue;
  r.log();
  r.log(`## ${title}`);
  r.table(["item", "class", "gold", "owned", "add one", "remove one", "z", "regression", "z", ""], g.map((l) => [
    l.it.name, classOf(l.it), l.it.cost, `${Math.round(100 * owned(l.it))} %`, l.add === undefined ? "-" : l.add.toFixed(2),
    l.n ? `${signed(100 * l.rem)} ±${(100 * l.remSe).toFixed(1)}` : "-", l.enough ? signed(l.zRem) : "", signed(100 * l.reg), l.enough ? signed(l.zReg) : "", verdict(l),
  ]), { center: 0, span: 3, cols: [6, 8] });
}
const judged = lines.filter((l) => l.enough);
const strong = lines.filter((l) => verdict(l) === "STRONG"), weak = lines.filter((l) => verdict(l) === "WEAK");
r.log();
r.log(`## Summary`);
r.log(`STRONG (two views agree): ${strong.map((l) => l.it.name).join(", ") || "none"}.`);
r.log(`WEAK (two views agree): ${weak.map((l) => l.it.name).join(", ") || "none"}.`);
r.log(`Needs its build (weak as a free extra, strong where it is used): ${lines.filter((l) => verdict(l) === "needs its build").map((l) => l.it.name).join(", ") || "none"}.`);
const avoided = lines.filter((l) => owned(l.it) < MIN_OWNED && l.add !== undefined && l.add < 0.6 && (l.it.inShop || l.it.rarity === "artifact"));
r.log(`Rarely owned (under ${100 * MIN_OWNED} % of the bots that could): ${lines.filter((l) => owned(l.it) < MIN_OWNED).length} items. Of these, weak as a free extra too (rating under 0.6), so the bots avoid them for a reason: ${avoided.map((l) => l.it.name).join(", ") || "none"}.`);
const withAdd = judged.filter((l) => l.add !== undefined);
r.log(`How much the views agree (correlation over ${judged.length} judged items): remove one / regression ${correlation(judged.map((l) => l.zRem), judged.map((l) => l.zReg)).toFixed(2)}, add one / remove one ${correlation(withAdd.map((l) => l.add!), withAdd.map((l) => l.zRem)).toFixed(2)}, add one / regression ${correlation(withAdd.map((l) => l.add!), withAdd.map((l) => l.zReg)).toFixed(2)}.`);
if (models.length > 1) r.log(`Regression on seed ${bench.panels[0]!.seed} against seed ${bench.panels[1]!.seed}: correlation ${correlation(judged.map((l) => models[0]!.get(l.it.id)!), judged.map((l) => models[1]!.get(l.it.id)!)).toFixed(2)} (how repeatable that view is).`);
r.log("Reading: the three views fail in different ways. Add one misses items that need a committed build; remove one says nothing about items no bot uses; the regression only sees what goes together with winning. Trust a verdict that two share, and look at the item before changing it.");
r.done();
