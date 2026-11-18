import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Effect } from "@backpack-space/core";
import { ROOT, loadGameData } from "@backpack-space/core/node";

const data = loadGameData();
const iconSrc = readFileSync(join(ROOT, "apps", "client", "src", "icons.ts"), "utf8");
const icons = new Set([...iconSrc.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]!));
const explained = new Set(data.glossary.terms.flatMap((t) => (t.icon ? [t.icon] : [])));

/** The symbols the client shows for an effect (mirrors apps/client/src/symbols.ts). */
function symbolsOf(e: Effect): string[] {
  const out: string[] = [];
  const on: Record<string, string | undefined> = {
    start: "start",
    use: "clock",
    hit: "hit",
    attacked: "attacked",
    phase: "phase",
    starUse: "star",
    shipUse: "ship",
    lowHp: "lowHp",
  };
  if (on[e.on]) out.push(on[e.on]!);
  if (e.tag) out.push(e.tag);
  if (e.gain) out.push(e.gain);
  if (e.inflict) out.push(e.inflict);
  if (e.do) out.push(e.do);
  for (const [k, v] of Object.entries(e.mod ?? {})) if (v) out.push(k);
  if (e.per?.cells) out.push("cell", e.per.cells);
  if (e.per?.ship) out.push("ship", e.per.ship);
  if (e.per?.stars && e.per.stars !== "any") out.push(e.per.stars);
  return out.filter((s) => s !== "any");
}

describe("client symbols", () => {
  it("every effect of every item and hero has a symbol and a glossary entry that explains it", () => {
    const effects: [string, Effect][] = [
      ...data.itemList.flatMap((it) => it.effects.map((e) => [it.id, e] as [string, Effect])),
      ...data.heroList.flatMap((h) => h.effects.map((e) => [h.id, e] as [string, Effect])),
    ];
    const missing = new Set<string>();
    for (const [id, e] of effects) for (const s of symbolsOf(e)) if (!icons.has(s) || !explained.has(s)) missing.add(`${s} (${id})`);
    expect([...missing]).toEqual([]);
  });

  it("the client draws every kind of modifier", () => {
    const symbols = readFileSync(join(ROOT, "apps", "client", "src", "symbols.ts"), "utf8");
    const schema = readFileSync(join(ROOT, "packages", "core", "src", "schema.ts"), "utf8");
    const mods = [...schema.slice(schema.indexOf("const Mod ="), schema.indexOf(".strict()", schema.indexOf("const Mod ="))).matchAll(/^\s+(\w+): z\./gm)].map(
      (m) => m[1]!,
    );
    expect(mods.length).toBeGreaterThan(5);
    for (const k of mods) expect(symbols, k).toContain(`m.${k})`);
  });

  it("every item type has a symbol and a glossary entry", () => {
    for (const it of data.itemList) for (const t of it.tags) if (t !== "bag") expect(icons.has(t) && explained.has(t), `${it.id}: ${t}`).toBe(true);
  });
});
