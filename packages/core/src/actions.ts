/**
 * Shop-phase actions as short lines (CORE-02). Every change a player makes to a run in the shop is one line like
 * "buy 2 3 1 0" or "sell 4"; the client changes the run only through `applyAction`, and the run keeps the lines in
 * order (`RunState.log`). With the run seed, that log rebuilds the whole run (`replayRun`), which is what the server
 * will check later.
 *
 * Lines (indices are 0-based; a spot is `x y rot`):
 *   buy <slot> [x y rot]   buy an offer into the backpack, or loose without a spot
 *   reroll                 new offers for gold
 *   freeze <slot>          pin or release an offer
 *   loose <i> x y rot      put a loose piece into the backpack
 *   move <i> x y rot       move (or turn) an item in the backpack
 *   bag <i> x y rot        move a bag; the items in it travel along
 *   lock <i>               lock an item against merging, or release it
 *   drop <i>               take an item out of the backpack (it drops loose)
 *   dropbag <i>            take a bag out; what loses its bag drops with it
 *   sell <i>               sell an item from the backpack
 *   sellbag <i>            sell an empty bag
 *   sellloose <i>          sell a loose piece
 *   pick <choice>          take one of the free special items
 *   giveup                 end the run in the shop
 *
 * Not actions: placing an arbitrary item, combining and merging happen only inside the core (merging after a fight),
 * so a log can never create an item. Fight results are written to the log by `finishRound` as "won" / "lost"; they
 * come from the fight, not from the player, so `applyAction` refuses them.
 */
import type { GameData } from "./gamedata.js";
import {
  buy,
  dropBag,
  dropItem,
  finishRound,
  giveUp,
  moveBag,
  moveItem,
  newRun,
  placeLoose,
  reroll,
  sellBag,
  sellItem,
  sellLoose,
  takeSpecial,
  toggleFreeze,
  toggleLock,
  type RunState,
  type Spot,
} from "./run.js";

/** One action as a short line, e.g. "buy 2 3 1 0". */
export type Action = string;

export type ActionKind =
  "buy" | "reroll" | "freeze" | "loose" | "move" | "bag" | "lock" | "drop" | "dropbag" | "sell" | "sellbag" | "sellloose" | "pick" | "giveup";

/** How many numbers each action takes after its name (buy takes 1 or 4). */
const ARITY: Record<ActionKind, readonly number[]> = {
  buy: [1, 4],
  reroll: [0],
  freeze: [1],
  loose: [4],
  move: [4],
  bag: [4],
  lock: [1],
  drop: [1],
  dropbag: [1],
  sell: [1],
  sellbag: [1],
  sellloose: [1],
  pick: [1],
  giveup: [0],
};

export interface ParsedAction {
  kind: ActionKind;
  /** the index of the offer, item, bag, loose piece or special choice */
  i: number;
  spot?: Spot;
}

/** Reads a line; null when it is not a well-formed action. */
export function parseAction(line: Action): ParsedAction | null {
  if (typeof line !== "string" || line.length > 64) return null;
  const [kind, ...rest] = line.trim().split(/\s+/);
  if (!kind || !Object.hasOwn(ARITY, kind)) return null;
  const k = kind as ActionKind;
  if (!ARITY[k].includes(rest.length)) return null;
  if (!rest.every((n) => /^-?\d{1,4}$/.test(n))) return null;
  const nums = rest.map(Number);
  const a: ParsedAction = { kind: k, i: nums[0] ?? 0 };
  if (nums.length === 4) {
    const [, x, y, rot] = nums as [number, number, number, number];
    if (rot < 0 || rot > 3) return null;
    a.spot = { x, y, rot };
  }
  return a;
}

/** Writes an action as its line. */
export function formatAction(a: ParsedAction): Action {
  const args = ARITY[a.kind][0] === 0 ? [] : [a.i];
  if (a.spot) args.push(a.spot.x, a.spot.y, a.spot.rot);
  return [a.kind, ...args].join(" ");
}

/** Builders for the lines, so callers never write them by hand. */
export const act = {
  buy: (slot: number, at?: Spot): Action => formatAction({ kind: "buy", i: slot, spot: at }),
  reroll: (): Action => "reroll",
  freeze: (slot: number): Action => formatAction({ kind: "freeze", i: slot }),
  placeLoose: (i: number, at: Spot): Action => formatAction({ kind: "loose", i, spot: at }),
  moveItem: (i: number, at: Spot): Action => formatAction({ kind: "move", i, spot: at }),
  moveBag: (i: number, at: Spot): Action => formatAction({ kind: "bag", i, spot: at }),
  lock: (i: number): Action => formatAction({ kind: "lock", i }),
  dropItem: (i: number): Action => formatAction({ kind: "drop", i }),
  dropBag: (i: number): Action => formatAction({ kind: "dropbag", i }),
  sellItem: (i: number): Action => formatAction({ kind: "sell", i }),
  sellBag: (i: number): Action => formatAction({ kind: "sellbag", i }),
  sellLoose: (i: number): Action => formatAction({ kind: "sellloose", i }),
  pick: (choice: number): Action => formatAction({ kind: "pick", i: choice }),
  giveUp: (): Action => "giveup",
};

const inRange = (i: number, list: readonly unknown[]) => Number.isInteger(i) && i >= 0 && i < list.length;

/**
 * Applies one action to the run. Returns whether it was applied; a refused action (malformed, out of range, not
 * allowed by the rules, or the run is over) leaves the run exactly as it was. Applied actions are added to `s.log`.
 */
export function applyAction(s: RunState, data: GameData, line: Action): boolean {
  const a = parseAction(line);
  if (!a || s.over) return false;
  const ok = run(s, data, a);
  if (ok) s.log.push(formatAction(a));
  return ok;
}

function run(s: RunState, data: GameData, a: ParsedAction): boolean {
  const { i, spot } = a;
  switch (a.kind) {
    case "buy":
      return inRange(i, s.offers) && buy(s, data, i, spot);
    case "reroll":
      return reroll(s, data);
    case "freeze":
      return inRange(i, s.offers) && toggleFreeze(s, i);
    case "loose":
      return inRange(i, s.loose) && placeLoose(s, data, i, spot!);
    case "move":
      return inRange(i, s.items) && moveItem(s, data, i, spot!);
    case "bag":
      return inRange(i, s.bags) && moveBag(s, data, i, spot!);
    case "lock":
      return inRange(i, s.items) && toggleLock(s, i);
    case "drop":
      if (!inRange(i, s.items)) return false;
      dropItem(s, i);
      return true;
    case "dropbag":
      if (!inRange(i, s.bags)) return false;
      dropBag(s, data, i);
      return true;
    case "sell":
      if (!inRange(i, s.items)) return false;
      sellItem(s, data, i);
      return true;
    case "sellbag":
      return inRange(i, s.bags) && sellBag(s, data, i);
    case "sellloose":
      if (!inRange(i, s.loose)) return false;
      sellLoose(s, data, i);
      return true;
    case "pick":
      if (!s.special || !inRange(i, s.special)) return false;
      takeSpecial(s, i);
      return true;
    case "giveup":
      giveUp(s);
      return true;
  }
}

/** The log lines `finishRound` writes for a fight; they are not player actions. */
export const FIGHT_WON = "won";
export const FIGHT_LOST = "lost";

/**
 * Rebuilds a run from its hero, seed and log. Throws on the first line that does not apply, so a log that was
 * changed or does not belong to this seed is found.
 */
export function replayRun(data: GameData, hero: string, seed: number, log: readonly Action[]): RunState {
  const s = newRun(data, hero, seed);
  log.forEach((line, n) => {
    if (line === FIGHT_WON || line === FIGHT_LOST) {
      if (s.over) throw new Error(`log line ${n + 1}: fight after the end of the run`);
      finishRound(s, data, line === FIGHT_WON);
    } else if (!applyAction(s, data, line)) throw new Error(`log line ${n + 1}: "${line}" does not apply`);
  });
  return s;
}
