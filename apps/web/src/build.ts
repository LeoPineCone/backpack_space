/**
 * The website (WEB-01 to WEB-06, docs/website.md): static pages built from templates (pages.ts) and language files
 * (`apps/web/locales/<lang>.json`, one per language; a new file is a new language). The look comes from
 * `data/theme.json`, fonts and pictures are copied from the game, and no page loads anything from another server.
 *
 * A text or a fact in `site.json` with `[[TODO: ...]]` is a placeholder: the preview shows it marked, a production
 * build fails while one is left, so a placeholder cannot go live by accident.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGameData } from "@backpack-space/core/node";
import { PAGES, render, type Site } from "./pages.js";

export const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(WEB, "..", "..");
export const TODO = /\[\[TODO:[^\]]*\]\]/g;

export interface BuildResult {
  out: string;
  languages: string[];
  files: string[];
  /** every placeholder left, as "file: text" */
  placeholders: string[];
}

export function languages(): string[] {
  return readdirSync(join(WEB, "locales"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));
}

export function texts(lang: string): Record<string, string> {
  return JSON.parse(readFileSync(join(WEB, "locales", `${lang}.json`), "utf8")) as Record<string, string>;
}

/** Builds the site into `out`. `production`: throws while a placeholder is left. */
export function buildSite(out: string, opts: { production?: boolean } = {}): BuildResult {
  const data = loadGameData();
  const theme = JSON.parse(readFileSync(join(ROOT, "data", "theme.json"), "utf8")) as { palette: Record<string, string>; ui: Record<string, string> };
  const facts = JSON.parse(readFileSync(join(WEB, "site.json"), "utf8")) as Site["facts"];
  const langs = languages();
  const en = texts("en");

  rmSync(out, { recursive: true, force: true });
  const files: string[] = [];
  const write = (rel: string, content: string) => {
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    writeFileSync(join(out, rel), content);
    files.push(rel);
  };
  const copy = (from: string, rel: string) => {
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    copyFileSync(from, join(out, rel));
    files.push(rel);
  };

  // fonts and pictures from the game, so the site looks like it and loads nothing from elsewhere
  const fonts = join(ROOT, "apps", "client", "src", "fonts");
  for (const f of readdirSync(fonts).filter((f) => f.endsWith(".woff2"))) copy(join(fonts, f), `assets/fonts/${f}`);
  const art = join(ROOT, "apps", "client", "art");
  for (const h of data.heroList) copy(join(art, "heroes", `${h.id}.webp`), `assets/heroes/${h.id}.webp`);
  copy(join(art, "space.jpg"), "assets/space.jpg");

  const colors = Object.fromEntries(Object.entries(theme.ui).map(([job, name]) => [job, theme.palette[name] ?? name]));
  for (const lang of langs) {
    const t = { ...en, ...texts(lang) };
    const tr = data.locales.get(lang);
    const site: Site = {
      lang,
      languages: langs.map((l) => ({ id: l, name: texts(l)["language.name"] ?? l })),
      t: (k) => t[k] ?? k,
      facts,
      colors,
      heroes: data.heroList.map((h) => ({ id: h.id, name: tr.t(`hero.${h.id}.name`), title: tr.t(`hero.${h.id}.title`), focus: tr.t(`hero.${h.id}.focus`) })),
    };
    for (const page of PAGES) write(page === "home" ? `${lang}/index.html` : `${lang}/${page}/index.html`, render(site, page));
  }
  // the root picks the visitor's language, English otherwise
  write("index.html", rootPage(langs));

  const placeholders = files
    .filter((f) => f.endsWith(".html"))
    .flatMap((f) => [...readFileSync(join(out, f), "utf8").matchAll(TODO)].map((m) => `${f}: ${m[0]}`));
  if (opts.production && placeholders.length)
    throw new Error(`placeholders left, the production build stops:\n${[...new Set(placeholders.map((p) => p.replace(/^[^:]+: /, "")))].join("\n")}`);
  return { out, languages: langs, files, placeholders };
}

function rootPage(langs: string[]): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backpack Space</title>
<script>
  (function () {
    var have = ${JSON.stringify(langs)};
    var want = (navigator.languages || [navigator.language || "en"]).map(function (l) { return String(l).slice(0, 2).toLowerCase(); });
    var lang = want.find(function (l) { return have.indexOf(l) >= 0; }) || "en";
    location.replace("/" + lang + "/");
  })();
</script>
<noscript><meta http-equiv="refresh" content="0; url=/en/"></noscript>
</head><body>${langs.map((l) => `<a href="/${l}/">${l}</a>`).join(" ")}</body></html>
`;
}
