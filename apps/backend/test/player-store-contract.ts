/**
 * What every PlayerStore must do. Runs against the in-memory fake (player-store.test.ts) and against DynamoDB Local
 * (api/player-store.api.test.ts), so the fake used by the domain tests behaves like the real table.
 */
import { expect, it } from "vitest";
import type { PlayerStore } from "../src/ports/index.js";

export function playerStoreContract(make: () => Promise<PlayerStore>) {
  let n = 0;
  const pk = () => `P#contract-${Date.now()}-${n++}`;

  it("returns null for a missing item and the item after a put", async () => {
    const s = await make();
    const p = pk();
    expect(await s.get(p, "PROFILE")).toBeNull();
    expect(await s.transact([{ put: { pk: p, sk: "PROFILE", name: "Nova", version: 1 } }])).toBe(true);
    expect(await s.get(p, "PROFILE")).toEqual({ pk: p, sk: "PROFILE", name: "Nova", version: 1 });
  });

  it("lists a partition sorted by sort key and nothing of other partitions", async () => {
    const s = await make();
    const p = pk();
    await s.transact([{ put: { pk: p, sk: "RUN" } }, { put: { pk: p, sk: "OWN#hero-venn" } }, { put: { pk: pk(), sk: "PROFILE" } }]);
    expect((await s.query(p)).map((i) => i.sk)).toEqual(["OWN#hero-venn", "RUN"]);
  });

  it("writes nothing when one condition of a transaction fails", async () => {
    const s = await make();
    const p = pk();
    await s.transact([{ put: { pk: p, sk: "ROUND#r1#01" } }]);
    const ok = await s.transact([{ put: { pk: p, sk: "RUN", round: 2 } }, { put: { pk: p, sk: "ROUND#r1#01", again: true }, ifNotExists: true }]);
    expect(ok).toBe(false);
    expect(await s.get(p, "RUN")).toBeNull();
    expect(await s.get(p, "ROUND#r1#01")).toEqual({ pk: p, sk: "ROUND#r1#01" });
  });

  it("checks the version number: a missing item counts as version 0", async () => {
    const s = await make();
    const p = pk();
    expect(await s.transact([{ put: { pk: p, sk: "PROFILE", version: 1 }, ifVersion: 1 }])).toBe(false);
    expect(await s.transact([{ put: { pk: p, sk: "PROFILE", version: 1 }, ifVersion: 0 }])).toBe(true);
    expect(await s.transact([{ put: { pk: p, sk: "PROFILE", version: 2 }, ifVersion: 0 }])).toBe(false);
    expect(await s.transact([{ put: { pk: p, sk: "PROFILE", version: 2 }, ifVersion: 1 }])).toBe(true);
    expect((await s.get(p, "PROFILE"))?.version).toBe(2);
  });

  it("deletes, and refuses to delete a missing item when asked to check", async () => {
    const s = await make();
    const p = pk();
    await s.transact([{ put: { pk: p, sk: "RUN" } }]);
    expect(await s.transact([{ delete: { pk: p, sk: "RUN" }, ifExists: true }])).toBe(true);
    expect(await s.get(p, "RUN")).toBeNull();
    expect(await s.transact([{ delete: { pk: p, sk: "RUN" }, ifExists: true }])).toBe(false);
  });

  it("deletes on a version number only when it matches", async () => {
    const s = await make();
    const p = pk();
    await s.transact([{ put: { pk: p, sk: "RUN", version: 3 } }]);
    expect(await s.transact([{ delete: { pk: p, sk: "RUN" }, ifVersion: 2 }])).toBe(false);
    expect(await s.get(p, "RUN")).not.toBeNull();
    expect(await s.transact([{ delete: { pk: p, sk: "RUN" }, ifVersion: 3 }])).toBe(true);
    expect(await s.transact([{ delete: { pk: p, sk: "RUN" }, ifVersion: 3 }])).toBe(false);
  });

  it("reads every item with one sort key over all partitions, page by page", async () => {
    const s = await make();
    const mine = [pk(), pk(), pk()];
    await s.transact(mine.flatMap((p) => [{ put: { pk: p, sk: "PROFILE", n: 1 } }, { put: { pk: p, sk: "RUN" } }]));
    const seen: string[] = [];
    let next: string | undefined;
    do {
      const page = await s.scan("PROFILE", next);
      for (const i of page.items) {
        expect(i.sk).toBe("PROFILE");
        seen.push(i.pk);
      }
      next = page.next;
    } while (next);
    expect(seen.filter((p) => mine.includes(p)).sort()).toEqual([...mine].sort());
  });
}
