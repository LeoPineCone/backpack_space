import { describe, expect, it } from "vitest";
import { Replay, buildStats, compile, simulate, type Build } from "@backpack-space/core";
import { loadGameData } from "@backpack-space/core/node";

const data = loadGameData();
const hero = data.heroList[0]!;
const bags = hero.bags;
/** first bag cells, left to right, for single-cell test items */
const spot = (i: number) => ({ x: 3 + (i % 3), y: 2 + Math.floor(i / 3), rot: 0 });
const build = (items: string[], round = 1, h = hero.id): Build => ({ hero: h, round, bags, items: items.map((item, i) => ({ item, ...spot(i) })) });

describe("battle", () => {
  it("is deterministic for the same seed", () => {
    const a = compile(build(["fang_dagger", "protein_bar"]), data), b = compile(build(["asteroid_chunk"]), data);
    const r1 = simulate(a, b, data.rules, 42, { log: true }), r2 = simulate(a, b, data.rules, 42, { log: true });
    expect(r1).toEqual(r2);
    expect(r1.log!.length).toBeGreaterThan(5);
  });
  it("ends every fight: two builds without weapons die in the supernova", () => {
    const a = compile(build(["scrap_metal"]), data), b = compile(build(["scrap_metal"], 1, data.heroList[1]!.id), data);
    const r = simulate(a, b, data.rules, 1);
    expect(r.supernova).toBe(true);
    expect(r.seconds).toBeLessThan(data.rules.battle.maxSeconds);
    expect(Math.min(...r.hp)).toBeLessThanOrEqual(0);
  });
  it("a weapon beats no weapon", () => {
    const a = compile(build(["fang_dagger", "fang_dagger"]), data), b = compile(build(["scrap_metal"]), data);
    expect(simulate(a, b, data.rules, 3).winner).toBe(0);
  });
  it("healing above full health becomes Shield only with overheal", () => {
    const foe = compile(build(["scrap_metal"], 1, data.heroList[1]!.id), data);
    const plain = simulate(compile(build(["watering_drone"]), data), foe, data.rules, 2);
    const moss = compile(build(["watering_drone", "sap_tap"]), data);
    expect(moss.overheal).toBe(25);
    const over = simulate(moss, foe, data.rules, 2);
    expect(plain.stats[0].shielded).toBe(0);
    expect(over.stats[0].shielded).toBeGreaterThan(0);
  });
  it("counts the cells pets cover, not the pets (Quill's health)", () => {
    const none = compile(build(["scrap_metal"], 1, "quill"), data).maxHp;
    const rat = compile(build(["burrow_rat"], 1, "quill"), data).maxHp, bear = compile(build(["moon_bear"], 1, "quill"), data).maxHp;
    expect(data.items.get("moon_bear")!.size).toBe(4);
    expect(bear - data.items.get("moon_bear")!.effects.reduce((n, e) => n + (e.mod?.maxHp ?? 0), 0) - none).toBe(4 * (rat - none));
  });
  it("beasts are large pets, swarm pets are pets, none is both", () => {
    for (const it of data.itemList) {
      const tags = it.tags as string[];
      if (tags.includes("beast")) { expect(tags).toContain("pet"); expect(it.size).toBeGreaterThanOrEqual(4); expect(tags).not.toContain("swarm"); }
      if (tags.includes("swarm")) expect(tags).toContain("pet");
    }
  });
  it("every hero brings the same number of personal items", () => {
    const counts = data.heroList.map((h) => data.itemList.filter((i) => i.hero === h.id).length);
    expect(new Set(counts).size).toBe(1);
  });
  it("leech heals for a share of the damage dealt, fractions add up", () => {
    const foe = compile(build(["fang_dagger", "fang_dagger"], 1, data.heroList[1]!.id), data);
    const quill = compile(build(["burrow_rat"], 1, "quill"), data);
    const pct = quill.items[0]!.leech;
    expect(pct).toBeGreaterThan(0);
    const r = simulate(quill, foe, data.rules, 3, { log: true });
    const healed = r.log!.filter((e) => e.s === 0 && e.k === "heal" && e.w === "leech").reduce((n, e) => n + e.v, 0);
    const dealt = r.log!.filter((e) => e.s === 0 && e.k === "attack").length;
    expect(healed).toBeGreaterThan(0);
    expect(healed).toBeLessThanOrEqual(Math.ceil((dealt * 2 * pct) / 100) + 1);
  });
  it("Overclock refills Energy faster", () => {
    const rules = (energyPct: number) => ({ ...data.rules, energy: { ...data.rules.energy, regen: 1 }, status: { ...data.rules.status, overclock: { ...data.rules.status.overclock, energyPct } } });
    const a = compile(build(["overclock_chip", "fang_dagger", "fang_dagger", "fang_dagger"], 12), data), b = compile(build(["scrap_metal"], 12, data.heroList[1]!.id), data);
    const without = simulate(a, b, rules(0), 4), withIt = simulate(a, b, rules(10), 4);
    expect(without.stats[0].energyWait).toBeGreaterThan(0);
    expect(withIt.stats[0].energySpent / withIt.seconds).toBeGreaterThan(without.stats[0].energySpent / without.seconds);
  });
  it("shield absorbs weapon damage, toxin ignores it", () => {
    const shielded = compile(build(["scrap_metal"]), data);
    const gun = simulate(compile(build(["fang_dagger"]), data), shielded, data.rules, 5, { log: true });
    const firstHit = gun.log!.find((e) => e.k === "attack" && e.s === 0)!;
    expect(firstHit.v).toBe(0);
    const tox = simulate(compile(build(["vacuum_slug"].slice(0, 0).concat(["pollen_cloud"])), data), shielded, data.rules, 5, { log: true });
    const tick = tox.log!.find((e) => e.k === "tick" && e.w === "toxin")!;
    expect(tick.v).toBeGreaterThan(0);
  });
  it("stars and bags change the compiled item", () => {
    const lens = data.items.get("targeting_lens")!;
    expect(lens.shape.join("").includes("*")).toBe(true);
    // lens at the centre of the field pack, a gun on its right star
    const b: Build = { hero: hero.id, round: 1, bags, items: [{ item: "targeting_lens", x: 4, y: 3, rot: 0 }, { item: "fang_dagger", x: 5, y: 3, rot: 0 }, { item: "fang_dagger", x: 3, y: 2, rot: 0 }] };
    const c = compile(b, data);
    expect(c.items[1]!.crit).toBeGreaterThan(c.items[2]!.crit);
  });
  it("items must lie on bags", () => {
    expect(() => compile({ hero: hero.id, round: 1, bags, items: [{ item: "fang_dagger", x: 8, y: 6, rot: 0 }] }, data)).toThrow();
  });
  it("replays to the same end as the battle, in steps or in one jump", () => {
    const a = compile(build(["fang_dagger", "protein_bar"]), data), b = compile(build(["asteroid_chunk"]), data);
    const r = simulate(a, b, data.rules, 7, { log: true });
    const stepped = new Replay([a, b], r, data.rules);
    let seen = stepped.start().length;
    for (let i = 0; i < 100000 && !stepped.done; i++) seen += stepped.advance(0.25).length;
    expect(stepped.done).toBe(true);
    expect(seen).toBe(r.log!.length);
    expect([stepped.sides[0].hp, stepped.sides[1].hp]).toEqual(r.hp);
    const jumped = new Replay([a, b], r, data.rules);
    jumped.start();
    expect(jumped.finish().length + 0).toBeLessThanOrEqual(r.log!.length);
    expect(jumped.sides.map((s) => s.st)).toEqual(stepped.sides.map((s) => s.st));
  });
  it("every attack costs Energy; without Energy a weapon waits", () => {
    const rules = { ...data.rules, energy: { max: 10, start: 10, regen: 0 } };
    const cost = data.items.get("antimatter_dagger")!.energy!;
    const target = compile(build(["scrap_metal"], 12), data);
    const r = simulate(compile(build(["antimatter_dagger", "antimatter_dagger"], 12), data), target, rules, 4, { log: true });
    const attacks = r.log!.filter((e) => e.s === 0 && (e.k === "attack" || e.k === "miss"));
    expect(attacks.length).toBe(Math.floor(10 / cost));
    expect(r.stats[0].energyWait).toBeGreaterThan(0);
    expect(attacks.every((e) => e.w === "melee")).toBe(true);
    // an Energy item lets the same weapons attack more often
    const fed = simulate(compile(build(["antimatter_dagger", "antimatter_dagger", "energy_gel"], 12), data), target, rules, 4, { log: true });
    expect(fed.log!.filter((e) => e.s === 0 && e.k === "attack").length).toBeGreaterThan(attacks.length);
  });
  it("Energy items restore Energy and the replay follows it", () => {
    const rules = { ...data.rules, energy: { max: 20, start: 0, regen: 0 } };
    const a = compile(build(["protein_bar", "antimatter_dagger"]), data), b = compile(build(["scrap_metal"]), data);
    const r = simulate(a, b, rules, 2, { log: true });
    const gains = r.log!.filter((e) => e.k === "energy" && e.s === 0);
    expect(gains.length).toBeGreaterThan(0);
    expect(r.stats[0].energyGained).toBe(gains.reduce((s, e) => s + e.v, 0));
    const replay = new Replay([a, b], r, rules);
    replay.start();
    let low = Infinity;
    while (!replay.done) { replay.advance(0.1); low = Math.min(low, replay.sides[0].energy); }
    expect(low).toBeGreaterThanOrEqual(0);
    expect(replay.sides[0].energy).toBeCloseTo(r.stats[0].energyGained - r.stats[0].energySpent, 5);
  });
  it("backpack numbers: Energy used and gained per second", () => {
    const gun = data.items.get("antimatter_dagger")!;
    const few = buildStats(compile(build(["antimatter_dagger"]), data), data.rules);
    expect(few.energy.need).toBeCloseTo(gun.energy! / gun.cooldown!, 5);
    expect(few.energy.income).toBe(data.rules.energy.regen);
    expect(few.energy.wait).toBe(0);
    expect(few.melee).toBe(1);
    const many = buildStats(compile(build(Array(9).fill("antimatter_dagger")), data), data.rules);
    expect(many.energy.need).toBeGreaterThan(many.energy.income);
    expect(many.energy.wait).toBeGreaterThan(0);
    const fed = buildStats(compile(build([...Array(8).fill("antimatter_dagger"), "energy_gel"]), data), data.rules);
    expect(fed.energy.refill).toBe(data.rules.energy.regen + 1);
    const bar = buildStats(compile(build(["protein_bar"]), data), data.rules);
    expect(bar.energy.fromItems).toBeCloseTo(2 / 3, 5);
  });
});
