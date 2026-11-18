import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSite, languages, texts } from "../apps/web/src/build";
import { PAGES } from "../apps/web/src/pages";

const out = mkdtempSync(join(tmpdir(), "web-"));
const site = buildSite(out);
const html = site.files.filter((f) => f.endsWith(".html"));
const read = (f: string) => readFileSync(join(out, f), "utf8");

describe("website (WEB-01 to WEB-06)", () => {
  it("builds every page in English and German, from language files with the same keys", () => {
    expect(site.languages).toEqual(["en", "de"]);
    for (const lang of site.languages) for (const p of PAGES) expect(site.files).toContain(p === "home" ? `${lang}/index.html` : `${lang}/${p}/index.html`);
    const en = Object.keys(texts("en")).sort();
    for (const l of languages()) expect(Object.keys(texts(l)).sort(), l).toEqual(en);
    expect(read("de/index.html")).toContain('<html lang="de">');
    expect(read("de/index.html")).toContain("Venn");
  });

  it("loads nothing from another server: every picture, font, style and script is its own", () => {
    for (const f of html) {
      const src = read(f);
      const loads = [...src.matchAll(/\b(?:src|srcset)="([^"]+)"|<link[^>]+href="([^"]+)"|url\(([^)]+)\)|@import\s+"([^"]+)"/g)].map(
        (m) => m[1] ?? m[2] ?? m[3] ?? m[4]!,
      );
      for (const u of loads) expect(u, `${f}: ${u}`).toMatch(/^\/(?!\/)/);
    }
  });

  it("links the pages the app opens from its settings (privacy and terms per language)", () => {
    for (const lang of site.languages) for (const p of ["privacy", "terms"]) expect(site.files).toContain(`${lang}/${p}/index.html`);
  });

  it("states on the support page that an account deletion can be requested (WEB-04, ACC-08)", () => {
    expect(read("en/support/index.html")).toContain('id="delete"');
    expect(read("de/support/index.html")).toContain("Konto löschen");
  });

  it("shows placeholders marked, and the production build refuses them", () => {
    expect(site.placeholders.length).toBeGreaterThan(0);
    expect(read("en/imprint/index.html")).toContain('<mark class="todo">[[TODO:');
    expect(() => buildSite(mkdtempSync(join(tmpdir(), "web-")), { production: true })).toThrow(/placeholders left/);
  });
});
