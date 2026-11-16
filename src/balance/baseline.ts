/**
 * Takes a baseline: the reference every patch is measured against.
 *   npm run baseline -- [--quick | --precise] [--sims N] [--name main] [--seeds 1,2] [--jobs N]
 *   npm run baseline -- --check          is the stored baseline still the current game data?
 *
 * Plays the lobbies of report:paths (one bot per path of every hero plus one open bot) on two seeds and stores
 * them under out/baseline/<name>/ with every build, pairing and fight. npm run balance:replay, balance:sense and
 * balance:propose measure against it. Take a new baseline after every change to data/ (items, heroes, rules,
 * recipes, ratings); the tools warn when the stored one is stale.
 */
import { jobsFrom, runParallel } from "../sim/parallel";
import { loadTargets, startReport } from "../reports/common";
import type { Mark } from "../reports/html";
import { dataHash, readMeta, writeBaseline } from "./bench";
import { KINDS, metricsOf } from "./metrics";
import { KIND_TITLES, markFor, showMetric, showTarget } from "./show";
import { lobbyStat, playPanelLobby, type Panel, type PanelLobby } from "./panel";

const r = startReport({
  id: "baseline",
  title: "Baseline",
  question: "Where does the game stand on every fight-level target, as the reference for the next changes?",
  presets: { quick: { lobbies: 60 }, normal: { lobbies: 240 }, precise: { lobbies: 480 } },
  explain: { lobbies: "lobbies of 16 bots per seed (4 per hero: one per path plus one open bot), all 12 rounds" },
});
const name = r.flags.name ?? "main";
if (r.flags.check) {
  const meta = readMeta(name);
  const fresh = meta.dataHash === dataHash();
  r.log();
  r.log(`Baseline "${name}": taken ${meta.written.slice(0, 16).replace("T", " ")} UTC, ${meta.lobbies} lobbies, seeds ${meta.seeds.join(", ")}.`);
  r.log(fresh ? "It matches the current game data and ratings." : "STALE: data/ or the ratings changed since. Take a new one: npm run baseline");
  process.exit(fresh ? 0 : 1);
}
const data = r.data, L = r.n.lobbies, jobs = jobsFrom(r.flags);
const seeds = (r.flags.seeds ?? `${r.seed},${r.seed + 1}`).split(",").map(Number);
const t0 = Date.now();
const panels: Panel[] = [];
for (const seed of seeds) {
  const lobbies = await runParallel<PanelLobby>({ kind: "panel", seed, ratings: !r.flags["no-ratings"] }, L, jobs, (i) => playPanelLobby(data, seed, i), (d) => r.progress(`seed ${seed}: lobby ${d}/${L}`));
  panels.push({ seed, lobbies });
}
const dir = writeBaseline(name, { written: new Date().toISOString(), lobbies: L, seeds, seconds: Math.round((Date.now() - t0) / 1000) }, panels);

const T = loadTargets();
const metrics = panels.map((p) => metricsOf(data, p.lobbies.map((l) => lobbyStat(data, l.seats, l.fights))));
r.log();
r.log(`Stored in ${dir}/ (data ${dataHash()}). Every number below is measured once per seed; a target counts as off when it is off on the first seed.`);
let off = 0, total = 0;
for (const kind of Object.keys(KINDS) as (keyof typeof KINDS)[]) {
  const rows = [...metrics[0]!.values()].filter((m) => m.kind === kind);
  if (!rows.length) continue;
  r.log();
  r.log(`## ${KIND_TITLES[kind]} [target ${showTarget(kind, T)}]`);
  const marks: Mark[][] = rows.map((m) => { const k = markFor(kind, T, m.value); total++; if (k === "off") off++; return ["", k, ...seeds.slice(1).map(() => "" as Mark)]; });
  r.table(["", ...seeds.map((s) => `seed ${s}`)], rows.map((m) => [m.label, ...metrics.map((ms) => showMetric(ms.get(m.key)!))]), undefined, marks);
}
r.log();
r.log(`${off} of ${total} target checks are off (seed ${seeds[0]}). Next: npm run balance:sense -- --knobs hero:<id>   or   npm run balance:propose -- --knobs hero:<id>`);
r.done();
