/**
 * Languages. One build ships every language; the player's language picks the translator.
 *
 * - `data/locales/<lang>.json` holds one flat table per language: key -> text.
 *   English (`en.json`) is the source language and the fallback for every missing text.
 * - Game content is not repeated in `en.json`: English item names, hero texts and glossary terms come from
 *   the data files themselves (`item.<id>`, `hero.<id>.name|title|focus`, `term.<id>`, `term.<id>.text`, `group.<id>`).
 *   Other languages translate them in their own file. Term words of English and German come from `data/glossary.json`.
 * - Placeholders: `{n}` takes a parameter; `{tag|form}` takes a type id and writes that type's word in the given
 *   grammatical form (`noun.<type>.<form>`, for example `noun.weapon.other` = "weapons"), so each language can
 *   decline its words the way its sentences need.
 * - Numbers are written with the language's decimal mark (`number.decimal`).
 *
 * Pure and deterministic, like the rest of the core.
 */
import { z } from "zod";
import type { Glossary } from "./glossary.js";
import type { HeroData, Rules } from "./schema.js";

export const SOURCE_LANG = "en";

export type Params = Record<string, string | number>;

export interface Translator {
  readonly lang: string;
  /** the language's own name, e.g. "Deutsch" */
  readonly name: string;
  /** the text for a key; falls back to English, then to the key itself */
  t(key: string, params?: Params): string;
  has(key: string): boolean;
  /** a number with the language's decimal mark */
  num(n: number): string;
  /** "+3" / "-2" */
  signed(n: number): string;
  /** "a, b and c" */
  list(items: readonly string[]): string;
  item(id: string): string;
  term(id: string): string;
  termText(id: string): string;
}

export interface Language { id: string; name: string }

export interface Locales {
  /** every shipped language, English first */
  languages: Language[];
  get(lang: string): Translator;
  /** the language for a list of preferred language tags (e.g. navigator.languages), English if none matches */
  match(preferred: readonly string[]): string;
  /** per language: texts that are missing and fall back to English */
  missing: Record<string, string[]>;
  /** per language: keys that English does not have (left over after a rename) */
  unused: Record<string, string[]>;
}

export const LocaleFile = z.record(z.string(), z.string());

/** Placeholder names in a text: "{n} {tag|other}" -> ["n", "tag"] */
const placeholders = (s: string) => [...s.matchAll(/\{([a-zA-Z]+)(?:\|[a-zA-Z]+)?\}/g)].map((m) => m[1]!).sort();
/** Noun forms used in a text: "{tag|other}" -> ["other"] */
const forms = (s: string) => [...s.matchAll(/\{[a-zA-Z]+\|([a-zA-Z]+)\}/g)].map((m) => m[1]!);

/** Keys for the type words (`noun.<type>.<form>`): every tag plus "crafted" and "any". */
export const NOUN_TYPES = ["weapon", "armor", "accessory", "pet", "food", "mechanical", "organic", "crafted", "melee", "ranged", "any"] as const;

interface ContentSource {
  rules: Rules;
  heroList: readonly HeroData[];
  itemList: readonly { id: string; name: string }[];
  glossary: Glossary;
}

function rulesValue(rules: Rules, path: string): unknown {
  let v: unknown = rules;
  for (const k of path.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

/** The English texts that come from the data files instead of en.json. */
function contentTexts(src: ContentSource): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of src.itemList) out[`item.${it.id}`] = it.name;
  for (const h of src.heroList) { out[`hero.${h.id}.name`] = h.name; out[`hero.${h.id}.title`] = h.title; out[`hero.${h.id}.focus`] = h.focus; }
  for (const g of src.glossary.groups) out[`group.${g.id}`] = g.title;
  for (const t of src.glossary.terms) { out[`term.${t.id}`] = t.en; out[`term.${t.id}.text`] = t.source; }
  return out;
}

/**
 * Builds the translators. `files` maps "en.json", "de.json", ... to their parsed content.
 * Broken translations (wrong placeholders, missing word forms, no language name) are appended to `problems`;
 * missing and left-over texts are only reported in `missing` / `unused`, since English stands in for them.
 */
export function buildLocales(files: Record<string, unknown>, src: ContentSource, problems: string[]): Locales {
  const tables = new Map<string, Record<string, string>>();
  for (const [file, raw] of Object.entries(files)) {
    const lang = file.replace(/^.*\//, "").replace(/\.json$/, "");
    const r = LocaleFile.safeParse(raw);
    if (!r.success) { problems.push(`locales/${file}: expected an object of texts`); continue; }
    tables.set(lang, { ...r.data });
  }
  const en = tables.get(SOURCE_LANG);
  if (!en) { problems.push(`locales: ${SOURCE_LANG}.json is missing`); tables.set(SOURCE_LANG, {}); }
  const content = contentTexts(src);
  for (const k of Object.keys(content)) if (en && k in en) problems.push(`locales/en.json: ${k} comes from the data files, remove it here`);
  Object.assign(tables.get(SOURCE_LANG)!, content);
  // German term words live in the glossary next to the English ones
  const de = tables.get("de");
  if (de) for (const t of src.glossary.terms) de[`term.${t.id}`] ??= t.de;

  const source = tables.get(SOURCE_LANG)!;
  const missing: Record<string, string[]> = {}, unused: Record<string, string[]> = {};
  for (const [lang, table] of tables) {
    if (!table["language.name"]) problems.push(`locales/${lang}.json: "language.name" is missing`);
    if (lang === SOURCE_LANG) continue;
    missing[lang] = Object.keys(source).filter((k) => !(k in table));
    // extra word forms (`noun.<type>.<form>`) are this language's own grammar, not left-overs
    unused[lang] = Object.keys(table).filter((k) => !(k in source) && !(k.startsWith("noun.") && (NOUN_TYPES as readonly string[]).includes(k.split(".")[1]!)));
    for (const [k, v] of Object.entries(table)) {
      const want = source[k];
      if (want === undefined) continue;
      if (placeholders(v).join() !== placeholders(want).join()) problems.push(`locales/${lang}.json ${k}: placeholders {${placeholders(v).join("}, {")}} but English has {${placeholders(want).join("}, {")}}`);
    }
  }
  // every word form a language's sentences ask for must exist for every type
  for (const [lang, table] of tables) {
    const used = new Set<string>();
    for (const k of Object.keys(source)) for (const f of forms(table[k] ?? source[k]!)) used.add(f);
    for (const f of used) for (const n of NOUN_TYPES) {
      if (table[`noun.${n}.${f}`] === undefined) problems.push(`locales/${lang}.json: noun.${n}.${f} is missing (used by a sentence)`);
    }
  }

  const cache = new Map<string, Translator>();
  const make = (lang: string): Translator => {
    const table = tables.get(lang) ?? source;
    const decimal = table["number.decimal"] ?? source["number.decimal"] ?? ".";
    const num = (n: number) => { const s = String(n); return decimal === "." ? s : s.replace(".", decimal); };
    const raw = (key: string) => table[key] ?? source[key];
    const fill = (text: string, params: Params = {}) => text.replace(/\{([a-zA-Z]+)(?:\|([a-zA-Z]+))?\}/g, (whole, name: string, form?: string) => {
      const v = params[name];
      if (v === undefined) return whole;
      if (form) return table[`noun.${v}.${form}`] ?? table[`noun.${v}.one`] ?? source[`noun.${v}.${form}`] ?? String(v);
      return typeof v === "number" ? num(v) : v;
    });
    const tr: Translator = {
      lang,
      name: raw("language.name") ?? lang,
      t: (key, params) => { const s = raw(key); return s === undefined ? key : fill(s, params); },
      has: (key) => raw(key) !== undefined,
      num,
      signed: (n) => `${n > 0 ? "+" : ""}${num(n)}`,
      list: (xs) => (xs.length < 2 ? xs.join("") : tr.t("list.and", { a: xs.slice(0, -1).join(tr.t("list.sep")), b: xs[xs.length - 1]! })),
      item: (id) => raw(`item.${id}`) ?? id,
      term: (id) => raw(`term.${id}`) ?? id,
      termText: (id) => {
        const s = raw(`term.${id}.text`);
        if (s === undefined) return "";
        return s.replace(/\{([a-zA-Z.]+)\}/g, (_, path: string) => {
          if (path === "phases") return src.rules.battle.phases.map((p) => tr.term(p.id)).join(", ");
          if (path === "supernova") return tr.term(src.rules.battle.supernova.id);
          const v = rulesValue(src.rules, path);
          return typeof v === "number" ? num(v) : String(v);
        });
      },
    };
    return tr;
  };
  const languages = [...tables.keys()].sort((a, b) => (a === SOURCE_LANG ? -1 : b === SOURCE_LANG ? 1 : a.localeCompare(b))).map((id) => ({ id, name: tables.get(id)!["language.name"] ?? id }));
  return {
    languages,
    get: (lang) => { let t = cache.get(lang); if (!t) { t = make(tables.has(lang) ? lang : SOURCE_LANG); cache.set(lang, t); } return t; },
    match: (preferred) => {
      for (const p of preferred) { const base = p.toLowerCase().split(/[-_]/)[0]!; if (tables.has(base)) return base; }
      return SOURCE_LANG;
    },
    missing, unused,
  };
}
