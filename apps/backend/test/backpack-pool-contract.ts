/**
 * What every BackpackPool must do. Runs against the in-memory fake (backpack-pool.test.ts) and against DynamoDB Local
 * (api/backpack-pool.api.test.ts), so the matching tests on the fake hold for the real table.
 */
import { expect, it } from "vitest";
import type { BackpackPool } from "../src/ports/index.js";

export function backpackPoolContract(make: () => Promise<BackpackPool>) {
  let n = 0;
  const pk = () => `bot#1#R05#L3-contract-${Date.now()}-${n++}`;

  it("reads a sort key range of one partition in order, inclusive, with a limit", async () => {
    const s = await make();
    const p = pk();
    for (const sk of ["G02#00000010#a", "G01#ffffffff#b", "G02#80000000#c", "G03#00000000#d", "G02#ffffffff#e"]) await s.put({ pk: p, sk, v: sk });
    await s.put({ pk: pk(), sk: "G02#00000020#x" });
    const all = await s.range(p, "G02#", "G02#~", 10);
    expect(all.map((i) => i.sk)).toEqual(["G02#00000010#a", "G02#80000000#c", "G02#ffffffff#e"]);
    expect((await s.range(p, "G02#80000000", "G03#~", 2)).map((i) => i.sk)).toEqual(["G02#80000000#c", "G02#ffffffff#e"]);
    expect((await s.range(p, "G01#", "G03#~", 10)).map((i) => i.sk)).toHaveLength(5);
    expect(await s.range(p, "G04#", "G09#~", 10)).toEqual([]);
    expect(all[0]).toMatchObject({ pk: p, v: "G02#00000010#a" });
  });

  it("removes one item", async () => {
    const s = await make();
    const p = pk();
    await s.put({ pk: p, sk: "G00#1#a" });
    await s.put({ pk: p, sk: "G00#2#b" });
    await s.remove(p, "G00#1#a");
    await s.remove(p, "G00#9#missing");
    expect((await s.range(p, "G", "G~", 10)).map((i) => i.sk)).toEqual(["G00#2#b"]);
  });
}
