import { describe, expect, it } from "vitest";
import {
  act,
  applyAction,
  finishRound,
  formatAction,
  newRun,
  parseAction,
  replayRun,
  validLayout,
  type Action,
  type GameData,
  type RunState,
  type Spot,
} from "@backpack-space/core";
import { loadGameData } from "@backpack-space/core/node";

const data: GameData = loadGameData();
const hero = data.heroList[0]!.id;
const rich = (seed = 7): RunState => {
  const s = newRun(data, hero, seed);
  s.gold = 500;
  return s;
};

/** The first spot where a piece fits into the backpack, found through the actions themselves. */
function freeSpot(s: RunState, line: (at: Spot) => Action): Spot | null {
  const { w, h } = data.rules.grid;
  for (let rot = 0; rot < 4; rot++)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (applyAction(structuredClone(s), data, line({ x, y, rot }))) return { x, y, rot };
  return null;
}

/** A run state without its log, to compare the effect of actions. */
const stateOf = (s: RunState) => {
  const { log: _log, ...rest } = structuredClone(s);
  return rest;
};

describe("action lines", () => {
  it("reads and writes every kind of line the same way", () => {
    const lines = [
      "buy 2",
      "buy 2 3 1 0",
      "reroll",
      "freeze 1",
      "loose 0 1 2 3",
      "move 4 0 0 1",
      "bag 1 2 0 0",
      "lock 3",
      "drop 2",
      "dropbag 1",
      "sell 0",
      "sellbag 1",
      "sellloose 0",
      "pick 2",
      "giveup",
    ];
    for (const line of lines) expect(formatAction(parseAction(line)!)).toBe(line);
  });

  it("refuses malformed lines", () => {
    for (const line of ["", "fly 1", "buy", "buy 1 2", "buy x", "move 1 2 3 4", "reroll 1", "sell 1.5", "won", "lost", "buy 1 2 3 0 9", "sell 99999"])
      expect(parseAction(line), line).toBeNull();
  });
});

describe("applying actions", () => {
  it("buys an offer loose and into the backpack", () => {
    const s = rich();
    const gold = s.gold;
    expect(applyAction(s, data, act.buy(0))).toBe(true);
    expect(s.loose.length).toBe(1);
    expect(s.gold).toBeLessThan(gold);
    const spot = freeSpot(s, (at) => act.buy(1, at));
    if (spot) {
      const items = s.items.length + s.bags.length;
      expect(applyAction(s, data, act.buy(1, spot))).toBe(true);
      expect(s.items.length + s.bags.length).toBe(items + 1);
    }
    expect(s.log[0]).toBe("buy 0");
  });

  it("rerolls, freezes and picks", () => {
    const s = rich();
    expect(applyAction(s, data, act.freeze(0))).toBe(true);
    expect(s.offers[0]!.frozen).toBe(true);
    expect(applyAction(s, data, act.reroll())).toBe(true);
    expect(s.rerolls).toBe(1);
    expect(applyAction(s, data, act.pick(0))).toBe(false);
    const [a, b] = data.generalArtifacts.map((i) => i.id);
    s.special = [a!, b!];
    expect(applyAction(s, data, act.pick(1))).toBe(true);
    expect(s.loose).toContain(b);
    expect(s.special).toBeNull();
  });

  it("moves, locks, drops and sells items and bags", () => {
    const s = rich();
    const lock = applyAction(s, data, act.lock(0));
    expect(lock).toBe(true);
    expect(s.items[0]!.lock).toBe(true);
    const p = s.items[0]!;
    expect(applyAction(s, data, act.moveItem(0, { x: p.x, y: p.y, rot: p.rot }))).toBe(true);
    expect(applyAction(s, data, act.dropItem(0))).toBe(true);
    expect(s.loose.length).toBe(1);
    const spot = freeSpot(s, (at) => act.placeLoose(0, at));
    expect(spot).not.toBeNull();
    expect(applyAction(s, data, act.placeLoose(0, spot!))).toBe(true);
    const gold = s.gold;
    expect(applyAction(s, data, act.sellItem(0))).toBe(true);
    expect(s.gold).toBeGreaterThan(gold);
    expect(applyAction(s, data, act.dropBag(0))).toBe(true);
    expect(s.loose.length).toBeGreaterThan(0);
    expect(applyAction(s, data, act.sellLoose(0))).toBe(true);
    expect(validLayout(data, s.bags, s.items)).toBe(true);
  });

  it("moves a bag and sells an empty one", () => {
    const s = rich();
    const spot = freeSpot(s, (at) => act.moveBag(0, at));
    if (spot) expect(applyAction(s, data, act.moveBag(0, spot))).toBe(true);
    while (s.items.length) applyAction(s, data, act.sellItem(0));
    expect(applyAction(s, data, act.sellBag(0))).toBe(true);
  });

  it("gives the run up", () => {
    const s = rich();
    expect(applyAction(s, data, act.giveUp())).toBe(true);
    expect(s.over).toBe(true);
    expect(applyAction(s, data, act.reroll())).toBe(false);
  });

  it("refuses invalid actions without changing the run", () => {
    const s = newRun(data, hero, 3);
    s.gold = 0;
    const before = structuredClone(s);
    for (const line of [
      act.reroll(),
      act.buy(0),
      act.buy(99),
      act.sellItem(99),
      act.sellLoose(0),
      act.dropItem(-1),
      act.dropBag(99),
      act.lock(99),
      act.freeze(99),
      act.moveItem(0, { x: 99, y: 99, rot: 0 }),
      act.placeLoose(0, { x: 0, y: 0, rot: 0 }),
      act.pick(0),
      "won",
      "nonsense",
    ])
      expect(applyAction(s, data, line), line).toBe(false);
    expect(s).toEqual(before);
  });
});

describe("replaying a log", () => {
  /** Plays a few rounds through actions, as the client does. */
  function playLive(seed: number): RunState {
    const s = newRun(data, hero, seed);
    for (let round = 0; round < 5 && !s.over; round++) {
      if (s.special) applyAction(s, data, act.pick(0));
      applyAction(s, data, act.freeze(5));
      for (let slot = 0; slot < s.offers.length; slot++) {
        const spot = freeSpot(s, (at) => act.buy(slot, at));
        if (spot) applyAction(s, data, act.buy(slot, spot));
        else applyAction(s, data, act.buy(slot));
      }
      applyAction(s, data, act.reroll());
      if (s.loose.length) applyAction(s, data, act.sellLoose(0));
      if (s.items.length > 2) applyAction(s, data, act.lock(1));
      finishRound(s, data, round % 3 !== 1);
    }
    return s;
  }

  it("rebuilds the same run state from the seed and the log", () => {
    const live = playLive(42);
    expect(live.log.length).toBeGreaterThan(10);
    const replayed = replayRun(data, hero, 42, live.log);
    expect(replayed).toEqual(live);
  });

  it("finds a log that does not belong to the seed or was changed", () => {
    const live = playLive(42);
    const changed = [...live.log];
    const i = changed.findIndex((l) => l.startsWith("buy"));
    changed.splice(i, 0, "sellbag 7");
    expect(() => replayRun(data, hero, 42, changed)).toThrow(/does not apply/);
  });

  it("keeps the effect of the actions apart from the log itself", () => {
    const a = rich(11),
      b = rich(11);
    applyAction(a, data, act.reroll());
    applyAction(b, data, "  reroll ");
    expect(stateOf(a)).toEqual(stateOf(b));
    expect(a.log).toEqual(b.log);
  });
});
