/**
 * Turns effect data into rows of symbols ("clock 4.5 -> heal 8, regen 1") and the keywords that explain them.
 * Like the generated rules text, the symbols come from the effect data, so they cannot disagree with the battle.
 */
import { BUFFS, DEBUFFS, TAGS, type Effect, type GameData, type HeroData, type ItemDef } from "@backpack-space/core";
import { tr } from "./i18n";

export interface Chip {
  icon: string;
  text?: string;
  /** trigger = outlined capsule; buff = light tile; debuff = dark tile; plain = bare symbol */
  kind: "trigger" | "buff" | "debuff" | "plain";
}
export interface Row { when: Chip[]; then: Chip[] }
export interface Keyword { icon: string; word: string; text: string }

const num = (n: number) => String(Math.round(n * 10) / 10);

function whenChips(e: Effect, data: GameData, cooldown?: number): Chip[] {
  const out: Chip[] = [];
  const t = (icon: string, text?: string): Chip => ({ icon, text, kind: "trigger" });
  switch (e.on) {
    case "start": out.push(t("start")); break;
    case "use": out.push(t("clock", cooldown !== undefined ? num(cooldown) : undefined)); break;
    case "hit": out.push(t("hit")); break;
    case "attacked": out.push(t("attacked")); break;
    case "phase": out.push(t("phase", e.phase ? phaseName(data, e.phase) : undefined)); break;
    case "starUse": out.push(t("star"), t(e.tag ?? "any")); break;
    case "shipUse": out.push(t("ship"), t(e.tag ?? "any")); break;
    case "lowHp": out.push(t("lowHp", `${data.rules.battle.lowHpPct}%`)); break;
    case "passive":
      if (e.to === "self") out.push(t("self"));
      else if (e.to === "hero") out.push(t("hero"));
      else if (e.to === "inside") out.push(t("bag"));
      else if (e.to === "stars") out.push(t("star"), t(e.tag ?? "any"));
      else out.push(t("ship"), t(e.tag ?? "any"));
      break;
  }
  if (e.if?.chance !== undefined) out.push(t("chance", `${e.if.chance}%`));
  if (e.if?.phase) out.push(t("phase", e.if.phase.map((p) => phaseName(data, p)).join("/")));
  if (e.if?.hpBelow !== undefined) out.push(t("lowHp", `${e.if.hpBelow}%`));
  return out;
}

function thenChips(e: Effect): Chip[] {
  const out: Chip[] = [];
  const n = e.n !== undefined ? num(e.n) : undefined;
  if (e.gain) out.push({ icon: e.gain, text: n, kind: "buff" });
  if (e.inflict) out.push({ icon: e.inflict, text: n, kind: "debuff" });
  if (e.do === "damage") out.push({ icon: "damage", text: n, kind: "debuff" });
  if (e.do === "heal") out.push({ icon: "heal", text: n, kind: "buff" });
  if (e.do === "cleanse") out.push({ icon: "cleanse", text: n, kind: "buff" });
  if (e.do === "strip") out.push({ icon: "strip", text: n, kind: "debuff" });
  if (e.do === "energy") out.push({ icon: "energy", text: `+${n}`, kind: "buff" });
  const m = e.mod;
  if (m) {
    if (m.damage) out.push({ icon: "damage", text: `${m.damage > 0 ? "+" : ""}${num(m.damage)}`, kind: "buff" });
    if (m.speed) out.push({ icon: "speed", text: `${m.speed > 0 ? "+" : ""}${num(m.speed)}%`, kind: "buff" });
    if (m.crit) out.push({ icon: "crit", text: `+${num(m.crit)}%`, kind: "buff" });
    if (m.maxHp) out.push({ icon: "maxHp", text: `+${num(m.maxHp)}`, kind: "buff" });
    if (m.ready) out.push({ icon: "ready", text: `${num(m.ready)}%`, kind: "buff" });
    if (m.energy) out.push({ icon: "energy", text: `${m.energy > 0 ? "+" : ""}${num(m.energy)}`, kind: m.energy < 0 ? "buff" : "debuff" });
    if (m.energyRegen) out.push({ icon: "energyRegen", text: `+${num(m.energyRegen)}`, kind: "buff" });
  }
  const per = e.per;
  if (per) {
    const div = per.div && per.div !== 1 ? `/${num(per.div)}` : "×";
    if (per.stars) { out.push({ icon: "star", text: div, kind: "plain" }); if (per.stars !== "any") out.push({ icon: per.stars, kind: "plain" }); }
    else if (per.ship) { out.push({ icon: "ship", text: div, kind: "plain" }, { icon: per.ship, kind: "plain" }); }
    else if (per.buff) out.push({ icon: per.buff, text: div, kind: "plain" });
    else if (per.debuff) out.push({ icon: per.debuff, text: div, kind: "plain" });
  }
  return out;
}

const phaseName = (_data: GameData, id: string) => tr().term(id);

/** Groups effects that share a trigger into one row. */
export function effectRows(effects: readonly Effect[], data: GameData, cooldown?: number, first?: Row): Row[] {
  const rows: Row[] = first ? [first] : [];
  const byKey = new Map<string, Row>();
  if (first) byKey.set(JSON.stringify(first.when), first);
  for (const e of effects) {
    const when = whenChips(e, data, cooldown);
    const key = JSON.stringify(when);
    let row = byKey.get(key);
    if (!row) { row = { when, then: [] }; byKey.set(key, row); rows.push(row); }
    row.then.push(...thenChips(e));
  }
  return rows.filter((r) => r.then.length > 0);
}

export function itemRows(def: ItemDef, data: GameData): Row[] {
  let first: Row | undefined;
  if (def.cooldown !== undefined) {
    first = { when: [{ icon: "clock", text: num(def.cooldown), kind: "trigger" }], then: [] };
    if (def.damage) first.then.push({ icon: "damage", text: def.damage[0] === def.damage[1] ? num(def.damage[0]) : `${num(def.damage[0])}–${num(def.damage[1])}`, kind: "debuff" });
    if (def.range) first.then.push({ icon: def.range, kind: "plain" });
    if (def.energy !== undefined) first.then.push({ icon: "energy", text: `-${num(def.energy)}`, kind: "plain" });
  }
  return effectRows(def.effects, data, def.cooldown, first);
}

export function heroRows(hero: HeroData, data: GameData): Row[] { return effectRows(hero.effects, data); }

/** Every keyword with its symbol and one short sentence, from the glossary (data/glossary.json), in the current language. Numbers come from the rules. */
export function keywords(data: GameData): Map<string, Keyword> {
  const k = new Map<string, Keyword>();
  for (const t of data.glossary.terms) if (t.icon) k.set(t.icon, { icon: t.icon, word: tr().term(t.id), text: tr().termText(t.id) });
  return k;
}

/** The keywords that appear in these rows (and types), in order of appearance. */
export function keywordsIn(rows: readonly Row[], tags: readonly string[], all: Map<string, Keyword>, extra: readonly string[] = []): Keyword[] {
  const seen = new Set<string>(), out: Keyword[] = [];
  const take = (icon: string) => { const kw = all.get(icon); if (kw && !seen.has(icon)) { seen.add(icon); out.push(kw); } };
  for (const t of tags) take(t);
  for (const r of rows) { for (const c of r.when) take(c.icon); for (const c of r.then) take(c.icon); }
  for (const e of extra) take(e);
  return out;
}

/** `title` is a text key (data/locales) */
export const GLOSSARY_GROUPS: { title: string; icons: string[] }[] = [
  { title: "ui.group.types", icons: [...TAGS, "bag", "crafted"] },
  { title: "ui.group.buffs", icons: [...BUFFS] },
  { title: "ui.group.debuffs", icons: [...DEBUFFS] },
  { title: "ui.group.effects", icons: ["damage", "heal", "cleanse", "strip", "speed", "crit", "maxHp", "ready", "energy", "energyRegen", "melee", "ranged"] },
  { title: "ui.group.when", icons: ["clock", "start", "hit", "attacked", "phase", "lowHp", "chance"] },
  { title: "ui.group.who", icons: ["self", "star", "ship", "hero"] },
  { title: "ui.group.merge", icons: ["merge", "radar", "lock"] },
];
