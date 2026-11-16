/**
 * Does every hero have more than one way to win?
 *   npm run report:paths -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 *
 * Every hero lists its designed paths in data/heroes.json. In this report every bot commits to one path of its hero
 * (or to none: "open") and plays whole runs in mixed lobbies. A path carries if its bots win about as often as the
 * hero's best path and if they really play it (path items in the final build). The targets (data/sim/targets.json,
 * path*) stand in the column heads; every checked cell is marked ✓ / ✗ and every hero gets its target lights.
 */
import { onPath, type GameData, type SideStats } from "@backpack-space/core";
import { makeField, type Lobby, type Seat } from "../sim/lobby";
import { avg, loadTargets, markOf, pct, pts, startReport, stderr, targetRange, type Target } from "./common";
import type { Mark } from "./html";

const r = startReport({
  id: "paths",
  title: "Ways to win",
  question: "Does every hero have several paths that win, or does one strategy carry it?",
  presets: { quick: { lobbies: 12 }, normal: { lobbies: 60 }, precise: { lobbies: 240 } },
  explain: { lobbies: "lobbies of 16 bots (4 per hero, one per path plus one open bot) playing all 12 rounds" },
});
const data: GameData = r.data;
const pathOf = (seat: number): string => {
  const h = data.heroList[seat % data.heroList.length]!;
  const k = Math.floor(seat / data.heroList.length);
  return h.paths[k]?.id ?? "";
};
const { lobbies } = makeField(data, r.n.lobbies, r.seed, { path: pathOf }, (i) => r.progress(`lobby ${i + 1}/${r.n.lobbies}`));

const SOURCES = ["weapon", "direct", "burn", "toxin", "spikes"] as const;
interface Group { seats: Seat[]; w: number; n: number; lw: number; ln: number; per: Map<Seat, [number, number, number, number]>; dmg: Record<(typeof SOURCES)[number], number>; kept: number; fights: number; secs: number; commit: number[]; }
const groups = new Map<string, Group>();
const key = (s: Seat) => `${s.bot.hero}/${s.bot.path}`;
const group = (k: string) => { let g = groups.get(k); if (!g) { g = { seats: [], w: 0, n: 0, lw: 0, ln: 0, per: new Map(), dmg: { weapon: 0, direct: 0, burn: 0, toxin: 0, spikes: 0 }, kept: 0, fights: 0, secs: 0, commit: [] }; groups.set(k, g); } return g; };
const late = Math.ceil((data.rules.rounds * 2) / 3) + 1;
const add = (l: Lobby) => {
  for (const s of l.seats) {
    const g = group(key(s));
    g.seats.push(s);
    const path = data.heroes.get(s.bot.hero)!.paths.find((p) => p.id === s.bot.path);
    const last = s.builds[s.builds.length - 1]!;
    const cost = (id: string) => Math.max(1, data.items.get(id)!.cost);
    const all = last.items.reduce((x, p) => x + cost(p.item), 0);
    if (path) g.commit.push(last.items.filter((p) => onPath(data.items.get(p.item)!, path.focus)).reduce((x, p) => x + cost(p.item), 0) / Math.max(1, all));
  }
  for (const f of l.fights) {
    const a = l.seats[f.a]!, b = l.seats[f.b]!;
    if (a.bot.hero === b.bot.hero) continue;
    const g = group(key(a));
    const ps = g.per.get(a) ?? [0, 0, 0, 0]; g.per.set(a, ps);
    g.n++; ps[1]++; if (f.res.winner === 0) { g.w++; ps[0]++; }
    if (f.round < late) continue;
    g.ln++; ps[3]++; if (f.res.winner === 0) { g.lw++; ps[2]++; }
    const st: SideStats = f.res.stats[0];
    for (const k of SOURCES) g.dmg[k] += st[k];
    g.kept += (st.healed + st.shielded) / f.res.maxHp[0];
    g.fights++; g.secs += f.res.seconds;
  }
};
lobbies.forEach(add);

/** "54 % ±3": the ± is one standard error over the bots (every bot's run is one sample, its fights are not independent) */
const bySeat = (gs: Group[], lateOnly: boolean): string => {
  const xs: number[] = [];
  let w = 0, n = 0;
  for (const g of gs) for (const v of g.per.values()) { const [a, b] = lateOnly ? [v[2], v[3]] : [v[0], v[1]]; if (!b) continue; xs.push(a / b); w += a; n += b; }
  const p = w / Math.max(1, n);
  return `${pct(p)} ±${xs.length > 1 ? Math.max(1, Math.round(100 * stderr(xs))) : "-"}`;
};
const T = loadTargets();
const tHero = T.pathHeroWinShare!, tPath = T.pathWinShare!, tLate = T.pathLateWinShare!, tOpen = T.pathOverOpen!, tSpread = T.pathSpread!;
const hd = (label: string, t: Target, unit: "%" | "pts" = "%") => `${label} [target ${targetRange(t, unit)}]`;

const verdicts: string[] = [];
const bars: { name: string; p: number }[] = [];
for (const h of data.heroList) {
  r.log();
  r.log(`## ${h.name} – ${h.focus}`);
  const rows: (string | number)[][] = [];
  const marks: Mark[][] = [];
  const shares: { name: string; p: number; late: number; overOpen: number }[] = [];
  const open = groups.get(`${h.id}/`);
  const openP = open ? open.w / Math.max(1, open.n) : NaN;
  const mine = [...groups.entries()].filter(([k]) => k.startsWith(`${h.id}/`)).map(([, g]) => g);
  const heroW = mine.reduce((x, g) => x + g.w, 0), heroN = mine.reduce((x, g) => x + g.n, 0);
  const heroP = heroW / Math.max(1, heroN);
  for (const p of [...h.paths, { id: "", name: "(open, no path)", focus: [] as string[] }]) {
    const g = groups.get(`${h.id}/${p.id}`);
    if (!g) continue;
    const total = SOURCES.reduce((x, k) => x + g.dmg[k], 0) || 1;
    const mix = SOURCES.filter((k) => g.dmg[k] / total >= 0.1).sort((x, y) => g.dmg[y] - g.dmg[x]).map((k) => `${k} ${pct(g.dmg[k] / total)}`).join(", ");
    const pw = g.w / g.n, pl = g.lw / Math.max(1, g.ln), over = pw - openP;
    if (p.id) shares.push({ name: p.name, p: pw, late: pl, overOpen: over });
    bars.push({ name: `${h.name.split(" ")[0]}: ${p.id ? p.name : "open"}`, p: 100 * pw });
    rows.push([
      p.name, bySeat([g], false), bySeat([g], true), p.id ? pts(over) : "-",
      avg(g.seats.map((s) => s.wins)).toFixed(1), pct(g.seats.filter((s) => s.livesLeft > 0).length / g.seats.length),
      p.id ? pct(avg(g.commit)) : "-", mix, pct(g.kept / Math.max(1, g.fights)), (g.secs / Math.max(1, g.fights)).toFixed(0) + " s",
    ]);
    marks.push(p.id ? ["", markOf(tPath, pw), markOf(tLate, pl), markOf(tOpen, over)] : []);
  }
  rows.push(["hero overall", bySeat(mine, false), bySeat(mine, true), "-", "", "", "", "", "", ""]);
  marks.push(["", markOf(tHero, heroP)]);
  r.table(
    ["path", hd("wins all rounds", tPath), hd(`wins rounds ${late}–${data.rules.rounds}`, tLate), hd("vs open bot", tOpen, "pts"), "run wins", "survives run", "path items", `damage mix (rounds ${late}+)`, "healed+shielded", "fight"],
    rows, { center: 50, span: 10, cols: [1, 2] }, marks,
  );
  const named = (t: Target) => ({ ...t, what: `${h.name.split(" ")[0]}: ${t.what}` });
  const best = Math.max(...shares.map((s) => s.p)), worst = Math.min(...shares.map((s) => s.p));
  r.target(named(tHero), [heroP], true);
  r.target(named(tPath), shares.map((s) => s.p), true);
  r.target(named(tLate), shares.map((s) => s.late), true);
  r.target(named(tOpen), shares.map((s) => s.overOpen), true);
  r.target(named(tSpread), [best - worst], true);
  const okPaths = shares.filter((s) => markOf(tPath, s.p) === "ok" && markOf(tLate, s.late) === "ok" && markOf(tOpen, s.overOpen) === "ok");
  const misses = [
    markOf(tHero, heroP) === "off" ? `hero ${pct(heroP)}` : "",
    markOf(tSpread, best - worst) === "off" ? `path gap ${pts(best - worst).replace("+", "")}` : "",
    ...shares.filter((s) => !okPaths.includes(s)).map((s) => `${s.name} ${pct(s.p)} (rounds ${late}+ ${pct(s.late)}, vs open ${pts(s.overOpen)})`),
  ].filter(Boolean);
  verdicts.push(`${h.name}: ${okPaths.length} of ${shares.length} paths on target${misses.length ? `; off: ${misses.join(", ")}` : ", hero on target"}.`);
}
r.chart({ type: "bar", title: "Win share of every path (all rounds)", x: bars.map((b) => b.name), unit: "%", ref: 50, band: { min: 100 * tPath.min!, max: 100 * tPath.max! }, series: [{ name: "wins", values: bars.map((b) => b.p) }] });
r.log();
r.log("Reading: \"wins\" = share of lobby fights won against other heroes. \"run wins\" and \"survives run\" follow the real rules (4 lives).");
r.log("\"vs open bot\" = the path's win share minus the hero's open bot (takes the best item of any path); a path below it gives no reason to follow it.");
r.log("\"path items\" = share of the final build's item cost that belongs to the path. \"healed+shielded\" is per fight, in percent of the hero's health.");
r.log("Targets (data/sim/targets.json) are in the column heads; ✓ = within target, ✗ = outside. ±N is one standard error over the bots (each bot's run counts as one sample): gaps under about 2×N are noise.");
r.log("A path is on target when all three of its marks are ✓; the hero also needs its overall share and the gap between best and weakest path on target.");
r.log();
r.log("## Verdict");
for (const v of verdicts) r.log(`  ${v}`);
r.done();
