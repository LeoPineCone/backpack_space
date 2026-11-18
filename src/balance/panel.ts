/**
 * The panel: lobbies of a baseline with every bot's build per round, every pairing with its dice and what the
 * fight gave. Stored builds can fight again with changed numbers ("replay") without any bot shopping again:
 * bots choose items by price, rating, tags and recipes, never by damage or effect numbers, so for such numbers
 * the replay is the same measurement as a full paired run, at a fraction of the time.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { compile, simulate, type BotOpts, type Build, type CSide, type GameData, type Placement } from "@backpack-space/core";
import { playLobby } from "../sim/lobby";
import { pathOfSeat, recOf, seatStats, type FightRec, type LobbyFight, type LobbySeat, type SeatStat } from "../sim/paths";
import type { Touched } from "./patch";

export interface PanelFight extends LobbyFight {
  seed: number;
}
export interface PanelLobby {
  seats: LobbySeat[];
  fights: PanelFight[];
}
export interface Panel {
  seed: number;
  lobbies: PanelLobby[];
}

/** Lobby i of a seed, played with this data: one bot per path of every hero plus one open bot (as report:paths). */
export function playPanelLobby(data: GameData, seed: number, i: number, free = false, bot?: BotOpts): PanelLobby {
  // free: every bot chooses its path itself (the lobbies of makeField, which the item measurement uses)
  const l = playLobby(data, seed * 100003 + i, free ? { immortal: true, bot } : { path: (s) => pathOfSeat(data, s), immortal: true, bot });
  return {
    seats: l.seats.map((s) => ({ hero: s.bot.hero, path: s.bot.path, builds: s.builds })),
    fights: l.fights.map((f) => ({ round: f.round, a: f.a, b: f.b, seed: f.seed, rec: recOf(f.res) })),
  };
}

// ---- file format: placements as [item, x, y, rot] to keep the file small
type P4 = [string, number, number, number];
interface StoredSeat {
  hero: string;
  path: string;
  builds: { bags: P4[]; items: P4[] }[];
}
interface StoredPanel {
  kind: "backpack-space-panel";
  seed: number;
  lobbies: { seats: StoredSeat[]; fights: PanelFight[] }[];
}
const pack = (p: Placement): P4 => [p.item, p.x, p.y, p.rot];
const unpack = (p: P4): Placement => ({ item: p[0], x: p[1], y: p[2], rot: p[3] });

export function writePanel(file: string, panel: Panel): void {
  const stored: StoredPanel = {
    kind: "backpack-space-panel",
    seed: panel.seed,
    lobbies: panel.lobbies.map((l) => ({
      fights: l.fights,
      seats: l.seats.map((s) => ({ hero: s.hero, path: s.path, builds: s.builds.map((b) => ({ bags: b.bags.map(pack), items: b.items.map(pack) })) })),
    })),
  };
  writeFileSync(file, JSON.stringify(stored));
}
export function readPanel(file: string): Panel {
  const stored = JSON.parse(readFileSync(file, "utf8")) as StoredPanel;
  if (stored.kind !== "backpack-space-panel") throw new Error(`${file} is not a panel`);
  return {
    seed: stored.seed,
    lobbies: stored.lobbies.map((l) => ({
      fights: l.fights,
      seats: l.seats.map((s) => ({
        hero: s.hero,
        path: s.path,
        builds: s.builds.map((b, r): Build => ({ hero: s.hero, round: r + 1, bags: b.bags.map(unpack), items: b.items.map(unpack) })),
      })),
    })),
  };
}

/** what one lobby adds to the fight-level numbers */
export interface LobbyStat {
  seats: SeatStat[];
  /** "<hero>><hero>" (attacker first, mirrors left out): [won, fought] */
  duel: Record<string, [number, number]>;
  /** per hero and third of the run: [won, fought], fights against other heroes */
  third: Record<string, [number, number][]>;
  /** per round (index 0 = round 1), all fights: seconds, fights, fights that reached the Supernova, longest fight */
  rounds: [number, number, number, number][];
}

export function lobbyStat(data: GameData, seats: readonly LobbySeat[], fights: readonly LobbyFight[]): LobbyStat {
  const R = data.rules.rounds;
  const out: LobbyStat = {
    seats: seatStats(data, seats, fights),
    duel: {},
    third: {},
    rounds: Array.from({ length: R }, () => [0, 0, 0, 0] as [number, number, number, number]),
  };
  for (const f of fights) {
    const a = seats[f.a]!.hero,
      b = seats[f.b]!.hero;
    const r = out.rounds[f.round - 1]!;
    r[0] += f.rec.secs;
    r[1]++;
    if (f.rec.nova) r[2]++;
    r[3] = Math.max(r[3], f.rec.secs);
    if (a === b) continue;
    const d = (out.duel[`${a}>${b}`] ??= [0, 0]);
    d[0] += f.rec.w;
    d[1]++;
    const t = (out.third[a] ??= [
      [0, 0],
      [0, 0],
      [0, 0],
    ])[Math.min(2, Math.floor(((f.round - 1) * 3) / R))]!;
    t[0] += f.rec.w;
    t[1]++;
  }
  return out;
}

export interface ReplayResult {
  stats: LobbyStat[];
  /** fights played again, and how many of them changed their winner */ refought: number;
  flipped: number;
}

/**
 * The panel's fights with this (patched) data. Only fights that involve something the patch touches are fought
 * again (same builds, same dice); every other fight keeps its stored result, which the data cannot have changed.
 */
export function replay(panel: Panel, data: GameData, touched: Touched): ReplayResult {
  let refought = 0,
    flipped = 0;
  const hit = (b: Build) =>
    touched.heroes.has(b.hero) || (touched.items.size > 0 && (b.items.some((p) => touched.items.has(p.item)) || b.bags.some((p) => touched.items.has(p.item))));
  const stats = panel.lobbies.map((l) => {
    const sides = new Map<number, CSide>();
    const side = (seat: number, round: number): CSide => {
      const k = seat * 100 + round;
      let c = sides.get(k);
      if (!c) {
        c = compile(l.seats[seat]!.builds[round - 1]!, data);
        sides.set(k, c);
      }
      return c;
    };
    const again = new Map<number, boolean>();
    const isHit = (seat: number, round: number) => {
      const k = seat * 100 + round;
      let v = again.get(k);
      if (v === undefined) {
        v = hit(l.seats[seat]!.builds[round - 1]!);
        again.set(k, v);
      }
      return v;
    };
    const fights: LobbyFight[] = l.fights.map((f) => {
      if (!touched.all && !isHit(f.a, f.round) && !isHit(f.b, f.round)) return f;
      const rec: FightRec = recOf(simulate(side(f.a, f.round), side(f.b, f.round), data.rules, f.seed));
      refought++;
      if (rec.w !== f.rec.w) flipped++;
      return { round: f.round, a: f.a, b: f.b, rec };
    });
    return lobbyStat(data, l.seats, fights);
  });
  return { stats, refought, flipped };
}

/** the stored results as they are */
export const stored = (panel: Panel, data: GameData): LobbyStat[] => panel.lobbies.map((l) => lobbyStat(data, l.seats, l.fights));
