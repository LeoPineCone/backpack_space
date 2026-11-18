/**
 * Knobs: the numbers of an item (or hero, or rule) a tuning tool may turn, each with its step and limits.
 * One step is about 10 % of the value, at least one unit of its grid. Step +1 always means "stronger" (more damage,
 * shorter cooldown, cheaper Energy). Health, damage and stacks stay whole numbers; Energy numbers move in halves.
 */
import { onPath, type GameData, type RawData } from "@backpack-space/core";
import { getPath, rawHero, rawItem, type Change, type Value } from "./patch";

export interface Knob {
  /** "venus_mantrap:cooldown" */
  id: string;
  where: { item?: string; hero?: string; rules?: true };
  path: string;
  /** what it is, for people: "Venus Mantrap cooldown" */
  label: string;
  base: number | [number, number];
  /** size of one step and its direction (+1: a higher number is stronger) */
  step: number;
  dir: 1 | -1;
  min: number;
  max: number;
  /** bots read this number when they shop or lay out (price, Energy, cooldown): a replay is only an estimate */
  botsRead: boolean;
}

const round = (v: number, step: number) => {
  const d = step % 1 === 0 ? 0 : (step * 10) % 1 === 0 ? 1 : 2;
  return Number(v.toFixed(d));
};
/** the knob's value after `steps` steps; undefined when that leaves its limits */
export function valueAt(k: Knob, steps: number): Value | undefined {
  const shift = steps * k.dir * k.step;
  if (Array.isArray(k.base)) {
    const lo = round(k.base[0] + shift, k.step),
      hi = round(k.base[1] + shift, k.step);
    return lo < k.min || hi > k.max ? undefined : [lo, hi];
  }
  const v = round(k.base + shift, k.step);
  return v < k.min || v > k.max ? undefined : v;
}
export function changeOf(k: Knob, steps: number): Change | undefined {
  const v = valueAt(k, steps);
  return v === undefined ? undefined : { ...k.where, set: { [k.path]: v } };
}
export const showKnobValue = (v: Value | undefined) => (Array.isArray(v) ? v.join("–") : String(v));

const tenth = (v: number) => Math.max(1, Math.round(Math.abs(v) * 0.1));
type Obj = Record<string, unknown>;

function effectKnobs(effects: Obj[], make: (path: string, what: string, base: number, o: Partial<Knob>) => void): void {
  effects.forEach((e, i) => {
    const what = `${e.on} ${e.gain ?? e.inflict ?? e.do ?? "bonus"}`;
    const p = `effects.${i}`;
    if (typeof e.n === "number") {
      if (e.do === "energy") make(`${p}.n`, `${what}`, e.n, { step: 0.5, min: 0.5, botsRead: true });
      else make(`${p}.n`, what, e.n, { step: tenth(e.n), min: 1 });
    }
    const cond = e.if as Obj | undefined;
    if (typeof cond?.chance === "number") make(`${p}.if.chance`, `${what} chance`, cond.chance, { step: 5, min: 5, max: 100 });
    const per = e.per as Obj | undefined;
    if (typeof per?.max === "number") make(`${p}.per.max`, `${what} cap`, per.max, { step: tenth(per.max), min: 1 });
    const mod = e.mod as Obj | undefined;
    for (const [key, v] of Object.entries(mod ?? {})) {
      if (typeof v !== "number" || v === 0) continue;
      const sign = v > 0 ? { min: key === "damage" ? 1 : 1 } : { max: -0.5, min: -1e9 };
      if (key === "energy")
        make(`${p}.mod.energy`, `${what} Energy cost`, v, { step: 0.5, dir: -1, botsRead: true, ...(v > 0 ? { min: 0.5 } : { max: -0.5, min: -1e9 }) });
      else if (key === "energyRegen") make(`${p}.mod.energyRegen`, `${what} Energy refill`, v, { step: 0.5, botsRead: true, min: 0.5 });
      else if (key === "ready") make(`${p}.mod.ready`, `${what} ready`, v, { step: 10, min: 10, max: 100 });
      else make(`${p}.mod.${key}`, `${what} ${key}`, v, { step: key === "damage" ? 1 : tenth(v), ...sign });
    }
  });
}

/** Every knob of one item. Price is left out unless asked for: it changes what bots buy, not how strong the item is. */
export function itemKnobs(raw: RawData, id: string, withPrice = false): Knob[] {
  const it = rawItem(raw, id);
  if (!it) throw new Error(`no item ${id}`);
  const out: Knob[] = [];
  const make = (path: string, what: string, base: number | [number, number], o: Partial<Knob>) =>
    out.push({ id: `${id}:${path}`, where: { item: id }, path, label: `${it.name} ${what}`, base, step: 1, dir: 1, min: 0, max: 1e9, botsRead: false, ...o });
  if (Array.isArray(it.damage)) {
    const d = it.damage as [number, number];
    make("damage", "damage", d, { step: tenth((d[0] + d[1]) / 2), min: 1 });
  }
  if (typeof it.cooldown === "number")
    make("cooldown", "cooldown", it.cooldown, { step: it.cooldown < 1.5 ? 0.1 : it.cooldown < 3 ? 0.2 : 0.3, dir: -1, min: 0.4, botsRead: true });
  if (typeof it.energy === "number" && it.energy > 0) make("energy", "Energy per attack", it.energy, { step: 0.5, dir: -1, min: 0.5, botsRead: true });
  if (withPrice && typeof it.cost === "number" && it.cost > 0) make("cost", "price", it.cost, { step: 1, dir: -1, min: 1, botsRead: true });
  effectKnobs((it.effects as Obj[] | undefined) ?? [], (path, what, base, o) => make(path, what, base, o));
  return out;
}

/** Knobs of a hero's own rules: only on the designer's word (--allow-hero-rules). */
export function heroKnobs(raw: RawData, id: string): Knob[] {
  const h = rawHero(raw, id);
  if (!h) throw new Error(`no hero ${id}`);
  const out: Knob[] = [];
  const make = (path: string, what: string, base: number, o: Partial<Knob>) =>
    out.push({
      id: `hero.${id}:${path}`,
      where: { hero: id },
      path,
      label: `${h.name} (hero rule) ${what}`,
      base,
      step: 1,
      dir: 1,
      min: 0,
      max: 1e9,
      botsRead: false,
      ...o,
    });
  if (typeof h.hpBonus === "number" && h.hpBonus) make("hpBonus", "health bonus", h.hpBonus, { step: tenth(h.hpBonus) });
  if (typeof h.supernovaResist === "number" && h.supernovaResist) make("supernovaResist", "Supernova resistance", h.supernovaResist, { step: 5, max: 90 });
  effectKnobs((h.effects as Obj[] | undefined) ?? [], make);
  return out;
}

/** A rule as a knob: "energy.regen@0.5" (path in rules.json @ step). */
export function ruleKnob(raw: RawData, spec: string): Knob {
  const [path, step] = spec.split("@");
  const base = getPath(raw.rules, path!);
  if (typeof base !== "number") throw new Error(`rules.json has no number at "${path}"`);
  return {
    id: `rules:${path}`,
    where: { rules: true },
    path: path!,
    label: `rule ${path}`,
    base,
    step: Number(step ?? tenth(base)),
    dir: 1,
    min: 0,
    max: 1e9,
    botsRead: true,
  };
}

/**
 * Knobs from a selection: "hero:venn" (all items of the hero), "path:venn/jungle" (the hero's items of that path),
 * "item:a,b", "rule:energy.regen@0.5", "herorule:rook"; several joined with "+".
 */
export function selectKnobs(data: GameData, raw: RawData, spec: string, o: { price?: boolean; heroRules?: boolean } = {}): Knob[] {
  const out: Knob[] = [];
  for (const part of spec
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [kind, arg = ""] = [part.slice(0, part.indexOf(":")), part.slice(part.indexOf(":") + 1)];
    if (kind === "hero") {
      if (!data.heroes.has(arg)) throw new Error(`--knobs: no hero ${arg}`);
      for (const it of data.itemList) if (it.hero === arg && !it.isBag) out.push(...itemKnobs(raw, it.id, o.price));
    } else if (kind === "path") {
      const [h, p] = arg.split("/");
      const path = data.heroes.get(h!)?.paths.find((x) => x.id === p);
      if (!path) throw new Error(`--knobs: no path ${arg}`);
      for (const it of data.itemList) if (it.hero === h && onPath(it, path)) out.push(...itemKnobs(raw, it.id, o.price));
    } else if (kind === "item") {
      for (const id of arg.split(",")) out.push(...itemKnobs(raw, id.trim(), o.price));
    } else if (kind === "rule") {
      out.push(ruleKnob(raw, arg));
    } else if (kind === "herorule") {
      if (!o.heroRules) throw new Error("hero rules are design decisions: add --allow-hero-rules only with the designer's OK");
      out.push(...heroKnobs(raw, arg));
    } else throw new Error(`--knobs: unknown selection "${part}" (hero:<id>, path:<hero>/<path>, item:<id,id>, rule:<path>@<step>, herorule:<id>)`);
  }
  const seen = new Set<string>();
  return out.filter((k) => !seen.has(k.id) && seen.add(k.id));
}
