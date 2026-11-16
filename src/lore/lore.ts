/** Loads and checks lore/planets.json: the places of the world and which items and heroes come from them (Node only). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GameData } from "@backpack-space/core";
import { ROOT } from "@backpack-space/core/node";

export const PLACE_KINDS = ["planet", "moon", "comet", "belt", "station", "star"] as const;

export interface Place {
  id: string;
  name: string;
  kind: (typeof PLACE_KINDS)[number];
  status: "draft" | "decided";
  orbits?: string;
  traits: string[];
  life: string;
  background: string;
  items: string[];
  heroes: string[];
}

export function loadLore(root = ROOT): Place[] {
  return (JSON.parse(readFileSync(join(root, "lore", "planets.json"), "utf8")) as { places: Place[] }).places;
}

/** Problems in the lore data: unknown ids, items with two origins, broken orbits. */
export function checkLore(data: GameData, places: Place[]): string[] {
  const problems: string[] = [], ids = new Set<string>(), origin = new Map<string, string>();
  for (const p of places) {
    if (ids.has(p.id)) problems.push(`lore: place id ${p.id} used twice`);
    ids.add(p.id);
    if (!PLACE_KINDS.includes(p.kind)) problems.push(`lore ${p.id}: unknown kind ${p.kind}`);
    if (p.status !== "draft" && p.status !== "decided") problems.push(`lore ${p.id}: status must be draft or decided`);
    for (const f of ["name", "life", "background"] as const) if (!p[f]?.trim()) problems.push(`lore ${p.id}: ${f} is empty`);
    for (const it of p.items) {
      if (!data.items.has(it)) problems.push(`lore ${p.id}: unknown item ${it}`);
      if (origin.has(it)) problems.push(`lore: item ${it} comes from both ${origin.get(it)} and ${p.id}`);
      origin.set(it, p.id);
    }
    for (const h of p.heroes) if (!data.heroes.has(h)) problems.push(`lore ${p.id}: unknown hero ${h}`);
  }
  for (const p of places) if (p.orbits && !ids.has(p.orbits)) problems.push(`lore ${p.id}: orbits unknown place ${p.orbits}`);
  return problems;
}
