/**
 * The glossary: every game term with its English word (used in the game and the code), its German word
 * (for talking about the design) and a short meaning. Source: data/glossary.json.
 * Numbers in the meaning come from the rules ("{status.regen.interval}"), so the glossary cannot disagree with them.
 */
import { z } from "zod";
import { BUFFS, DEBUFFS, RARITIES, TAGS, type Rules } from "./schema.js";

export const GlossaryData = z
  .object({
    groups: z.array(z.object({ id: z.string(), title: z.string() }).strict()).min(1),
    terms: z
      .array(
        z
          .object({
            id: z.string(),
            group: z.string(),
            /** the word in the game, the docs and the code */
            en: z.string(),
            /** the German word, for conversations about the design */
            de: z.string(),
            /** symbol in the client (see apps/client/src/icons.ts) */
            icon: z.string().optional(),
            /** one short sentence; {path.in.rules} is replaced by that rules value, {phases} and {supernova} by the star phase names */
            text: z.string(),
            /** where the term shows up in code and data when the identifier differs from the word */
            code: z.array(z.string()).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type GlossaryData = z.infer<typeof GlossaryData>;

export interface Term {
  id: string;
  group: string;
  en: string;
  de: string;
  icon?: string;
  text: string;
  /** the meaning with its {placeholders}, as written */ source: string;
  code: string[];
}
export interface Glossary {
  groups: GlossaryData["groups"];
  terms: Term[];
  byId: Map<string, Term>;
}

/** Terms the glossary must always contain: everything the effect language and the rules can name. */
export function requiredTerms(rules: Rules): string[] {
  return [
    ...TAGS,
    "bag",
    "crafted",
    "any",
    ...BUFFS,
    ...DEBUFFS,
    ...RARITIES,
    ...rules.battle.phases.map((p) => p.id),
    rules.battle.supernova.id,
    "damage",
    "heal",
    "cleanse",
    "strip",
    "energy",
    "energyRegen",
    "melee",
    "ranged",
    "speed",
    "crit",
    "maxHp",
    "ready",
    "clock",
    "start",
    "hit",
    "attacked",
    "phase",
    "lowHp",
    "chance",
    "self",
    "starred",
    "ship",
    "hero",
    "run",
    "round",
    "life",
    "gold",
    "shop",
    "backpack",
    "merge",
    "recipe",
    "lock",
    "fight",
    "star",
  ];
}

function lookup(rules: Rules, path: string): unknown {
  if (path === "phases") return rules.battle.phases.map((p) => p.name).join(", ");
  if (path === "supernova") return rules.battle.supernova.name;
  let v: unknown = rules;
  for (const k of path.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

/** Validates the glossary against the rules and fills in the numbers. Problems are appended to `problems`. */
export function buildGlossary(raw: unknown, rules: Rules, problems: string[]): Glossary {
  const r = GlossaryData.safeParse(raw);
  if (!r.success) {
    problems.push(`glossary.json: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    return { groups: [], terms: [], byId: new Map() };
  }
  const groups = new Set(r.data.groups.map((g) => g.id));
  const byId = new Map<string, Term>();
  const terms: Term[] = [];
  for (const t of r.data.terms) {
    if (byId.has(t.id)) problems.push(`glossary: duplicate term ${t.id}`);
    if (!groups.has(t.group)) problems.push(`glossary ${t.id}: unknown group ${t.group}`);
    const text = t.text.replace(/\{([a-zA-Z.]+)\}/g, (_, path: string) => {
      const v = lookup(rules, path);
      if (typeof v !== "number" && typeof v !== "string") {
        problems.push(`glossary ${t.id}: {${path}} is not a rules value`);
        return path;
      }
      return String(v);
    });
    const term: Term = { ...t, text, source: t.text, code: t.code ?? [] };
    byId.set(t.id, term);
    terms.push(term);
  }
  for (const id of requiredTerms(rules)) if (!byId.has(id)) problems.push(`glossary: term ${id} is missing`);
  for (const p of rules.battle.phases) {
    const t = byId.get(p.id);
    if (t && t.en !== p.name) problems.push(`glossary ${p.id}: "${t.en}" but the rules call the phase "${p.name}"`);
  }
  return { groups: r.data.groups, terms, byId };
}
