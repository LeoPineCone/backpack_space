/**
 * Does every hero have more than one way to win?
 *   npm run report:paths -- [--accuracy quick|normal|precise] [--sims N] [--seed S] [--out file]
 *
 * Every hero lists its designed paths in data/heroes.json. In this report every bot commits to one path of its hero
 * (or to none: "open") and plays whole runs in mixed lobbies. A path carries if its bots win about as often as the
 * hero's best path and if they really play it (path items in the final build).
 */
import { onPath, type GameData, type SideStats } from "@backpack-space/core";
import { makeField, type Lobby, type Seat } from "../sim/lobby";
import { avg, pct, share, startReport, table } from "./common";

const r = startReport({
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
interface Group { seats: Seat[]; w: number; n: number; lw: number; ln: number; dmg: Record<(typeof SOURCES)[number], number>; kept: number; fights: number; secs: number; commit: number[]; }
const groups = new Map<string, Group>();
const key = (s: Seat) => `${s.bot.hero}/${s.bot.path}`;
const group = (k: string) => { let g = groups.get(k); if (!g) { g = { seats: [], w: 0, n: 0, lw: 0, ln: 0, dmg: { weapon: 0, direct: 0, burn: 0, toxin: 0, spikes: 0 }, kept: 0, fights: 0, secs: 0, commit: [] }; groups.set(k, g); } return g; };
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
    g.n++; if (f.res.winner === 0) g.w++;
    if (f.round < late) continue;
    g.ln++; if (f.res.winner === 0) g.lw++;
    const st: SideStats = f.res.stats[0];
    for (const k of SOURCES) g.dmg[k] += st[k];
    g.kept += (st.healed + st.shielded) / f.res.maxHp[0];
    g.fights++; g.secs += f.res.seconds;
  }
};
lobbies.forEach(add);

const verdicts: string[] = [];
for (const h of data.heroList) {
  r.log();
  r.log(`${h.name} – ${h.focus}`);
  const rows: (string | number)[][] = [];
  const shares: { name: string; p: number; n: number }[] = [];
  for (const p of [...h.paths, { id: "", name: "(open, no path)", focus: [] as string[] }]) {
    const g = groups.get(`${h.id}/${p.id}`);
    if (!g) continue;
    const total = SOURCES.reduce((x, k) => x + g.dmg[k], 0) || 1;
    const mix = SOURCES.filter((k) => g.dmg[k] / total >= 0.1).sort((x, y) => g.dmg[y] - g.dmg[x]).map((k) => `${k} ${pct(g.dmg[k] / total)}`).join(", ");
    if (p.id) shares.push({ name: p.name, p: g.w / g.n, n: g.n });
    rows.push([
      p.name, share(g.w / g.n, g.n), share(g.lw / g.ln, g.ln),
      avg(g.seats.map((s) => s.wins)).toFixed(1), pct(g.seats.filter((s) => s.livesLeft > 0).length / g.seats.length),
      p.id ? pct(avg(g.commit)) : "-", mix, pct(g.kept / Math.max(1, g.fights)), (g.secs / Math.max(1, g.fights)).toFixed(0) + " s",
    ]);
  }
  r.log(...table(["path", "wins all rounds", `wins rounds ${late}–${data.rules.rounds}`, "run wins", "survives run", "path items", `damage mix (rounds ${late}+)`, "healed+shielded", "fight"], rows));
  const best = Math.max(...shares.map((s) => s.p));
  const ok = shares.filter((s) => s.p >= best - 0.06 && s.p >= 0.42);
  verdicts.push(`${h.name}: ${ok.length} of ${shares.length} paths carry (${shares.map((s) => `${s.name} ${pct(s.p)}`).join(", ")}).`);
}
r.log();
r.log("Reading: \"wins\" = share of lobby fights won against other heroes. \"run wins\" and \"survives run\" follow the real rules (4 lives).");
r.log("\"path items\" = share of the final build's item cost that belongs to the path. \"healed+shielded\" is per fight, in percent of the hero's health.");
r.log("A path carries when it wins at least 42 % and is within 6 points of the hero's best path.");
r.log();
r.log("Verdict:");
for (const v of verdicts) r.log(`  ${v}`);
r.done();
