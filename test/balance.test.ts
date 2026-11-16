import { describe, expect, it } from "vitest";
import { loadGameData, loadRawData } from "@backpack-space/core/node";
import { changeOf, itemKnobs, valueAt } from "../src/balance/knobs";
import { loss, metricsOf, outside, paired, DEFAULT_KINDS } from "../src/balance/metrics";
import { lobbyStat, playPanelLobby, replay, stored, type Panel } from "../src/balance/panel";
import { mergePatches, patchedData, touchedBy, type Patch } from "../src/balance/patch";
import { commitPays, measurePathLobby, MECHANICS, styleDistance, type Profile, type SeatStat } from "../src/sim/paths";
import { measureItem } from "../src/sim/items";
import { cycleShare, metaShares } from "../src/balance/meta";
import { itemDistance, pullOf } from "../src/balance/pull";
import { correlation, fightModel, removeOne, ridgeLogistic, robustZ, solveSpd, type Row } from "../src/balance/strength";

const data = loadGameData();
const raw = loadRawData();
const panel: Panel = { seed: 5, lobbies: [playPanelLobby(data, 5, 0), playPanelLobby(data, 5, 1)] };

describe("patch", () => {
  it("changes only the copy and goes through the schema", () => {
    const before = data.items.get("venus_mantrap")!.cooldown;
    const d = patchedData({ changes: [{ item: "venus_mantrap", set: { cooldown: 1.5, "effects.0.n": 9 } }] }, raw);
    expect(d.items.get("venus_mantrap")!.cooldown).toBe(1.5);
    expect(d.items.get("venus_mantrap")!.effects[0]!.n).toBe(9);
    expect(loadGameData().items.get("venus_mantrap")!.cooldown).toBe(before);
    expect(() => patchedData({ changes: [{ item: "venus_mantrap", set: { cooldown: -1 } }] }, raw)).toThrow();
    expect(() => patchedData({ changes: [{ item: "no_such_item", set: { cooldown: 1 } }] }, raw)).toThrow();
  });
  it("merges patches and knows what they touch", () => {
    const p: Patch = mergePatches({ changes: [{ item: "a", set: { x: 1 } }] }, { changes: [{ item: "a", set: { y: 2 } }, { hero: "rook", set: { z: 3 } }] });
    expect(p.changes).toEqual([{ item: "a", set: { x: 1, y: 2 } }, { hero: "rook", set: { z: 3 } }]);
    const t = touchedBy(p);
    expect([...t.items]).toEqual(["a"]); expect([...t.heroes]).toEqual(["rook"]); expect(t.all).toBe(false);
    expect(touchedBy({ changes: [{ rules: true, set: { "energy.regen": 12.5 } }] }).all).toBe(true);
  });
});

describe("panel and replay", () => {
  it("gives the seat stats of the paths measurement", () => {
    expect(JSON.stringify(lobbyStat(data, panel.lobbies[0]!.seats, panel.lobbies[0]!.fights).seats)).toBe(JSON.stringify(measurePathLobby(data, 5, 0)));
  });
  it("replays every stored fight to the stored result", () => {
    const r = replay(panel, data, { items: new Set(), heroes: new Set(), all: true });
    expect(r.refought).toBe(panel.lobbies.reduce((n, l) => n + l.fights.length, 0));
    expect(r.flipped).toBe(0);
    expect(JSON.stringify(r.stats)).toBe(JSON.stringify(stored(panel, data)));
  });
  it("fights again only what a patch touches, and a stronger item wins more", () => {
    // the weapon Rook's bots hold most often
    const count = new Map<string, number>();
    for (const l of panel.lobbies) for (const s of l.seats) if (s.hero === "rook") for (const b of s.builds) for (const p of b.items) if (data.items.get(p.item)!.damage) count.set(p.item, (count.get(p.item) ?? 0) + 1);
    const id = [...count].sort((a, b) => b[1] - a[1])[0]![0];
    const def = data.items.get(id)!;
    const patch: Patch = { changes: [{ item: id, set: { damage: [def.damage![0] * 3, def.damage![1] * 3] } }] };
    const d = patchedData(patch, raw);
    const r = replay(panel, d, touchedBy(patch));
    expect(r.refought).toBeGreaterThan(0);
    expect(r.refought).toBeLessThan(panel.lobbies.reduce((n, l) => n + l.fights.length, 0));
    const before = metricsOf(data, stored(panel, data)), after = metricsOf(d, r.stats);
    expect(paired(before.get("hero:rook")!, after.get("hero:rook")!).d).toBeGreaterThan(0);
  });
});

describe("metrics and loss", () => {
  it("measures the distance to a band with a margin", () => {
    expect(outside({ min: 0.48, max: 0.52, what: "" }, 0.5)).toBe(0);
    expect(outside({ min: 0.48, max: 0.52, what: "" }, 0.46)).toBeCloseTo(0.02);
    expect(outside({ min: 0.48, max: 0.52, what: "" }, 0.485, 0.01)).toBeCloseTo(0.005);
    expect(outside({ max: 0.06, what: "" }, 0.1)).toBeCloseTo(0.04);
    expect(outside(undefined, 3)).toBe(0);
  });
  it("is zero when every counted target is met", () => {
    const m = metricsOf(data, stored(panel, data));
    const T = { pathHeroWinShare: { min: 0, max: 1, what: "" } };
    expect(loss(() => undefined, m, T, { kinds: ["hero"], margin: 0, marginSeconds: 0 })).toBe(0);
    expect(loss(() => 2, m, T, { kinds: ["hero"], margin: 0, marginSeconds: 0 })).toBeCloseTo(4 * 100 ** 2);
    expect(DEFAULT_KINDS).not.toContain("open");
  });
});

describe("knobs", () => {
  it("steps towards stronger and stays on the grid", () => {
    const ks = itemKnobs(raw, "venus_mantrap");
    const cd = ks.find((k) => k.path === "cooldown")!, dmg = ks.find((k) => k.path === "damage")!;
    expect(valueAt(cd, 1)).toBeLessThan(cd.base as number);
    expect((valueAt(dmg, 1) as number[])[0]).toBeGreaterThan((dmg.base as number[])[0]!);
    expect(Number.isInteger((valueAt(dmg, 2) as number[])[1])).toBe(true);
    expect(valueAt(dmg, -100)).toBeUndefined();
    expect(changeOf(cd, 1)).toEqual({ item: "venus_mantrap", set: { cooldown: valueAt(cd, 1) } });
    expect(cd.botsRead).toBe(true); expect(dmg.botsRead).toBe(false);
    expect(ks.some((k) => k.path === "cost")).toBe(false);
  });
});

describe("item measurement", () => {
  it("gives an item the same result whatever else is measured", () => {
    const byRound = Array.from({ length: data.rules.rounds }, (_, r) => panel.lobbies.flatMap((l) => l.seats.map((s) => s.builds[r]!)));
    const it1 = data.items.get("war_horn")!;
    const a = measureItem(data, it1, byRound, { builds: 4, fights: 3 }, 1);
    measureItem(data, data.items.get("venus_mantrap")!, byRound, { builds: 4, fights: 3 }, 1);
    expect(measureItem(data, it1, byRound, { builds: 4, fights: 3 }, 1)).toEqual(a);
  });
});

describe("meta share", () => {
  it("is even when nobody has an edge and sums to one", () => {
    const x = metaShares([[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]]);
    expect(x.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    for (const v of x) expect(v).toBeCloseTo(1 / 3, 5);
  });
  it("plays a dominant option most and keeps rock-paper-scissors even", () => {
    const dom = metaShares([[0.5, 0.7, 0.7], [0.3, 0.5, 0.5], [0.3, 0.5, 0.5]]);
    expect(dom[0]).toBeGreaterThan(0.9);
    const rps = [[0.5, 0.7, 0.3], [0.3, 0.5, 0.7], [0.7, 0.3, 0.5]];
    for (const v of metaShares(rps)) expect(v).toBeCloseTo(1 / 3, 3);
    expect(cycleShare(rps)).toBeCloseTo(1);
    expect(cycleShare([[0.5, 0.6, 0.7], [0.4, 0.5, 0.6], [0.3, 0.4, 0.5]])).toBeCloseTo(0);
  });
});

describe("item strength", () => {
  it("solves a small system and finds the item that wins", () => {
    const x = solveSpd(Float64Array.from([4, 2, 2, 3]), Float64Array.from([2, 1]), 2);
    expect(x[0]).toBeCloseTo(0.5); expect(x[1]).toBeCloseTo(0);
    // feature 0 decides most fights, feature 1 is noise
    const rows: Row[] = [];
    for (let i = 0; i < 400; i++) { const a = i % 2 ? 1 : -1, b = i % 4 < 2 ? 1 : -1; rows.push({ x: [[0, a], [1, b]], y: a > 0 ? (i % 10 === 1 ? 0 : 1) : (i % 10 === 0 ? 1 : 0) }); }
    const w = ridgeLogistic(rows, 2);
    expect(w[0]).toBeGreaterThan(1);
    expect(Math.abs(w[1]!)).toBeLessThan(0.3);
  });
  it("scores against the class median and correlates", () => {
    const z = robustZ([1, 2, 3, 4, 100]);
    expect(z[2]).toBe(0); expect(z[4]).toBeGreaterThan(10);
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
  });
  it("measures a loss when an owned item is taken away, and fits the fight model", () => {
    const rem = removeOne([panel], data, 20);
    expect(rem.size).toBeGreaterThan(20);
    const drops = [...rem.values()].filter((x) => x.n >= 10).map((x) => x.drop);
    expect(drops.reduce((a, b) => a + b, 0) / drops.length).toBeGreaterThan(0);
    for (const x of rem.values()) expect(x.n).toBeLessThanOrEqual(20);
    const model = fightModel(panel, data);
    expect(model.size).toBe(data.itemList.filter((i) => !i.isBag).length);
    expect([...model.values()].every(Number.isFinite)).toBe(true);
  });
});

describe("path pull", () => {
  it("compares two builds by the items they do not share", () => {
    expect(itemDistance(["a", "b"], ["a", "b", "b"])).toBe(0);
    expect(itemDistance(["a", "b"], ["c"])).toBe(1);
    expect(itemDistance(["a", "b"], ["b", "c"])).toBeCloseTo(2 / 3);
  });
  it("says whether the more committed bots of a path win more", () => {
    const seat = (commit: number, w: number): SeatStat => ({ commit, w, n: 10, lw: w / 2, ln: 5 } as SeatStat);
    const pays = commitPays([seat(0.2, 3), seat(0.3, 3), seat(0.5, 5), seat(0.5, 5), seat(0.8, 7), seat(0.9, 9)])!;
    expect(pays.all).toBeCloseTo(0.5); expect(pays.late).toBeCloseTo(0.5); expect(pays.low).toBeCloseTo(0.25);
    expect(commitPays([seat(0.2, 3)])).toBeUndefined();
  });
  it("two paths with the same damage mix still differ when their rhythm does", () => {
    const mix = Object.fromEntries(MECHANICS.map((m) => [m, m === "weapon" ? 1 : 0])) as Profile["mix"];
    const base: Profile = { mix, main: "weapon", carry: 0.2, dealers: 5, late: 0.4, attacksPerSec: 4, pathDamage: 0.5, kept: 0.5, perAttack: 6 };
    expect(styleDistance(base, { ...base }).score).toBe(0);
    const fast = styleDistance(base, { ...base, attacksPerSec: 6, perAttack: 4 });
    expect(fast.score).toBeCloseTo(1); expect(["tempo", "weight"]).toContain(fast.by);
    const tank = styleDistance(base, { ...base, kept: 1 });
    expect(tank.by).toBe("protection"); expect(tank.score).toBeCloseTo(2);
    expect(styleDistance(base, { ...base, late: 0.45, carry: 0.25 }).score).toBeLessThan(1);
  });
  it("bots that like their path more build more of it", () => {
    const at = (pathLiking: number) => pullOf(data, [0, 1].map((i) => playPanelLobby(data, 5, i, false, { pathLiking })));
    const low = at(1), high = at(4);
    expect(pullOf(data, panel.lobbies).commit).toBeGreaterThan(low.commit!);
    expect(high.commit).toBeGreaterThan(low.commit! + 0.1);
    expect(Object.keys(low).filter((k) => k.startsWith("commit:")).length).toBe(data.heroList.reduce((n, h) => n + h.paths.length, 0));
  });
});
