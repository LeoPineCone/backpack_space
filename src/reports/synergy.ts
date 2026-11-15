/**
 * Do the heroes' mechanics and items interlock, and who beats whom?
 *   npm run report:synergy -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 *
 * Three questions:
 *  1. Matchups: hero against hero (mirror included) and path against path. Does one hero beat everybody, or is it
 *     rock-paper-scissors?
 *  2. Interlock: how many items of a build feed each other or are fed by the hero, round by round.
 *  3. What the interlock is worth: the same builds fight the same opponents again with the hero's own rules switched off,
 *     and with the item-to-item effects switched off. The drop in win share is what the hero's kit and the synergies add.
 */
import { compile, simulate, type Build, type CSide, type Effect, type GameData, type HeroData, type ItemDef } from "@backpack-space/core";
import { makeField } from "../sim/lobby";
import { pct, share, signed, startReport } from "./common";

const r = startReport({
  id: "synergy",
  title: "Hero synergies and matchups",
  question: "Do the heroes' rules and items interlock more with every round, and does one hero beat all others or do they counter each other?",
  presets: {
    quick: { lobbies: 8, duels: 60, pathDuels: 24, builds: 12, opponents: 8 },
    normal: { lobbies: 40, duels: 300, pathDuels: 120, builds: 40, opponents: 12 },
    precise: { lobbies: 160, duels: 1200, pathDuels: 480, builds: 120, opponents: 24 },
  },
  explain: {
    lobbies: "lobbies of 16 bots (4 per hero, one per path plus one open bot) playing all 12 rounds",
    duels: "fights per hero pair and stage",
    pathDuels: "fights per path pair",
    builds: "builds per hero and round for the interlock test",
    opponents: "opponents per build in that test",
  },
});
const data: GameData = r.data;
const heroes = data.heroList;
const name = (h: string) => data.heroes.get(h)!.name;
const pathOf = (seat: number): string => {
  const h = heroes[seat % heroes.length]!;
  return h.paths[Math.floor(seat / heroes.length)]?.id ?? "";
};
const { lobbies } = makeField(data, r.n.lobbies, r.seed, { path: pathOf }, (i) => r.progress(`lobby ${i + 1}/${r.n.lobbies}`));
interface Entry { build: Build; path: string }
const byRound: Entry[][] = Array.from({ length: data.rules.rounds }, () => []);
for (const l of lobbies) for (const s of l.seats) s.builds.forEach((b, i) => byRound[i]!.push({ build: b, path: s.bot.path }));
const of = (round: number, hero: string, path?: string) => byRound[round - 1]!.filter((e) => e.build.hero === hero && (path === undefined || e.path === path));
const fight = (a: CSide, b: CSide) => { const res = simulate(a, b, data.rules, r.rng.int(2 ** 31)); return res.winner === 0 ? 1 : res.winner === -1 ? 0.5 : 0; };

// ---------------------------------------------------------------- 1. matchups
const STAGES = [4, 8, 12];
r.log();
r.log("## 1. Hero against hero");
r.log();
r.log(`Row wins against column with builds of the same round, ${r.n.duels} fights per pair and stage. The mirror (same hero) shows the noise and any first-strike edge.`);
const M = new Map<string, number>(); // "a/b" -> share over all stages
const perStage = new Map<string, number>();
for (const round of STAGES) for (const a of heroes) for (const b of heroes) {
  const A = of(round, a.id), B = of(round, b.id);
  let w = 0;
  for (let i = 0; i < r.n.duels; i++) w += fight(compile(r.rng.pick(A).build, data), compile(r.rng.pick(B).build, data));
  perStage.set(`${round}/${a.id}/${b.id}`, w / r.n.duels);
  M.set(`${a.id}/${b.id}`, (M.get(`${a.id}/${b.id}`) ?? 0) + w / r.n.duels / STAGES.length);
}
for (const round of [...STAGES, 0]) {
  r.log();
  r.log(round ? `Round ${round} builds:` : "All three stages together:");
  r.table(["", ...heroes.map((h) => h.name)], heroes.map((a) => [a.name, ...heroes.map((b) => pct(round ? perStage.get(`${round}/${a.id}/${b.id}`)! : M.get(`${a.id}/${b.id}`)!))]), { center: 50, span: 20 });
}
r.log(`(Noise per cell about ±${Math.round(100 * Math.sqrt(0.25 / r.n.duels))} points per stage, ±${Math.round(100 * Math.sqrt(0.25 / (r.n.duels * STAGES.length)))} for all stages.)`);

const EDGE = 0.55;
r.log();
r.log(`Who beats whom (all stages, an edge is a share of at least ${pct(EDGE)}):`);
const dominant: string[] = [];
for (const a of heroes) {
  const beats = heroes.filter((b) => b !== a && M.get(`${a.id}/${b.id}`)! >= EDGE).map((b) => `${b.name} ${pct(M.get(`${a.id}/${b.id}`)!)}`);
  const loses = heroes.filter((b) => b !== a && M.get(`${a.id}/${b.id}`)! <= 1 - EDGE).map((b) => `${b.name} ${pct(M.get(`${a.id}/${b.id}`)!)}`);
  const avgVs = heroes.filter((b) => b !== a).reduce((x, b) => x + M.get(`${a.id}/${b.id}`)!, 0) / (heroes.length - 1);
  if (heroes.every((b) => b === a || M.get(`${a.id}/${b.id}`)! > 0.5)) dominant.push(a.name);
  r.log(`  ${a.name.padEnd(12)} average ${pct(avgVs)}; beats ${beats.join(", ") || "nobody clearly"}; loses to ${loses.join(", ") || "nobody clearly"}`);
}
const cycles: string[] = [];
for (const a of heroes) for (const b of heroes) for (const c of heroes) {
  if (a.id >= b.id || a.id >= c.id || b === c) continue;
  if (M.get(`${a.id}/${b.id}`)! > 0.5 && M.get(`${b.id}/${c.id}`)! > 0.5 && M.get(`${c.id}/${a.id}`)! > 0.5) cycles.push(`${a.name} > ${b.name} > ${c.name} > ${a.name}`);
}
r.log();
r.log(`Dominance: ${dominant.length ? `${dominant.join(", ")} beats every other hero (more than 50 % against each)` : "no hero beats all others"}.`);
r.log(`Rock-paper-scissors circles (each step above 50 %): ${cycles.length ? cycles.join("; ") : "none"}.`);

// ---------------------------------------------------------------- path against path
const paths = heroes.flatMap((h) => h.paths.map((p) => ({ hero: h, id: p.id, label: `${h.name.split(" ")[0]}: ${p.name}` })));
r.log();
r.log("## 2. Path against path");
r.log();
r.log(`Every bot of a path is committed to it (see report:paths). Builds of rounds 8 and 12, ${r.n.pathDuels} fights per pair. Row wins against column; the paths of the same hero are a mirror of that hero.`);
const P = new Map<string, number>();
for (const a of paths) for (const b of paths) {
  let w = 0;
  for (let i = 0; i < r.n.pathDuels; i++) {
    const round = i % 2 ? 12 : 8;
    const A = of(round, a.hero.id, a.id), B = of(round, b.hero.id, b.id);
    w += fight(compile(r.rng.pick(A).build, data), compile(r.rng.pick(B).build, data));
  }
  P.set(`${a.label}|${b.label}`, w / r.n.pathDuels);
}
const short = paths.map((_, i) => `P${i + 1}`);
r.log(...paths.map((p, i) => `  ${short[i]} = ${p.label}`));
r.log();
r.table(["", ...short], paths.map((a, i) => [short[i]!, ...paths.map((b) => (a === b ? "-" : String(Math.round(100 * P.get(`${a.label}|${b.label}`)!))))]), { center: 50, span: 20 });
r.log(`(Shares in percent. Noise per cell about ±${Math.round(100 * Math.sqrt(0.25 / r.n.pathDuels))} points.)`);
r.log();
r.log("Each path against the paths of the other heroes: average, best and worst matchup.");
r.table(["path", "vs other heroes", "best against", "worst against"], paths.map((a) => {
  const others = paths.filter((b) => b.hero !== a.hero).map((b) => ({ b, p: P.get(`${a.label}|${b.label}`)! })).sort((x, y) => y.p - x.p);
  const mean = others.reduce((x, o) => x + o.p, 0) / others.length;
  return [a.label, pct(mean), `${others[0]!.b.label} ${pct(others[0]!.p)}`, `${others[others.length - 1]!.b.label} ${pct(others[others.length - 1]!.p)}`];
}));

// ---------------------------------------------------------------- 3. interlock
const has = (def: ItemDef, tag: string | undefined) => tag === undefined || tag === "any" || def.tags.includes(tag as never);
const produces = (e: Effect) => e.gain ?? e.inflict;
/** Effects that only work through other items: passives on neighbours or the whole backpack, star triggers, counts of other items. */
const isLink = (e: Effect) => (e.on === "passive" && (e.to === "stars" || e.to === "ship")) || e.on === "starUse" || !!e.per?.stars || !!e.per?.ship;

interface Interlock { linked: number; byHero: number; pairs: number; items: number }
function interlock(side: CSide): Interlock {
  const n = side.items.length;
  const linked = new Set<number>(), byHero = new Set<number>(), pairs = new Set<string>();
  const link = (a: number, b: number) => { if (a === b) return; linked.add(a); linked.add(b); pairs.add(a < b ? `${a}/${b}` : `${b}/${a}`); };
  const statusFrom = new Map<string, number[]>(); // status -> producing items
  side.items.forEach((it, i) => { for (const e of it.def.effects) { const s = produces(e); if (s) statusFrom.set(s, [...(statusFrom.get(s) ?? []), i]); } });
  side.items.forEach((it, i) => {
    for (const e of it.def.effects) {
      if (e.on === "passive" && e.to === "stars") for (const j of it.starred) { if (has(side.items[j]!.def, e.tag)) link(i, j); }
      if (e.on === "passive" && e.to === "ship") side.items.forEach((t, j) => { if (has(t.def, e.tag)) link(i, j); });
      if (e.on === "starUse") for (const j of it.starred) { if (has(side.items[j]!.def, e.tag)) link(i, j); }
      if (e.per?.stars) for (const j of it.starred) { if (has(side.items[j]!.def, e.per.stars)) link(i, j); }
      if (e.per?.ship) side.items.forEach((t, j) => { if (has(t.def, e.per!.ship)) link(i, j); });
      const s = e.per?.buff ?? e.per?.debuff;
      if (s) for (const j of statusFrom.get(s) ?? []) link(i, j);
    }
    // Power adds to every weapon hit
    if (it.dmg) for (const j of statusFrom.get("power") ?? []) link(i, j);
  });
  const heroStatus = new Set(side.hero.effects.map(produces).filter(Boolean) as string[]);
  for (const e of side.hero.effects) {
    if (e.on === "shipUse" || (e.on === "passive" && e.to === "ship") || e.per?.ship) {
      const tag = e.on === "passive" || e.on === "shipUse" ? e.tag : e.per?.ship;
      side.items.forEach((t, j) => { if (has(t.def, tag ?? e.per?.ship)) byHero.add(j); });
    }
  }
  side.items.forEach((it, j) => { if ((it.dmg && heroStatus.has("power")) || it.def.effects.some((e) => heroStatus.has((e.per?.buff ?? e.per?.debuff) as string))) byHero.add(j); });
  return { linked: linked.size / Math.max(1, n), byHero: byHero.size / Math.max(1, n), pairs: pairs.size, items: n };
}

const noHero: GameData = { ...data, heroes: new Map([...data.heroes].map(([k, h]) => [k, { ...h, effects: [], supernovaResist: 0, hpBonus: 0 } as HeroData])) };
const noLinks: GameData = { ...data, items: new Map([...data.items].map(([k, d]) => [k, { ...d, effects: d.effects.filter((e) => !isLink(e)) }])) };

const ROUNDS = [2, 4, 6, 8, 10, 12];
r.log();
r.log("## 3. Do the builds interlock step by step?");
r.log();
r.log("\"linked\" = share of the build's items that feed another item or are fed by one: a passive on its stars or on the whole backpack,");
r.log("a star trigger, a count of other items, or a stack (Burn, Toxin, Power on weapons, ...) that another item of the build produces.");
r.log("\"hero rules\" = share of items the hero's own rules act on (Toxin on meals, speed for organic, mechanical or crafted items, pets, Power per phase).");
r.log(`"kit worth" and "synergy worth": ${r.n.builds} builds per cell fight ${r.n.opponents} opponents of the same round three times with the same seeds:`);
r.log("as they are, without the hero's rules (no passives, no Supernova resistance), and without item-to-item effects. The drop in win share is the worth.");
const worthRows: (string | number)[][] = [];
const summary: { hero: string; kit: number[]; syn: number[]; linked: number[] }[] = [];
for (const h of heroes) {
  r.log();
  r.log(`${h.name} – ${h.focus}`);
  const rows: (string | number)[][] = [];
  const sum = { hero: h.name, kit: [] as number[], syn: [] as number[], linked: [] as number[] };
  for (const round of ROUNDS) {
    const own = of(round, h.id);
    const field = byRound[round - 1]!.filter((e) => e.build.hero !== h.id);
    let items = 0, linked = 0, byHero = 0, pairs = 0;
    for (const e of own) { const x = interlock(compile(e.build, data)); items += x.items; linked += x.linked; byHero += x.byHero; pairs += x.pairs; }
    const k = own.length || 1;
    let full = 0, kitOff = 0, synOff = 0, n = 0;
    for (let i = 0; i < r.n.builds; i++) {
      const b = r.rng.pick(own).build;
      const A = compile(b, data), Ah = compile(b, noHero), Al = compile(b, noLinks);
      for (let j = 0; j < r.n.opponents; j++) {
        const o = compile(r.rng.pick(field).build, data);
        const seed = r.rng.int(2 ** 31);
        const w = (x: CSide) => { const res = simulate(x, o, data.rules, seed); return res.winner === 0 ? 1 : res.winner === -1 ? 0.5 : 0; };
        full += w(A); kitOff += w(Ah); synOff += w(Al); n++;
      }
    }
    sum.kit.push((full - kitOff) / n); sum.syn.push((full - synOff) / n); sum.linked.push(linked / k);
    rows.push([`round ${round}`, (items / k).toFixed(1), pct(linked / k), (pairs / k).toFixed(1), pct(byHero / k), share(full / n, n), signed((100 * (full - kitOff)) / n, 0), signed((100 * (full - synOff)) / n, 0)]);
  }
  r.table(["", "items", "linked", "links", "hero rules", "wins", "kit worth", "synergy worth"], rows);
  summary.push(sum);
  // what the late builds are made of
  const counts = new Map<string, number>();
  const late = of(12, h.id);
  for (const e of late) for (const id of new Set(e.build.items.map((p) => p.item))) counts.set(id, (counts.get(id) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, c]) => `${data.items.get(id)!.name} ${pct(c / late.length)}`);
  r.log(`  most common in round 12 builds: ${top.join(", ")}`);
}
for (const s of summary) worthRows.push([s.hero, `${pct(s.linked[0]!)} → ${pct(s.linked[s.linked.length - 1]!)}`, `${signed(100 * s.kit[0]!, 0)} → ${signed(100 * s.kit[s.kit.length - 1]!, 0)}`, `${signed(100 * s.syn[0]!, 0)} → ${signed(100 * s.syn[s.syn.length - 1]!, 0)}`]);
r.log();
r.log(`Summary, round ${ROUNDS[0]} → round ${ROUNDS[ROUNDS.length - 1]} (points of win share):`);
r.table(["hero", "linked items", "kit worth", "synergy worth"], worthRows);
r.chart({ type: "line", title: "Linked items (share of the build)", x: ROUNDS, xLabel: "round", unit: "%", series: summary.map((s) => ({ name: s.hero, values: s.linked.map((v) => 100 * v) })) });
r.chart({ type: "line", title: "Kit worth (points of win share from the hero's rules)", x: ROUNDS, xLabel: "round", ref: 0, series: summary.map((s) => ({ name: s.hero, values: s.kit.map((v) => 100 * v) })) });
r.chart({ type: "line", title: "Synergy worth (points from item-to-item effects)", x: ROUNDS, xLabel: "round", ref: 0, series: summary.map((s) => ({ name: s.hero, values: s.syn.map((v) => 100 * v) })) });
r.log();
r.log("Reading: a growing \"linked\" share and growing worth mean the build grows together over the run. A kit worth near zero means the");
r.log("hero's own rules hardly matter for the result; a synergy worth near zero means the items work alone, side by side.");
r.log(`Noise of a worth: about ±${Math.max(1, Math.round(100 * Math.sqrt(0.25 / (r.n.builds * r.n.opponents)) / 2))} points (same seeds on both sides make it smaller than the win share's noise).`);
r.done();
