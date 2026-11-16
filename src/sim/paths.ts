/**
 * Measuring the ways to win: lobbies in which every bot commits to one path of its hero (or to none, "open").
 * One lobby gives one SeatStat per bot; the reports add them up. Shares come with a standard error from
 * blocks of lobbies (batch means): fights of one bot, and bots of one lobby, are not independent, so the
 * error over single fights would look far too small.
 */
import { onPath, type GameData, type SideStats } from "@backpack-space/core";
import { playLobby } from "./lobby";

export const SOURCES = ["weapon", "direct", "burn", "toxin", "spikes"] as const;
export type Source = (typeof SOURCES)[number];

/** what one bot did in one lobby, against bots of other heroes */
export interface SeatStat {
  /** "<hero>/<path>", "" path = open bot */
  key: string;
  /** fights won / fought, all rounds and from the late round on */
  w: number; n: number; lw: number; ln: number;
  /** late rounds: damage by source, healed+shielded in hero health, fights, seconds */
  dmg: Record<Source, number>; kept: number; fights: number; secs: number;
  /** share of the final build's item cost on the path (null for open bots) */
  commit: number | null;
  /** run wins and whether lives were left, by the real rules */
  wins: number; alive: boolean;
}

/** first round of the last third of the run */
export const lateRound = (data: GameData) => Math.ceil((data.rules.rounds * 2) / 3) + 1;

/** seat i plays hero i mod heroes, with its k-th path (k = i div heroes); past the paths the bot is open */
export function pathOfSeat(data: GameData, seat: number): string {
  const h = data.heroList[seat % data.heroList.length]!;
  return h.paths[Math.floor(seat / data.heroList.length)]?.id ?? "";
}

/** One lobby of the paths measurement. Lobby i of seed s is the same lobby wherever it is played. */
export function measurePathLobby(data: GameData, seed: number, i: number): SeatStat[] {
  const l = playLobby(data, seed * 100003 + i, { path: (s) => pathOfSeat(data, s), immortal: true });
  const late = lateRound(data);
  const cost = (id: string) => Math.max(1, data.items.get(id)!.cost);
  const out: SeatStat[] = l.seats.map((s) => {
    const path = data.heroes.get(s.bot.hero)!.paths.find((p) => p.id === s.bot.path);
    const last = s.builds[s.builds.length - 1]!;
    const all = last.items.reduce((x, p) => x + cost(p.item), 0);
    const commit = path ? last.items.filter((p) => onPath(data.items.get(p.item)!, path.focus)).reduce((x, p) => x + cost(p.item), 0) / Math.max(1, all) : null;
    return { key: `${s.bot.hero}/${s.bot.path}`, w: 0, n: 0, lw: 0, ln: 0, dmg: { weapon: 0, direct: 0, burn: 0, toxin: 0, spikes: 0 }, kept: 0, fights: 0, secs: 0, commit, wins: s.wins, alive: s.livesLeft > 0 };
  });
  for (const f of l.fights) {
    const a = l.seats[f.a]!, b = l.seats[f.b]!;
    if (a.bot.hero === b.bot.hero) continue;
    const g = out[f.a]!;
    const won = f.res.winner === 0 ? 1 : 0;
    g.n++; g.w += won;
    if (f.round < late) continue;
    g.ln++; g.lw += won;
    const st: SideStats = f.res.stats[0];
    for (const k of SOURCES) g.dmg[k] += st[k];
    g.kept += (st.healed + st.shielded) / f.res.maxHp[0];
    g.fights++; g.secs += f.res.seconds;
  }
  return out;
}

/** a share with its standard error and the share in every block of lobbies */
export interface Measured { p: number; se: number; blocks: number[] }
export interface PathGroup {
  key: string;
  all: Measured; late: Measured;
  dmg: Record<Source, number>; kept: number; fights: number; secs: number;
  commit: number[]; wins: number[]; alive: number; seats: number;
}

/** how many blocks of lobbies the standard error uses */
export const blockCount = (lobbies: number) => (lobbies >= 30 ? 10 : Math.max(2, Math.floor(lobbies / 3)));

const sd = (xs: readonly number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
/** standard error of the mean of block values */
export const blockSe = (blocks: readonly number[]) => (blocks.length > 1 ? sd(blocks) / Math.sqrt(blocks.length) : NaN);

/**
 * Adds the seats up per "<hero>/<path>" and per "<hero>/*" (all bots of the hero).
 * Blocks: lobbies are cut into blockCount() runs in lobby order, the share is taken per block.
 */
export function aggregatePaths(lobbies: readonly SeatStat[][]): Map<string, PathGroup> {
  const K = blockCount(lobbies.length);
  const groups = new Map<string, PathGroup & { bw: [number, number, number, number][] }>();
  const get = (key: string) => {
    let g = groups.get(key);
    if (!g) { g = { key, all: { p: 0, se: 0, blocks: [] }, late: { p: 0, se: 0, blocks: [] }, dmg: { weapon: 0, direct: 0, burn: 0, toxin: 0, spikes: 0 }, kept: 0, fights: 0, secs: 0, commit: [], wins: [], alive: 0, seats: 0, bw: Array.from({ length: K }, (): [number, number, number, number] => [0, 0, 0, 0]) }; groups.set(key, g); }
    return g;
  };
  lobbies.forEach((seats, i) => {
    const b = Math.min(K - 1, Math.floor((i * K) / lobbies.length));
    for (const s of seats) {
      for (const key of [s.key, `${s.key.split("/")[0]}/*`]) {
        const g = get(key);
        const bw = g.bw[b]!;
        bw[0] += s.w; bw[1] += s.n; bw[2] += s.lw; bw[3] += s.ln;
        for (const k of SOURCES) g.dmg[k] += s.dmg[k];
        g.kept += s.kept; g.fights += s.fights; g.secs += s.secs;
        if (s.commit !== null) g.commit.push(s.commit);
        g.wins.push(s.wins); g.alive += s.alive ? 1 : 0; g.seats++;
      }
    }
  });
  for (const g of groups.values()) {
    const m = (wi: number, ni: number): Measured => {
      const w = g.bw.reduce((x, v) => x + v[wi]!, 0), n = g.bw.reduce((x, v) => x + v[ni]!, 0);
      const blocks = g.bw.map((v) => (v[ni]! ? v[wi]! / v[ni]! : w / Math.max(1, n)));
      return { p: w / Math.max(1, n), se: blockSe(blocks), blocks };
    };
    g.all = m(0, 1); g.late = m(2, 3);
  }
  return groups;
}

/**
 * Self-test helper: makes the hero's own items of one path stronger by pct percent (weapon damage and every
 * effect number), in this data only. "venn/jungle".
 */
export function boostPath(data: GameData, key: string, pct: number): string[] {
  const [hero, id] = key.split("/");
  const path = data.heroes.get(hero!)?.paths.find((p) => p.id === id);
  if (!path) throw new Error(`no path ${key}`);
  const f = 1 + pct / 100;
  const touched: string[] = [];
  for (const it of data.itemList) {
    if (it.hero !== hero || !onPath(it, path.focus)) continue;
    if (it.damage) it.damage = [Math.round(it.damage[0] * f), Math.round(it.damage[1] * f)];
    for (const e of it.effects) if (e.n !== undefined) e.n = Math.max(e.n + 1, Math.round(e.n * f));
    touched.push(it.id);
  }
  return touched;
}
