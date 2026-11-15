/**
 * Turns effect data into rows of symbols ("clock 4.5 -> heal 8, regen 1") and the keywords that explain them.
 * Like the generated rules text, the symbols come from the effect data, so they cannot disagree with the battle.
 */
import { BUFFS, DEBUFFS, TAGS, type Effect, type GameData, type HeroData, type ItemDef } from "@backpack-space/core";

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
  const m = e.mod;
  if (m) {
    if (m.damage) out.push({ icon: "damage", text: `${m.damage > 0 ? "+" : ""}${num(m.damage)}`, kind: "buff" });
    if (m.speed) out.push({ icon: "speed", text: `${m.speed > 0 ? "+" : ""}${num(m.speed)}%`, kind: "buff" });
    if (m.crit) out.push({ icon: "crit", text: `+${num(m.crit)}%`, kind: "buff" });
    if (m.maxHp) out.push({ icon: "maxHp", text: `+${num(m.maxHp)}`, kind: "buff" });
    if (m.ready) out.push({ icon: "ready", text: `${num(m.ready)}%`, kind: "buff" });
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

const phaseName = (data: GameData, id: string) => (id === data.rules.battle.supernova.id ? data.rules.battle.supernova.name : data.rules.battle.phases.find((p) => p.id === id)?.name ?? id);

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
  }
  return effectRows(def.effects, data, def.cooldown, first);
}

export function heroRows(hero: HeroData, data: GameData): Row[] { return effectRows(hero.effects, data); }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every keyword with its symbol and one short sentence. Numbers come from the rules. */
export function keywords(data: GameData): Map<string, Keyword> {
  const R = data.rules.status, B = data.rules.battle;
  const k = new Map<string, Keyword>();
  const add = (icon: string, word: string, text: string) => k.set(icon, { icon, word, text });
  for (const t of TAGS) add(t, cap(t), "Item type.");
  add("bag", "Bag", "Items can only lie in bags.");
  add("crafted", "Crafted", "Made by combining items.");
  add("any", "Any item", "Every type counts.");
  add("shield", "Shield", "Blocks damage before health.");
  add("regen", "Regen", `Heals every ${R.regen.interval} s, per stack.`);
  add("overclock", "Overclock", `All your items ${R.overclock.speedPct} % faster per stack.`);
  add("power", "Power", "+1 weapon damage per stack.");
  add("spikes", "Spikes", "Weapon hits against you hurt the attacker.");
  add("burn", "Burn", `Damage every ${R.burn.interval} s, then fades by ${R.burn.decay}. Shield stops it.`);
  add("toxin", "Toxin", `Damage every ${R.toxin.interval} s. Ignores Shield.`);
  add("cryo", "Cryo", `Items ${R.cryo.slowPct} % slower per stack. Fades.`);
  add("jam", "Jam", `Weapons miss, ${R.jam.missPct} % per stack. Fades.`);
  add("radiation", "Radiation", `Healing and Shield gain −${R.radiation.reducePct} % per stack.`);
  add("damage", "Damage", "Hurts the enemy.");
  add("heal", "Heal", "Restores health.");
  add("cleanse", "Cleanse", "Removes your debuffs.");
  add("strip", "Break", "Destroys enemy Shield.");
  add("speed", "Speed", "Shorter cooldown.");
  add("crit", "Crit", `Chance for ×${B.critMult} damage.`);
  add("maxHp", "Max health", "More health for the hero.");
  add("ready", "Charged", "Part of the first cooldown is already done.");
  add("clock", "Cooldown", "Seconds between uses.");
  add("start", "Fight start", "Once, when the fight begins.");
  add("hit", "On hit", "When this weapon hits.");
  add("attacked", "When hit", "When a weapon hits you.");
  add("phase", "Star phase", `The star ages: ${B.phases.map((p) => p.name).join(", ")}, then ${B.supernova.name}.`);
  add("lowHp", "Low health", `Once below ${B.lowHpPct} % health.`);
  add("chance", "Chance", "Happens only sometimes.");
  add("hero", "Hero", "Applies to the hero.");
  add("star", "Star", "The items lying on this item's stars.");
  add("ship", "Backpack", "Every item in your backpack.");
  add("self", "This item", "Applies to the item itself.");
  return k;
}

/** The keywords that appear in these rows (and types), in order of appearance. */
export function keywordsIn(rows: readonly Row[], tags: readonly string[], all: Map<string, Keyword>): Keyword[] {
  const seen = new Set<string>(), out: Keyword[] = [];
  const take = (icon: string) => { const kw = all.get(icon); if (kw && !seen.has(icon)) { seen.add(icon); out.push(kw); } };
  for (const t of tags) take(t);
  for (const r of rows) { for (const c of r.when) take(c.icon); for (const c of r.then) take(c.icon); }
  return out;
}

export const GLOSSARY_GROUPS: { title: string; icons: string[] }[] = [
  { title: "TYPES", icons: [...TAGS, "bag", "crafted"] },
  { title: "BUFFS", icons: [...BUFFS] },
  { title: "DEBUFFS", icons: [...DEBUFFS] },
  { title: "EFFECTS", icons: ["damage", "heal", "cleanse", "strip", "speed", "crit", "maxHp", "ready"] },
  { title: "WHEN", icons: ["clock", "start", "hit", "attacked", "phase", "lowHp", "chance"] },
  { title: "WHO", icons: ["self", "star", "ship", "hero"] },
];
