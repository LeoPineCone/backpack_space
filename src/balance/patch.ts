/**
 * A patch: number changes to try on the game data without touching data/*.json.
 *
 *   { "name": "venn jungle",
 *     "changes": [
 *       { "item": "venus_mantrap", "set": { "cooldown": 2.4, "damage": [6, 9], "effects.0.n": 3 } },
 *       { "hero": "rook", "set": { "effects.0.mod.speed": 22 } },
 *       { "rules": true, "set": { "energy.regen": 12.5 } } ] }
 *
 * Keys of "set" are paths into the item / hero / rules.json object ("effects.1.per.max"). The patched data is
 * built through the same validation as the real data, so a patch cannot produce an item the schema forbids.
 */
import { readFileSync } from "node:fs";
import { buildGameData, type GameData, type RawData } from "@backpack-space/core";
import { loadRawData } from "@backpack-space/core/node";

export type Value = number | string | boolean | number[];
export interface Change { item?: string; hero?: string; rules?: true; set: Record<string, Value> }
export interface Patch { name?: string; changes: Change[] }
export const EMPTY: Patch = { changes: [] };

/** what a patch touches: fights without any of it keep their stored result */
export interface Touched { items: Set<string>; heroes: Set<string>; all: boolean }
export function touchedBy(patch: Patch): Touched {
  const t: Touched = { items: new Set(), heroes: new Set(), all: false };
  for (const c of patch.changes) { if (c.item) t.items.add(c.item); else if (c.hero) t.heroes.add(c.hero); else t.all = true; }
  return t;
}

type Obj = Record<string, unknown>;
export function getPath(obj: unknown, path: string): unknown {
  let o = obj;
  for (const k of path.split(".")) { if (o === null || typeof o !== "object") return undefined; o = (o as Obj)[k]; }
  return o;
}
function setPath(obj: unknown, path: string, value: Value, where: string): void {
  const keys = path.split(".");
  let o = obj as Obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] === null || typeof o[k] !== "object") throw new Error(`patch ${where}: no "${path}" (stops at "${k}")`);
    o = o[k] as Obj;
  }
  o[keys[keys.length - 1]!] = value;
}

/** the raw item object in the item files */
export function rawItem(raw: RawData, id: string): Obj | undefined {
  for (const list of Object.values(raw.itemFiles)) { const it = (list as Obj[]).find((x) => x.id === id); if (it) return it; }
  return undefined;
}
export const rawHero = (raw: RawData, id: string): Obj | undefined => (raw.heroes as Obj[]).find((h) => h.id === id);

/** the object a change points at */
export function targetOf(raw: RawData, c: Change): Obj {
  const o = c.item ? rawItem(raw, c.item) : c.hero ? rawHero(raw, c.hero) : (raw.rules as Obj);
  if (!o) throw new Error(`patch: no ${c.item ? `item ${c.item}` : `hero ${c.hero}`}`);
  return o;
}

/** Applies the patch to a copy of the raw data. */
export function patchRaw(raw: RawData, patch: Patch): RawData {
  const out = structuredClone(raw);
  for (const c of patch.changes) {
    const o = targetOf(out, c), where = c.item ?? c.hero ?? "rules";
    for (const [path, value] of Object.entries(c.set)) setPath(o, path, value, where);
  }
  return out;
}

let rawCache: RawData | undefined;
/** The game data with the patch applied (validated like the real data). */
export function patchedData(patch: Patch, raw: RawData = (rawCache ??= loadRawData())): GameData {
  return buildGameData(patch.changes.length ? patchRaw(raw, patch) : raw);
}

export function readPatch(file: string): Patch {
  const p = JSON.parse(readFileSync(file, "utf8")) as Patch;
  if (!Array.isArray(p.changes)) throw new Error(`${file}: a patch needs "changes": [...]`);
  return p;
}

/** Two patches in one; later values win. */
export function mergePatches(...patches: Patch[]): Patch {
  const byKey = new Map<string, Change>();
  for (const p of patches) for (const c of p.changes) {
    const key = c.item ? `i:${c.item}` : c.hero ? `h:${c.hero}` : "rules";
    const have = byKey.get(key);
    if (have) Object.assign(have.set, c.set); else byKey.set(key, { ...c, set: { ...c.set } });
  }
  return { changes: [...byKey.values()] };
}

/** "venus_mantrap cooldown 2.8 → 2.4" for every value of the patch */
export function describePatch(patch: Patch, raw: RawData = (rawCache ??= loadRawData())): string[] {
  const out: string[] = [];
  const show = (v: unknown) => (Array.isArray(v) ? v.join("–") : String(v));
  for (const c of patch.changes) {
    const o = targetOf(raw, c);
    for (const [path, value] of Object.entries(c.set)) out.push(`${c.item ?? (c.hero ? `hero ${c.hero}` : "rules")} ${path}: ${show(getPath(o, path))} → ${show(value)}`);
  }
  return out;
}
