/**
 * A baseline on disk (out/baseline/<name>/) and the bench that measures patches against it.
 *   meta.json            what the baseline was measured on (hash of the game data and ratings, lobbies, seeds)
 *   panel-s<seed>.json   the lobbies of that seed: builds, pairings, dice, fight records
 *   ratings.json         the bot ratings the lobbies were played with
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GameData, RawData } from "@backpack-space/core";
import { DATA_DIR, loadRawData } from "@backpack-space/core/node";
import { metricsOf, type Metrics } from "./metrics";
import { readPanel, replay, stored, writePanel, type Panel } from "./panel";
import { EMPTY, patchedData, touchedBy, type Patch } from "./patch";

export interface BaselineMeta { kind: "backpack-space-baseline"; name: string; written: string; lobbies: number; seeds: number[]; dataHash: string; seconds: number }

export const baselineDir = (name: string) => join("out", "baseline", name);

/** Hash of everything a fight or a bot's purchase can depend on: items, heroes, rules, recipes, ratings. */
export function dataHash(dataDir = DATA_DIR): string {
  const h = createHash("sha256");
  const files = [...readdirSync(join(dataDir, "items")).filter((f) => f.endsWith(".json")).sort().map((f) => join("items", f)), "heroes.json", "rules.json", "recipes.json", join("sim", "ratings.json")];
  for (const f of files) { h.update(f); h.update(existsSync(join(dataDir, f)) ? readFileSync(join(dataDir, f)) : ""); }
  return h.digest("hex").slice(0, 16);
}

export function writeBaseline(name: string, meta: Omit<BaselineMeta, "kind" | "name" | "dataHash">, panels: Panel[]): string {
  const dir = baselineDir(name);
  mkdirSync(dir, { recursive: true });
  for (const p of panels) writePanel(join(dir, `panel-s${p.seed}.json`), p);
  const ratings = join(DATA_DIR, "sim", "ratings.json");
  writeFileSync(join(dir, "ratings.json"), existsSync(ratings) ? readFileSync(ratings) : "{}\n");
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ kind: "backpack-space-baseline", name, dataHash: dataHash(), ...meta } satisfies BaselineMeta, null, 1) + "\n");
  return dir;
}

export function readMeta(name: string): BaselineMeta {
  const file = join(baselineDir(name), "meta.json");
  if (!existsSync(file)) throw new Error(`no baseline "${name}" (${file}). Run: npm run baseline${name === "main" ? "" : ` -- --name ${name}`}`);
  return JSON.parse(readFileSync(file, "utf8")) as BaselineMeta;
}

/** Measures patches on the stored lobbies of a baseline. */
export class Bench {
  readonly meta: BaselineMeta;
  readonly raw: RawData;
  readonly data: GameData;
  readonly panels: Panel[];
  /** the baseline's own numbers, per seed (same order as panels) */
  readonly base: Metrics[];
  /** false: data/ or the ratings changed since the baseline was taken */
  readonly fresh: boolean;

  constructor(name = "main", seeds?: number[], lobbies?: number) {
    this.meta = readMeta(name);
    this.fresh = this.meta.dataHash === dataHash();
    this.raw = loadRawData();
    this.data = patchedData(EMPTY, this.raw);
    this.panels = (seeds ?? this.meta.seeds).map((s) => {
      const p = readPanel(join(baselineDir(name), `panel-s${s}.json`));
      return lobbies && lobbies < p.lobbies.length ? { seed: p.seed, lobbies: p.lobbies.slice(0, lobbies) } : p;
    });
    this.base = this.panels.map((p) => metricsOf(this.data, stored(p, this.data)));
  }

  /** the numbers with the patch, on the panel of one seed (index into panels) */
  run(patch: Patch, panel = 0): { metrics: Metrics; refought: number; flipped: number } {
    const data = patchedData(patch, this.raw);
    const r = replay(this.panels[panel]!, data, touchedBy(patch));
    return { metrics: metricsOf(data, r.stats), refought: r.refought, flipped: r.flipped };
  }
}
