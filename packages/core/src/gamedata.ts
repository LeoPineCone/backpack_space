/** Builds the validated, indexed game data from raw JSON. Shared by Node and browser loaders. */
import { z } from "zod";
import { BEAST_MIN_CELLS, BUFFS, DEBUFFS, PET_KINDS, TAGS, Hero, Item, Recipe, Rules, SHOP_RARITIES, type Effect, type HeroData, type ItemData, type Tag } from "./schema.js";
import { boardOf, parseShape, type Shape } from "./grid.js";
import { buildGlossary, type Glossary } from "./glossary.js";
import { buildLocales, type Locales } from "./i18n.js";

export interface ItemDef extends Omit<ItemData, "tags"> {
  tags: (Tag | "crafted")[];
  /** number of cells */
  size: number;
  /** recipe depth: 0 = base item */
  depth: number;
  crafted: boolean;
  /** offered in the shop */
  inShop: boolean;
  isBag: boolean;
}
export type ShopRarity = (typeof SHOP_RARITIES)[number];

export interface GameData {
  rules: Rules;
  heroes: Map<string, HeroData>;
  heroList: HeroData[];
  items: Map<string, ItemDef>;
  itemList: ItemDef[];
  recipes: Recipe[];
  /** recipes an item is an input of */
  recipesWith: Map<string, Recipe[]>;
  /** shop pools: general and per hero, by rarity */
  pool: { general: Record<ShopRarity, ItemDef[]>; hero: Map<string, Record<ShopRarity, ItemDef[]>> };
  generalArtifacts: ItemDef[];
  /** bags sold in the shop */
  bags: ItemDef[];
  phaseIds: string[];
  /** every game term in English and German (data/glossary.json) */
  glossary: Glossary;
  /** every shipped language (data/locales/*.json); English is the source and the fallback */
  locales: Locales;
  shape: (item: string, rot: number) => Shape;
}

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, raw: unknown, where: string): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new Error(`${where}: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return r.data;
}

export interface RawData { rules: unknown; heroes: unknown; recipes: unknown; glossary: unknown; itemFiles: Record<string, unknown>; /** "en.json", "de.json", ... */ locales: Record<string, unknown> }

export function buildGameData(raw: RawData): GameData {
  const problems: string[] = [];
  const rules = parseOrThrow(Rules, raw.rules, "rules.json");
  const heroList = parseOrThrow(z.array(Hero), raw.heroes, "heroes.json");
  const recipes = parseOrThrow(z.array(Recipe), raw.recipes, "recipes.json");
  const items = new Map<string, ItemDef>();
  for (const [file, content] of Object.entries(raw.itemFiles)) {
    if (!Array.isArray(content)) throw new Error(`${file}: expected a list of items`);
    content.forEach((rawItem, i) => {
      const it = parseOrThrow(Item, rawItem, `${file}[${i}] ${(rawItem as { id?: string })?.id ?? ""}`);
      if (items.has(it.id)) problems.push(`${file}: duplicate item id ${it.id}`);
      const size = it.shape.join("").split("#").length - 1;
      if (size === 0) problems.push(`${it.id}: shape has no cells`);
      items.set(it.id, { ...it, tags: [...it.tags], size, depth: 0, crafted: false, inShop: false, isBag: it.tags.includes("bag") });
    });
  }
  const heroes = new Map(heroList.map((h) => [h.id, h]));
  const phaseIds = [...rules.battle.phases.map((p) => p.id), rules.battle.supernova.id];

  // recipes
  const outputs = new Map<string, Recipe>();
  const keys = new Set<string>();
  const recipesWith = new Map<string, Recipe[]>();
  for (const r of recipes) {
    for (const id of [...r.in, r.out]) if (!items.has(id)) problems.push(`recipe ${r.out}: unknown item ${id}`);
    if (r.in.length > rules.recipes.maxInputs) problems.push(`recipe ${r.out}: more than ${rules.recipes.maxInputs} inputs`);
    const key = [...r.in].sort().join("+");
    if (keys.has(key)) problems.push(`recipe ${r.out}: the inputs ${key} already make something else`);
    keys.add(key);
    if (outputs.has(r.out)) problems.push(`recipe ${r.out}: two recipes make this item`);
    outputs.set(r.out, r);
    for (const id of new Set(r.in)) recipesWith.set(id, [...(recipesWith.get(id) ?? []), r]);
  }
  const depthOf = (id: string, seen: string[] = []): number => {
    const r = outputs.get(id);
    if (!r) return 0;
    if (seen.includes(id)) { problems.push(`recipe ${id}: cycle`); return 0; }
    return 1 + Math.max(...r.in.map((i) => depthOf(i, [...seen, id])));
  };
  for (const it of items.values()) {
    it.depth = depthOf(it.id);
    it.crafted = it.depth > 0;
    if (it.crafted) it.tags.push("crafted");
    if (it.depth > rules.recipes.maxDepth) problems.push(`${it.id}: recipe chain of ${it.depth} steps, the limit is ${rules.recipes.maxDepth}`);
    it.inShop = !it.crafted && it.rarity !== "artifact" && it.shop !== false;
    if (it.hero && !heroes.has(it.hero)) problems.push(`${it.id}: unknown hero ${it.hero}`);
    if (it.path !== undefined && !heroes.get(it.hero ?? "")?.paths.some((p) => p.id === it.path)) problems.push(`${it.id}: path ${it.path} is not a path of its hero`);
    if (it.isBag && (it.tags.length > 1 || it.cooldown || it.crafted || it.effects.some((e) => e.on !== "passive" || (e.to !== "inside" && e.to !== "hero")))) problems.push(`${it.id}: a bag only has the tag "bag" and passives for the items inside or the hero`);
    if (!it.isBag && it.effects.some((e) => e.to === "inside")) problems.push(`${it.id}: only bags target "inside"`);
    if ((it.damage === undefined) !== !it.tags.includes("weapon")) problems.push(`${it.id}: weapons (and only weapons) need damage`);
    if (it.damage && !it.cooldown) problems.push(`${it.id}: weapon without cooldown`);
    if (it.damage && (it.range === undefined || it.energy === undefined)) problems.push(`${it.id}: weapons need "range" (melee/ranged) and "energy" (cost per attack)`);
    if (it.energy !== undefined && it.energy > rules.energy.max) problems.push(`${it.id}: costs more Energy than the maximum ${rules.energy.max}`);
    const kinds = PET_KINDS.filter((k) => it.tags.includes(k));
    if (kinds.length && !it.tags.includes("pet")) problems.push(`${it.id}: only pets are a ${kinds[0]}`);
    if (kinds.length > 1) problems.push(`${it.id}: a pet is a beast or a swarm, not both`);
    if (it.tags.includes("beast") && it.size < BEAST_MIN_CELLS) problems.push(`${it.id}: a beast covers at least ${BEAST_MIN_CELLS} cells`);
    if (it.tags.includes("pet") && it.energy) problems.push(`${it.id}: pets attack without Energy ("energy": 0)`);
    if (!it.damage && (it.range !== undefined || it.energy !== undefined)) problems.push(`${it.id}: only weapons have "range" and "energy"`);
    if (!it.cooldown && it.effects.some((e) => e.on === "use" || e.on === "hit")) problems.push(`${it.id}: "use"/"hit" effect without cooldown`);
    if (it.cooldown && !it.damage && !it.effects.some((e) => e.on === "use")) problems.push(`${it.id}: cooldown without a "use" effect`);
    it.effects.forEach((e, i) => checkEffect(e, `${it.id} effect ${i + 1}`, phaseIds, problems, it.shape.join("").includes("*")));
  }
  for (const r of recipes) {
    const out = items.get(r.out);
    if (out && r.in.some((i) => items.get(i)?.hero && items.get(i)?.hero !== out.hero)) problems.push(`recipe ${r.out}: hero input but the output belongs to another pool`);
  }

  // heroes
  const shapes = new Map<string, Shape>();
  const shape = (item: string, rot: number): Shape => {
    const k = `${item}/${rot & 3}`;
    let s = shapes.get(k);
    if (!s) { const def = items.get(item); if (!def) throw new Error(`unknown item ${item}`); s = parseShape(def.shape, rot); shapes.set(k, s); }
    return s;
  };
  for (const h of heroList) {
    h.effects.forEach((e, i) => checkEffect(e, `hero ${h.id} effect ${i + 1}`, phaseIds, problems, false, true));
    for (const a of h.artifacts) if (items.get(a)?.rarity !== "artifact" || items.get(a)?.hero !== h.id) problems.push(`hero ${h.id}: ${a} is not an artifact of this hero`);
    // every path has exactly one anchor among the hero items picked after round 4
    for (const p of h.paths) { const n = h.artifacts.filter((a) => items.get(a)?.path === p.id).length; if (n !== 1) problems.push(`hero ${h.id} path ${p.id}: needs exactly one hero item (anchor) with this path, has ${n}`); }
    const words: readonly string[] = [...TAGS, ...BUFFS, ...DEBUFFS, "heal", "cleanse", "strip", "damage", "crafted", "energy"];
    for (const p of h.paths) for (const f of p.focus) if (!words.includes(f) && !items.has(f)) problems.push(`hero ${h.id} path ${p.id}: unknown focus ${f}`);
    for (const p of h.bags) if (!items.get(p.item)?.isBag) problems.push(`hero ${h.id}: ${p.item} is not a bag`);
    for (const p of h.start) if (!items.has(p.item) || items.get(p.item)!.isBag) problems.push(`hero ${h.id}: bad start item ${p.item}`);
    if (!problems.length) try { boardOf(rules.grid.w, rules.grid.h, h.bags, h.start, shape); } catch (e) { problems.push(`hero ${h.id}: ${(e as Error).message}`); }
  }
  if (rules.heroHp.length < rules.rounds || rules.goldPerRound.length < rules.rounds || rules.shop.rarityOdds.length < rules.rounds) problems.push("rules: heroHp, goldPerRound and rarityOdds need one entry per round");
  const glossary = buildGlossary(raw.glossary, rules, problems);
  const locales = buildLocales(raw.locales, { rules, heroList, itemList: [...items.values()], glossary }, problems);
  if (problems.length) throw new Error(`Game data problems:\n- ${problems.join("\n- ")}`);

  const emptyPool = (): Record<ShopRarity, ItemDef[]> => ({ common: [], rare: [], epic: [], legendary: [] });
  const pool = { general: emptyPool(), hero: new Map(heroList.map((h) => [h.id, emptyPool()])) };
  const itemList = [...items.values()];
  for (const it of itemList) if (it.inShop && !it.isBag) (it.hero ? pool.hero.get(it.hero)! : pool.general)[it.rarity as ShopRarity].push(it);
  return {
    rules, heroes, heroList, items, itemList, recipes, recipesWith, pool,
    generalArtifacts: itemList.filter((i) => i.rarity === "artifact" && !i.hero), bags: itemList.filter((i) => i.isBag && i.inShop), phaseIds, shape, glossary, locales,
  };
}

function checkEffect(e: Effect, where: string, phases: string[], problems: string[], hasStars: boolean, hero = false): void {
  const actions = [e.gain, e.inflict, e.do].filter((x) => x !== undefined).length;
  if (e.on === "passive") {
    if (!e.to || !e.mod || actions) problems.push(`${where}: a passive needs "to" and "mod" and no action`);
    if (e.to === "inside" && hero) problems.push(`${where}: heroes have no inside`);
    if (e.to === "stars" && !hasStars) problems.push(`${where}: targets stars but the shape has none`);
    if (hero && (e.to === "self" || e.to === "stars")) problems.push(`${where}: hero passives target "ship" or "hero"`);
    if (e.per?.buff || e.per?.debuff || e.if?.chance || e.if?.hpBelow) problems.push(`${where}: passives cannot depend on stacks, chance or health`);
    if (e.mod?.energyRegen && e.to !== "hero") problems.push(`${where}: "energyRegen" only with to: "hero"`);
    if ((e.mod?.energyRegen || e.mod?.energy) && e.if?.phase) problems.push(`${where}: "energyRegen" and "energy" cannot depend on the phase`);
  } else {
    if (actions !== 1 || e.n === undefined || e.to || e.mod) problems.push(`${where}: needs exactly one of gain/inflict/do with "n"`);
    if (e.on === "starUse" && !hasStars) problems.push(`${where}: "starUse" but the shape has no stars`);
    if (e.on === "shipUse" && !hero) problems.push(`${where}: "shipUse" is for hero effects`);
    if (hero && (e.on === "use" || e.on === "hit" || e.on === "starUse")) problems.push(`${where}: heroes have no cooldown or stars`);
  }
  if (e.per?.stars && !hasStars) problems.push(`${where}: counts stars but the shape has none`);
  for (const p of [...(e.phase ? [e.phase] : []), ...(e.if?.phase ?? [])]) if (!phases.includes(p)) problems.push(`${where}: unknown phase ${p}`);
  if (e.phase && e.on !== "phase") problems.push(`${where}: "phase" only with on=phase`);
}
