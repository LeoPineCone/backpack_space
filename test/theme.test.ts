import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "@backpack-space/core/node";

const theme = JSON.parse(readFileSync(join(ROOT, "data", "theme.json"), "utf8"));
const HEX = /^#[0-9a-f]{6}$/;
const entries = (o: Record<string, unknown>) => Object.entries(o).filter(([k]) => !k.startsWith("$"));

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}
const ui = (name: string): string => theme.palette[theme.ui[name]];

describe("data/theme.json", () => {
  it("holds only #rrggbb colours", () => {
    for (const group of ["palette", "rarity", "tagFill"]) for (const [k, v] of entries(theme[group])) expect(v, `${group}.${k}`).toMatch(HEX);
  });
  it("gives every UI job a palette colour and every button a UI colour", () => {
    for (const [k, v] of entries(theme.ui)) expect(theme.palette[v as string], `ui.${k} -> ${v}`).toBeDefined();
    for (const kind of ["primary", "icon", "secondary"]) for (const [k, v] of entries(theme.buttons[kind])) expect(theme.ui[v as string], `buttons.${kind}.${k}`).toBeDefined();
  });
  it("keeps text readable", () => {
    expect(contrast(ui("text"), ui("bg"))).toBeGreaterThanOrEqual(7);
    expect(contrast(ui("dim"), ui("panel"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ui("goldInk"), ui("gold"))).toBeGreaterThanOrEqual(7);
    expect(contrast(ui("cyanInk"), ui("cyan"))).toBeGreaterThanOrEqual(7);
  });
});
