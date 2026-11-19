/** Keeps the running game on this device, so a reload or a closed app continues where the player was. */
import type { RunBody } from "@backpack-space/api";
import { boardOf, type Build, type GameData, type RunState } from "@backpack-space/core";

const KEY = "backpack-space.run";
/** 3: the run carries its seed, reroll count and action log; the shop follows from them (older runs are dropped) */
const VERSION = 3;

/** A fight that was started: the same opponent and seed replay the same fight after a reload. */
export interface SavedFight {
  ghost: Build;
  seed: number;
  /** online: what the server decided for this round (it counts, not the replay), and the run after it */
  server?: { name: string; patch: string | null; won: boolean; run: RunBody };
}
export interface Saved {
  v: number;
  run: RunState;
  seed: number;
  fight: SavedFight | null;
  /** online: the server's id of the run this copy belongs to */
  runId?: string;
  /** a quest run: the quest id (the run plays with its rules) */
  quest?: string;
}

export function writeSave(s: Omit<Saved, "v">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    /* storage unavailable: the run only lives in memory */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

/** The stored run, or null when there is none or it no longer fits the game data (then it is dropped). */
export function readSave(data: GameData): Saved | null {
  let s: Saved;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    s = JSON.parse(raw) as Saved;
  } catch {
    return null;
  }
  if (fits(s, data)) return s;
  clearSave();
  return null;
}

function fits(s: Saved, data: GameData): boolean {
  try {
    if (
      s?.v !== VERSION ||
      !s.run ||
      s.run.over ||
      !data.heroes.has(s.run.hero) ||
      typeof s.run.seed !== "number" ||
      typeof s.run.rerolls !== "number" ||
      !Array.isArray(s.run.log)
    )
      return false;
    const r = s.run;
    const ids = [...r.bags, ...r.items]
      .map((p) => p.item)
      .concat(
        r.loose,
        r.offers.flatMap((o) => (o ? [o.item] : [])),
        r.special ?? [],
      );
    if (!ids.every((id) => data.items.has(id))) return false;
    boardOf(data.rules.grid.w, data.rules.grid.h, r.bags, r.items, data.shape);
    if (s.fight) boardOf(data.rules.grid.w, data.rules.grid.h, s.fight.ghost.bags, s.fight.ghost.items, data.shape);
    return true;
  } catch {
    return false;
  }
}
