/**
 * Rules text generated from the effect data, so the text can never disagree with what the battle does.
 * The sentence parts come from the language files (`rules.*` in data/locales/<lang>.json); English is the default.
 */
import type { GameData, ItemDef } from "./gamedata.js";
import type { Translator } from "./i18n.js";
import type { Effect, HeroData, Mod } from "./schema.js";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function modText(m: Mod, tr: Translator): string {
  const parts: string[] = [];
  if (m.damage) parts.push(tr.t("rules.mod.damage", { n: tr.signed(m.damage) }));
  if (m.speed) parts.push(tr.t(m.speed > 0 ? "rules.mod.faster" : "rules.mod.slower", { n: Math.abs(m.speed) }));
  if (m.crit) parts.push(tr.t("rules.mod.crit", { n: m.crit }));
  if (m.maxHp) parts.push(tr.t("rules.mod.maxHp", { n: m.maxHp }));
  if (m.ready) parts.push(tr.t("rules.mod.ready", { n: m.ready }));
  if (m.energy) parts.push(tr.t("rules.mod.energy", { n: tr.signed(m.energy) }));
  if (m.energyRegen) parts.push(tr.t("rules.mod.energyRegen", { n: m.energyRegen }));
  return parts.join(tr.t("list.sep"));
}

interface Part {
  when: string;
  /** the whole action, e.g. "gain 6 Shield" */
  action: string;
  /** gain / inflict: what is gained, e.g. "6 Shield"; such actions can share one verb */
  object?: string;
  verb?: string;
  perText: string;
  condText: string;
  /** the action without its number, e.g. "gain:shield" */
  base?: string;
  n?: number;
}

const phaseName = (id: string, tr: Translator) => tr.term(id);

function parts(e: Effect, data: GameData, tr: Translator): Part {
  const STATUS = (id: string) => tr.term(id);
  const per = e.per;
  let perText = "";
  if (per) {
    const div = per.div && per.div !== 1 ? per.div : undefined;
    const key = per.stars ? "rules.per.stars" : per.ship ? "rules.per.ship" : per.buff ? "rules.per.buff" : per.debuff ? "rules.per.debuff" : undefined;
    if (key) {
      perText = ` ${tr.t(div ? `${key}.n` : key, { n: div ?? 1, tag: per.stars ?? per.ship ?? "any", status: STATUS(per.buff ?? per.debuff ?? "") })}`;
      if (per.max) perText += ` ${tr.t("rules.per.max", { n: per.max })}`;
    }
  }
  const cond: string[] = [];
  if (e.if?.chance !== undefined) cond.push(tr.t("rules.if.chance", { n: e.if.chance }));
  if (e.if?.phase) cond.push(tr.t("rules.if.phase", { phases: e.if.phase.map((p) => phaseName(p, tr)).join("/") }));
  if (e.if?.hpBelow !== undefined) cond.push(tr.t("rules.if.hpBelow", { n: e.if.hpBelow }));
  const condText = cond.length ? ` (${cond.join(tr.t("list.sep"))})` : "";
  if (e.on === "passive") {
    const tag = e.tag ?? "any";
    const who = e.to === "self" ? tr.t("rules.who.self") : e.to === "hero" ? tr.t("rules.who.hero") : e.to === "stars" ? tr.t("rules.who.stars", { tag }) : tr.t("rules.who.ship", { tag });
    return { when: who, action: modText(e.mod!, tr), perText, condText };
  }
  const n = e.n ?? 0;
  const status = e.gain ?? e.inflict;
  const verb = e.gain ? "rules.do.gain" : e.inflict ? "rules.do.inflict" : undefined;
  const object = status ? tr.t("rules.amount", { n, status: STATUS(status) }) : undefined;
  const action = verb ? tr.t(verb, { what: object! }) : tr.t(`rules.do.${e.do ?? "damage"}`, { n });
  const tag = e.tag ?? "any";
  const when = e.on === "start" ? tr.t("rules.when.start") : e.on === "use" ? tr.t("rules.when.use") : e.on === "hit" ? tr.t("rules.when.hit") : e.on === "attacked" ? tr.t("rules.when.attacked")
    : e.on === "lowHp" ? tr.t("rules.when.lowHp", { n: data.rules.battle.lowHpPct })
    : e.on === "phase" ? (e.phase ? tr.t("rules.when.phase", { phase: phaseName(e.phase, tr) }) : tr.t("rules.when.everyPhase"))
    : e.on === "starUse" ? tr.t("rules.when.starUse", { tag }) : tr.t("rules.when.shipUse", { tag });
  const base = verb ? `${verb}:${status}` : e.do;
  return { when, action, object, verb, perText, condText, base, n };
}

const english = (data: GameData) => data.locales.get("en");

export function describeEffect(e: Effect, data: GameData, tr: Translator = english(data)): string {
  const p = parts(e, data, tr);
  return tr.t("rules.sentence", { when: p.when, what: `${p.action}${p.perText}`, cond: p.condText });
}

/**
 * One sentence per trigger: effects that share a trigger (and the same condition) are joined
 * ("Battle start: gain 2 Spikes and 6 Shield."). For items with a cooldown, "On use" becomes "Every 3 s".
 */
function describeEffects(effects: readonly Effect[], data: GameData, tr: Translator, useLabel?: string): string[] {
  const groups: { key: string; when: string; condText: string; actions: string[]; last?: Part }[] = [];
  for (const e of effects) {
    const p = parts(e, data, tr);
    const when = e.on === "use" && useLabel ? useLabel : p.when;
    const key = `${when}|${p.condText}`;
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, when, condText: p.condText, actions: [] }; groups.push(g); }
    const prev = g.last;
    if (prev && prev.base && prev.base === p.base && !prev.perText && p.perText) {
      // "heal 8, +3 per starred food" instead of "heal 8 and heal 3 per starred food"
      g.actions[g.actions.length - 1] += `${tr.t("list.sep")}${tr.t("rules.extra", { n: p.n ?? 0 })}${p.perText}`;
    } else if (prev && p.verb && prev.verb === p.verb) {
      // "gain 2 Spikes and 6 Shield" instead of "gain 2 Spikes and gain 6 Shield"
      g.actions.push(`${p.object}${p.perText}`);
    } else g.actions.push(`${p.action}${p.perText}`);
    g.last = p;
  }
  return groups.map((g) => tr.t("rules.sentence", { when: g.when, what: tr.list(g.actions), cond: g.condText }));
}

export function describeItem(it: ItemDef, data: GameData, tr: Translator = english(data)): string[] {
  const lines: string[] = [];
  const hasUse = it.effects.some((e) => e.on === "use");
  if (it.damage) {
    lines.push(tr.t("rules.item.damage", { min: it.damage[0], max: it.damage[1], s: it.cooldown ?? 0 }));
    if (it.range) lines.push(tr.t("rules.item.weapon", { range: tr.term(it.range), n: it.energy ?? 0 }));
  }
  else if (it.cooldown && !hasUse) lines.push(tr.t("rules.item.activates", { s: it.cooldown }));
  const useLabel = it.cooldown === undefined ? undefined : it.damage ? tr.t("rules.use.attack") : tr.t("rules.use.every", { s: it.cooldown });
  lines.push(...describeEffects(it.effects, data, tr, useLabel));
  return lines;
}
export function describeHero(h: HeroData, data: GameData, tr: Translator = english(data)): string[] {
  const lines = describeEffects(h.effects, data, tr);
  if (h.supernovaResist) lines.push(tr.t("rules.hero.supernovaResist", { n: h.supernovaResist, supernova: tr.term(data.rules.battle.supernova.id) }));
  if (h.craftGold) lines.push(tr.t("rules.hero.craftGold", { n: h.craftGold }));
  if (h.hpBonus) lines.push(tr.t("rules.hero.hp", { n: tr.signed(h.hpBonus) }));
  return lines;
}
export const tagLabel = (t: string) => cap(t);
