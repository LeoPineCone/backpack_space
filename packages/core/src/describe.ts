/** Rules text generated from the effect data, so the text can never disagree with what the battle does. */
import type { GameData, ItemDef } from "./gamedata.js";
import type { Effect, HeroData, Mod } from "./schema.js";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STATUS: Record<string, string> = { shield: "Shield", regen: "Regen", overclock: "Overclock", power: "Power", spikes: "Spikes", burn: "Burn", toxin: "Toxin", cryo: "Cryo", jam: "Jam", radiation: "Radiation" };
const tagName = (t: string) => (t === "any" ? "item" : t === "crafted" ? "crafted item" : t === "pet" ? "pet" : t === "food" ? "food" : t === "weapon" ? "weapon" : t === "armor" ? "armor" : t === "accessory" ? "accessory" : `${t} item`);
const plural = (t: string) => { const n = tagName(t); return n === "food" || n === "armor" ? n : n.endsWith("y") ? n.slice(0, -1) + "ies" : n + "s"; };

function modText(m: Mod): string {
  const parts: string[] = [];
  if (m.damage) parts.push(`${m.damage > 0 ? "+" : ""}${m.damage} damage`);
  if (m.speed) parts.push(`${Math.abs(m.speed)} % ${m.speed > 0 ? "faster" : "slower"}`);
  if (m.crit) parts.push(`+${m.crit} % crit`);
  if (m.maxHp) parts.push(`+${m.maxHp} max health`);
  if (m.ready) parts.push(`starts ${m.ready} % charged`);
  return parts.join(", ");
}

export function describeEffect(e: Effect, data: GameData): string {
  const phaseName = (id: string) => (id === data.rules.battle.supernova.id ? data.rules.battle.supernova.name : data.rules.battle.phases.find((p) => p.id === id)?.name ?? id);
  const per = e.per;
  let perText = "";
  if (per) {
    const div = per.div && per.div !== 1 ? `${per.div} ` : "";
    const unit = per.stars ? `starred ${div ? plural(per.stars) : tagName(per.stars)}` : per.ship ? `${div ? plural(per.ship) : tagName(per.ship)} in your backpack` : "";
    const stack = per.buff ? `${div}${STATUS[per.buff]} you have` : per.debuff ? `${div}${STATUS[per.debuff]} on the enemy` : "";
    perText = ` per ${stack || `${div}${unit}`}${per.max ? ` (max ${per.max}×)` : ""}`;
  }
  const cond: string[] = [];
  if (e.if?.chance !== undefined) cond.push(`${e.if.chance} % chance`);
  if (e.if?.phase) cond.push(`during ${e.if.phase.map(phaseName).join("/")}`);
  if (e.if?.hpBelow !== undefined) cond.push(`below ${e.if.hpBelow} % health`);
  const condText = cond.length ? ` (${cond.join(", ")})` : "";
  if (e.on === "passive") {
    const who = e.to === "self" ? "This item" : e.to === "hero" ? "You" : e.to === "stars" ? `Starred ${plural(e.tag ?? "any")}` : `Your ${plural(e.tag ?? "any")}`;
    return `${who}: ${modText(e.mod!)}${perText}${condText}.`;
  }
  const n = e.n ?? 0;
  const action = e.gain ? `gain ${n} ${STATUS[e.gain]}` : e.inflict ? `inflict ${n} ${STATUS[e.inflict]}` : e.do === "damage" ? `deal ${n} damage` : e.do === "heal" ? `heal ${n}` : e.do === "cleanse" ? `remove ${n} of your debuffs` : `destroy ${n} enemy Shield`;
  const when = e.on === "start" ? "Battle start" : e.on === "use" ? "On use" : e.on === "hit" ? "On hit" : e.on === "attacked" ? "When a weapon hits you" : e.on === "lowHp" ? `Once below ${data.rules.battle.lowHpPct} % health` :
    e.on === "phase" ? (e.phase ? `When ${phaseName(e.phase)} begins` : "Every star phase") : e.on === "starUse" ? `When a starred ${tagName(e.tag ?? "any")} activates` : `When one of your ${plural(e.tag ?? "any")} activates`;
  return `${when}: ${action}${perText}${condText}.`;
}

export function describeItem(it: ItemDef, data: GameData): string[] {
  const lines: string[] = [];
  if (it.damage) lines.push(`${it.damage[0]}–${it.damage[1]} damage every ${it.cooldown} s.`);
  else if (it.cooldown) lines.push(`Activates every ${it.cooldown} s.`);
  for (const e of it.effects) lines.push(describeEffect(e, data));
  return lines;
}
export function describeHero(h: HeroData, data: GameData): string[] {
  const lines = h.effects.map((e) => describeEffect(e, data));
  if (h.supernovaResist) lines.push(`Takes ${h.supernovaResist} % less ${data.rules.battle.supernova.name} damage.`);
  if (h.craftGold) lines.push(`Every combination pays ${h.craftGold} gold.`);
  if (h.hpBonus) lines.push(`${h.hpBonus > 0 ? "+" : ""}${h.hpBonus} health.`);
  return lines;
}
export const tagLabel = (t: string) => cap(t);
