/**
 * Does every hero have more than one way to win?
 *   npm run report:paths -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--jobs N] [--baseline file.json] [--out file]
 *
 * Every hero lists its designed paths in data/heroes.json. In this report every bot commits to one path of its hero
 * (or to none: "open") and plays whole runs in mixed lobbies. The targets (data/sim/targets.json, path*) stand in
 * the column heads; every checked cell is marked ✓ / ✗ and every hero gets its target lights.
 *
 * --baseline out/reports/paths.json compares with the run that wrote that file (the last run, if nothing else
 * wrote there since). With the same seed and lobby count the comparison is paired: both runs play the same
 * lobbies, so the change is measured much more exactly than two independent runs could.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  commitPays,
  aggregatePaths,
  blockSe,
  lateRound,
  MECHANIC_TEXT,
  MECHANICS,
  measurePathLobby,
  profileDistance,
  profileOf,
  styleDistance,
  STYLE_TEXT,
  SOURCES,
  type Measured,
  type Profile,
} from "../sim/paths";
import { jobsFrom, runParallel } from "../sim/parallel";
import { avg, loadTargets, markOf, pct, pts, startReport, targetRange, type Target } from "./common";
import type { Mark, ReportPage } from "./html";

const r = startReport({
  id: "paths",
  title: "Ways to win",
  question: "Does every hero have several paths that win, or does one strategy carry it?",
  presets: { quick: { lobbies: 12 }, normal: { lobbies: 60 }, precise: { lobbies: 240 } },
  explain: { lobbies: "lobbies of 16 bots (4 per hero, one per path plus one open bot) playing all 12 rounds" },
});
const data = r.data;
const L = r.n.lobbies;
const seats = await runParallel(
  { kind: "paths", seed: r.seed, ratings: !r.flags["no-ratings"] },
  L,
  jobsFrom(r.flags),
  (i) => measurePathLobby(data, r.seed, i),
  (d) => r.progress(`lobby ${d}/${L}`),
);
const groups = aggregatePaths(seats);
const late = lateRound(data);

// ---- baseline
let base: ReportPage | undefined;
if (r.flags.baseline) {
  if (!existsSync(r.flags.baseline)) throw new Error(`--baseline: ${r.flags.baseline} not found`);
  base = JSON.parse(readFileSync(r.flags.baseline, "utf8")) as ReportPage;
  if (!base.values) throw new Error(`--baseline: ${r.flags.baseline} has no measured values (written by an older version)`);
}
const paired = !!base && base.seed === r.seed && base.values?.lobbies?.[0] === L;
if (base)
  r.log(
    `Baseline: ${r.flags.baseline} (run ${base.written.slice(0, 16).replace("T", " ")} UTC, seed ${base.seed}, ${base.values?.lobbies?.[0]} lobbies)${paired ? ": same lobbies, paired comparison." : ": other seed or lobby count, independent comparison (less exact)."}`,
  );
/** change against the baseline with its standard error; paired runs use the block differences */
const delta = (key: string, m: Measured): { d: number; se: number } | undefined => {
  const b = base?.values?.[key];
  if (!b) return undefined;
  const [bp, bse, ...bblocks] = b as [number, number, ...number[]];
  if (paired && bblocks.length === m.blocks.length) return { d: m.p - bp, se: blockSe(m.blocks.map((x, k) => x - bblocks[k]!)) };
  return { d: m.p - bp, se: Math.sqrt(m.se ** 2 + bse ** 2) };
};
const fmtDelta = (x?: { d: number; se: number }) =>
  x ? `${pts(x.d)} ±${Math.max(1, Math.round(100 * x.se))}${Math.round(100 * Math.abs(x.d)) >= 1 && Math.abs(x.d) >= 2 * x.se ? " *" : ""}` : "";
r.value("lobbies", [L]);

// ---- tables
const T = loadTargets();
const tHero = T.pathHeroWinShare!,
  tPath = T.pathWinShare!,
  tLate = T.pathLateWinShare!,
  tOpen = T.pathOverOpen!,
  tSpread = T.pathSpread!;
const tMain = T.pathMainShare!,
  tDistinct = T.pathDistinct!,
  tCommit = T.pathCommit!,
  tPays = T.pathPays!,
  tStyle = T.pathStyle!;
const flat = seats.flat();
const hd = (label: string, t: Target, unit: "%" | "pts" = "%") => `${label} [target ${targetRange(t, unit)}]`;
const show = (m: Measured) => `${pct(m.p)} ±${Number.isFinite(m.se) ? Math.max(1, Math.round(100 * m.se)) : "-"}`;

const verdicts: string[] = [];
const bars: { name: string; p: number }[] = [];
for (const h of data.heroList) {
  r.log();
  r.log(`## ${h.name} – ${h.focus}`);
  const rows: (string | number)[][] = [];
  const marks: Mark[][] = [];
  const shares: { name: string; p: number; late: number; overOpen: number }[] = [];
  const open = groups.get(`${h.id}/`);
  const hero = groups.get(`${h.id}/*`)!;
  for (const p of [...h.paths, { id: "", name: "(open, no path)", focus: [] as string[] }]) {
    const key = `${h.id}/${p.id}`;
    const g = groups.get(key);
    if (!g) continue;
    r.value(`${key}:all`, [g.all.p, g.all.se, ...g.all.blocks]);
    r.value(`${key}:late`, [g.late.p, g.late.se, ...g.late.blocks]);
    const total = SOURCES.reduce((x, k) => x + g.dmg[k], 0) || 1;
    const mix = SOURCES.filter((k) => g.dmg[k] / total >= 0.1)
      .sort((x, y) => g.dmg[y] - g.dmg[x])
      .map((k) => `${k} ${pct(g.dmg[k] / total)}`)
      .join(", ");
    const over = open ? g.all.p - open.all.p : NaN;
    if (p.id) shares.push({ name: p.name, p: g.all.p, late: g.late.p, overOpen: over });
    bars.push({ name: `${h.name.split(" ")[0]}: ${p.id ? p.name : "open"}`, p: 100 * g.all.p });
    rows.push([
      p.name,
      show(g.all),
      show(g.late),
      p.id ? pts(over) : "-",
      ...(base ? [fmtDelta(delta(`${key}:all`, g.all))] : []),
      avg(g.wins).toFixed(1),
      pct(g.alive / Math.max(1, g.seats)),
      p.id ? pct(avg(g.commit)) : "-",
      mix,
      pct(g.kept / Math.max(1, g.fights)),
      (g.secs / Math.max(1, g.fights)).toFixed(0) + " s",
    ]);
    marks.push(p.id ? ["", markOf(tPath, g.all.p), markOf(tLate, g.late.p), markOf(tOpen, over)] : []);
  }
  r.value(`${h.id}/*:all`, [hero.all.p, hero.all.se, ...hero.all.blocks]);
  rows.push(["hero overall", show(hero.all), show(hero.late), "-", ...(base ? [fmtDelta(delta(`${h.id}/*:all`, hero.all))] : []), "", "", "", "", "", ""]);
  marks.push(["", markOf(tHero, hero.all.p)]);
  r.table(
    [
      "path",
      hd("wins all rounds", tPath),
      hd(`wins rounds ${late}–${data.rules.rounds}`, tLate),
      hd("vs open bot", tOpen, "pts"),
      ...(base ? ["change vs baseline"] : []),
      "run wins",
      "survives run",
      "path items",
      `damage mix (rounds ${late}+)`,
      "healed+shielded",
      "fight",
    ],
    rows,
    { center: 50, span: 10, cols: [1, 2] },
    marks,
  );
  const named = (t: Target) => ({ ...t, what: `${h.name.split(" ")[0]}: ${t.what}` });
  const best = Math.max(...shares.map((s) => s.p)),
    worst = Math.min(...shares.map((s) => s.p));
  r.target(named(tHero), [hero.all.p], true);
  r.target(
    named(tPath),
    shares.map((s) => s.p),
    true,
  );
  r.target(
    named(tLate),
    shares.map((s) => s.late),
    true,
  );
  r.target(
    named(tOpen),
    shares.map((s) => s.overOpen),
    true,
  );
  r.target(named(tSpread), [best - worst], true);
  // ---- path profile: does every path win in its own way?
  const profs: { name: string; p: Profile }[] = [];
  const prow: (string | number)[][] = [],
    pmarks: Mark[][] = [];
  const paysAll: number[] = [];
  for (const p of [...h.paths, { id: "", name: "(open, no path)", focus: [] as string[] }]) {
    const g = groups.get(`${h.id}/${p.id}`);
    if (!g) continue;
    const pr = profileOf(g);
    if (p.id) profs.push({ name: p.name, p: pr });
    const pays = p.id ? commitPays(flat.filter((q) => q.key === `${h.id}/${p.id}`)) : undefined;
    if (pays) {
      paysAll.push(pays.all);
      r.value(`${h.id}/${p.id}:pays`, [pays.all, pays.late]);
    }
    const mix = MECHANICS.filter((m) => pr.mix[m] >= 0.1)
      .sort((x, y) => pr.mix[y] - pr.mix[x])
      .map((m) => `${m} ${pct(pr.mix[m])}`)
      .join(", ");
    prow.push([
      p.name,
      `${pr.main} ${pct(pr.mix[pr.main])}`,
      mix,
      pct(pr.carry),
      pr.dealers.toFixed(1),
      pr.attacksPerSec.toFixed(1),
      pct(pr.late),
      p.id ? pct(pr.pathDamage) : "-",
      p.id ? pct(avg(g.commit)) : "-",
      pays ? `${pts(pays.all)} (late ${pts(pays.late)})` : "-",
    ]);
    pmarks.push(p.id ? ["", markOf(tMain, pr.mix[pr.main]), "", "", "", "", "", "", markOf(tCommit, avg(g.commit)), pays ? markOf(tPays, pays.all) : ""] : []);
  }
  r.log();
  r.log(`Path profile of ${h.name.split(" ")[0]} (rounds ${late}+):`);
  r.table(
    [
      "path",
      hd("main mechanic", tMain),
      "damage mix",
      "best item",
      "items dealing damage",
      "attacks / s",
      "damage from phase 3 on",
      "damage by path items",
      hd("path items (cost)", tCommit),
      hd("going deeper pays", tPays, "pts"),
    ],
    prow,
    undefined,
    pmarks,
  );
  const pairs: { a: string; b: string; d: number }[] = [];
  for (let i = 0; i < profs.length; i++)
    for (let j = i + 1; j < profs.length; j++) pairs.push({ a: profs[i]!.name, b: profs[j]!.name, d: profileDistance(profs[i]!.p, profs[j]!.p) });
  pairs.sort((x, y) => x.d - y.d);
  if (pairs.length)
    r.log(
      `  How different (1 − cosine of the damage mix, target ≥ ${tDistinct.min}): ${pairs.map((x) => `${x.a} / ${x.b} ${x.d.toFixed(2)}${markOf(tDistinct, x.d) === "ok" ? " ✓" : " ✗"}`).join(", ")}`,
    );
  const styles: { a: string; b: string; s: ReturnType<typeof styleDistance> }[] = [];
  for (let i = 0; i < profs.length; i++)
    for (let j = i + 1; j < profs.length; j++) styles.push({ a: profs[i]!.name, b: profs[j]!.name, s: styleDistance(profs[i]!.p, profs[j]!.p) });
  styles.sort((x, y) => x.s.score - y.s.score);
  if (styles.length)
    r.log(
      `  Play style (largest difference of a pair, 1 = clearly different, target ≥ ${tStyle.min}): ${styles.map((x) => `${x.a} / ${x.b} ${x.s.score.toFixed(2)} by ${STYLE_TEXT[x.s.by]}${markOf(tStyle, x.s.score) === "ok" ? " ✓" : " ✗"}`).join(", ")}`,
    );
  if (styles.length)
    r.target(
      named(tStyle),
      styles.map((x) => x.s.score),
      false,
    );
  for (const pr of profs)
    r.value(
      `${h.id}/${pr.name}:mix`,
      MECHANICS.map((m) => pr.p.mix[m]),
    );
  r.target(
    named(tMain),
    profs.map((x) => x.p.mix[x.p.main]),
    true,
  );
  r.target(
    named(tDistinct),
    pairs.map((x) => x.d),
    true,
  );
  if (paysAll.length) r.target(named(tPays), paysAll, true);
  r.target(
    named(tCommit),
    h.paths.map((p) => avg(groups.get(`${h.id}/${p.id}`)?.commit ?? [0])),
    true,
  );
  const closest = pairs[0];
  const okPaths = shares.filter((s) => markOf(tPath, s.p) === "ok" && markOf(tLate, s.late) === "ok" && markOf(tOpen, s.overOpen) === "ok");
  const misses = [
    markOf(tHero, hero.all.p) === "off" ? `hero ${pct(hero.all.p)}` : "",
    markOf(tSpread, best - worst) === "off" ? `path gap ${pts(best - worst).replace("+", "")}` : "",
    ...shares.filter((s) => !okPaths.includes(s)).map((s) => `${s.name} ${pct(s.p)} (rounds ${late}+ ${pct(s.late)}, vs open ${pts(s.overOpen)})`),
  ].filter(Boolean);
  verdicts.push(
    `${h.name}: ${okPaths.length} of ${shares.length} paths on target${misses.length ? `; off: ${misses.join(", ")}` : ", hero on target"}.${closest ? ` Paths ${markOf(tDistinct, closest.d) === "ok" ? "distinct" : `too alike: ${closest.a} / ${closest.b} ${closest.d.toFixed(2)}`}.` : ""}`,
  );
}
r.chart({
  type: "bar",
  title: "Win share of every path (all rounds)",
  x: bars.map((b) => b.name),
  unit: "%",
  ref: 50,
  band: { min: 100 * tPath.min!, max: 100 * tPath.max! },
  series: [{ name: "wins", values: bars.map((b) => b.p) }],
});
r.log();
r.log('Reading: "wins" = share of lobby fights won against other heroes. "run wins" and "survives run" follow the real rules (4 lives).');
r.log("\"vs open bot\" = the path's win share minus the hero's open bot (takes the best item of any path); a path below it gives no reason to follow it.");
r.log('"path items" = share of the final build\'s item cost that belongs to the path. "healed+shielded" is per fight, in percent of the hero\'s health.');
r.log(
  `Path profile: damage by mechanic (${MECHANICS.map((m) => `${m} = ${MECHANIC_TEXT[m]}`).join("; ")}). "best item" = share of the damage the single best item dealt; "attacks / s" = weapon and pet attacks per second.`,
);
r.log("Targets (data/sim/targets.json) are in the column heads; ✓ = within target, ✗ = outside.");
r.log(
  "±N is one standard error, measured from how much the share varies between blocks of lobbies; a gap under about 2×N can be chance. npm run report:selftest checks that this ± is honest.",
);
if (base) r.log('"change vs baseline": * = at least two standard errors, very likely a real change.');
r.log("A path is on target when all three of its marks are ✓; the hero also needs its overall share and the gap between best and weakest path on target.");
r.log();
r.log("## Verdict");
for (const v of verdicts) r.log(`  ${v}`);
r.done();
