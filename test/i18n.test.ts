import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLocales, describeHero, describeItem } from "@backpack-space/core";
import { ROOT, loadGameData } from "@backpack-space/core/node";

const data = loadGameData();
const en = JSON.parse(readFileSync(join(ROOT, "data", "locales", "en.json"), "utf8")) as Record<string, string>;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("languages", () => {
  it("ships English and German, German complete", () => {
    expect(data.locales.languages.map((l) => l.id)).toEqual(["en", "de"]);
    expect(data.locales.missing.de).toEqual([]);
    expect(data.locales.unused.de).toEqual([]);
  });

  it("writes every item and hero text in every language without leftover keys or placeholders", () => {
    for (const l of data.locales.languages) {
      const tr = data.locales.get(l.id);
      for (const it of data.itemList) {
        const text = [tr.item(it.id), ...describeItem(it, data, tr)].join(" ");
        expect(text, `${l.id} ${it.id}`).not.toMatch(/[{}]|rules\.|noun\.|undefined/);
      }
      for (const h of data.heroList) expect(describeHero(h, data, tr).join(" ")).not.toMatch(/[{}]|rules\.|undefined/);
      for (const t of data.glossary.terms) expect(tr.termText(t.id), `${l.id} ${t.id}`).not.toMatch(/[{}]/);
    }
  });

  it("uses the language's decimal mark and its words", () => {
    const de = data.locales.get("de");
    const it = data.itemList.find((i) => i.cooldown !== undefined && !Number.isInteger(i.cooldown) && i.damage)!;
    expect(describeItem(it, data, de).join(" ")).toContain(`alle ${String(it.cooldown).replace(".", ",")} s`);
    expect(describeItem(data.items.get("mining_pick")!, data, de)[0]).toBe("4–6 Schaden pro Treffer, alle 2,6 s: 1,5–2,3 Schaden pro Sekunde.");
    expect(describeItem(data.items.get("scrap_metal")!, data, de).join(" ")).toMatch(/^Kampfbeginn: erhalte \d+ Schild\.$/);
  });

  it("falls back to English for a missing text and to the key for an unknown one", () => {
    const de = data.locales.get("de");
    expect(data.locales.get("xx").lang).toBe("en");
    expect(de.t("no.such.key")).toBe("no.such.key");
  });

  it("picks the device language when the game has it, English otherwise", () => {
    expect(data.locales.match(["de-AT", "en-US"])).toBe("de");
    expect(data.locales.match(["fr-FR", "de-DE"])).toBe("de");
    expect(data.locales.match(["fr-FR", "ja"])).toBe("en");
    expect(data.locales.match([])).toBe("en");
  });

  it("rejects a translation whose placeholders differ from English", () => {
    const problems: string[] = [];
    buildLocales(
      { "en.json": en, "fr.json": { "language.name": "Français", "ui.round": "MANCHE" } },
      { rules: data.rules, heroList: data.heroList, itemList: data.itemList, glossary: data.glossary },
      problems,
    );
    expect(problems.join("\n")).toMatch(/fr\.json ui\.round: placeholders/);
  });

  it("has an English text for every key the client asks for", () => {
    const known = (k: string) => k in en || data.locales.get("en").has(k);
    for (const f of files(join(ROOT, "apps", "client", "src"))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bt\("([a-z]\w*\.[\w.]+)"/g)) expect(known(m[1]!), `${f}: ${m[1]}`).toBe(true);
      // no hard-coded words on screen: texts go through t()
      expect(src.match(/\b(txt|pillButton|toast)\((["'`])[A-Za-z]{2}|\bline: ["'`][A-Za-z]{2}/g), f).toBeNull();
      for (const m of src.matchAll(/"((?:ui|toast)\.[\w.]+)"/g)) expect(known(m[1]!), `${f}: ${m[1]}`).toBe(true);
    }
  });
});
