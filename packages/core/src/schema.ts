/** Data schemas (zod). Everything in data/*.json is parsed through these. */
import { z } from "zod";

export const TAGS = ["weapon", "armor", "accessory", "pet", "food", "mechanical", "organic"] as const;
/** Bags are not items in a bag: they are the pockets items lie in. */
export const BAG = "bag" as const;
export const BUFFS = ["shield", "regen", "overclock", "power", "spikes"] as const;
export const DEBUFFS = ["burn", "toxin", "cryo", "jam", "radiation"] as const;
export const RANGES = ["melee", "ranged"] as const;
export type Range = (typeof RANGES)[number];
export const RARITIES = ["common", "rare", "epic", "legendary", "artifact"] as const;
export const SHOP_RARITIES = ["common", "rare", "epic", "legendary"] as const;

export const Tag = z.enum([...TAGS, BAG]);
export type Tag = z.infer<typeof Tag>;
/** "crafted" is derived: every recipe output carries it. "melee" / "ranged" pick weapons by their range. */
export const RANGE_FILTERS = ["melee", "ranged"] as const;
export const FilterTag = z.enum([...TAGS, "crafted", ...RANGE_FILTERS]);
export type FilterTag = z.infer<typeof FilterTag>;
export const Buff = z.enum(BUFFS);
export type Buff = z.infer<typeof Buff>;
export const Debuff = z.enum(DEBUFFS);
export type Debuff = z.infer<typeof Debuff>;
export const Rarity = z.enum(RARITIES);
export type Rarity = z.infer<typeof Rarity>;

const Per = z.object({
  /** number of starred items with this tag ("any" = every starred item) */
  stars: z.enum([...TAGS, "crafted", ...RANGE_FILTERS, "any"]).optional(),
  /** number of items in the backpack with this tag */
  ship: FilterTag.optional(),
  /** own buff stacks */
  buff: Buff.optional(),
  /** debuff stacks on the enemy */
  debuff: Debuff.optional(),
  div: z.number().positive().optional(),
  max: z.number().positive().optional(),
}).strict();

const Cond = z.object({
  /** only during these star phases */
  phase: z.array(z.string()).optional(),
  /** only while own health is below this percentage */
  hpBelow: z.number().optional(),
  /** percent chance */
  chance: z.number().optional(),
}).strict();

const Mod = z.object({
  /** flat weapon damage */
  damage: z.number().optional(),
  /** percent faster */
  speed: z.number().optional(),
  /** percent crit chance */
  crit: z.number().optional(),
  /** hero health */
  maxHp: z.number().optional(),
  /** percent of the first cooldown already charged at battle start */
  ready: z.number().optional(),
  /** weapons: change of the Energy one attack costs */
  energy: z.number().optional(),
  /** to: "hero": Energy regained per second */
  energyRegen: z.number().optional(),
  /** to: "hero": percent of healing above full health that becomes Shield (all items together at most 100) */
  overheal: z.number().optional(),
}).strict();
export type Mod = z.infer<typeof Mod>;

export const Effect = z.object({
  on: z.enum(["start", "use", "hit", "attacked", "phase", "starUse", "shipUse", "lowHp", "passive"]),
  /** on=phase: only when this phase begins (default: every phase) */
  phase: z.string().optional(),
  /** on=starUse/shipUse: only items with this tag; passive to stars/ship: only items with this tag */
  tag: FilterTag.optional(),
  if: Cond.optional(),
  gain: Buff.optional(),
  inflict: Debuff.optional(),
  do: z.enum(["damage", "heal", "cleanse", "strip", "energy"]).optional(),
  n: z.number().optional(),
  per: Per.optional(),
  /** "inside" (bags only): the items lying in this bag */
  to: z.enum(["self", "stars", "ship", "hero", "inside"]).optional(),
  mod: Mod.optional(),
}).strict();
export type Effect = z.infer<typeof Effect>;

export const Item = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  tags: z.array(Tag).min(1),
  rarity: Rarity,
  cost: z.number().int().min(0),
  /** rows of "#" (cell), "*" (star) and "." (empty) */
  shape: z.array(z.string()).min(1),
  /** hero id: only this hero is offered the item */
  hero: z.string().optional(),
  /** hero items: the path of the hero this item belongs to (none = core item of the hero); a hero item with a path is the anchor of that path */
  path: z.string().optional(),
  /** false: never in the shop (start items) */
  shop: z.boolean().optional(),
  /** how often the shop offers it compared with other items of its rarity (default 1) */
  weight: z.number().positive().optional(),
  cooldown: z.number().positive().optional(),
  damage: z.tuple([z.number(), z.number()]).optional(),
  /** weapons: melee (hits up close) or ranged (shoots); every item with damage has one */
  range: z.enum(RANGES).optional(),
  /** weapons: Energy one attack costs; every item with damage has one */
  energy: z.number().min(0).optional(),
  effects: z.array(Effect).default([]),
}).strict();
export type ItemData = z.infer<typeof Item>;

export const Placement = z.object({ item: z.string(), x: z.number().int(), y: z.number().int(), rot: z.number().int().min(0).max(3),
  /** locked by the player: this item does not merge after a fight */
  lock: z.boolean().optional() }).strict();
export type Placement = z.infer<typeof Placement>;

export const Build = z.object({ hero: z.string(), round: z.number().int(), bags: z.array(Placement), items: z.array(Placement) }).strict();
export type Build = z.infer<typeof Build>;

export const Hero = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  focus: z.string(),
  /** added to the health of every round */
  hpBonus: z.number().default(0),
  /** percent less supernova damage */
  supernovaResist: z.number().default(0),
  /** gold refunded for every combination */
  craftGold: z.number().default(0),
  effects: z.array(Effect).default([]),
  /** bags the hero starts with */
  bags: z.array(Placement),
  start: z.array(Placement),
  /** signature items offered for free after round 4 */
  artifacts: z.array(z.string()),
  /** ways to win this hero is designed for; a balancing bot commits to one. Focus entries are tags, statuses, "heal", "cleanse", "strip", "crafted" or item ids */
  paths: z.array(z.object({ id: z.string(), name: z.string(), focus: z.array(z.string()).min(1) }).strict()).default([]),
}).strict();
export type HeroData = z.infer<typeof Hero>;

export const Recipe = z.object({ in: z.array(z.string()).min(2), out: z.string() }).strict();
export type Recipe = z.infer<typeof Recipe>;

const Odds = z.object({ common: z.number(), rare: z.number(), epic: z.number(), legendary: z.number() }).strict();

export const Rules = z.object({
  grid: z.object({ w: z.number().int(), h: z.number().int() }).strict(),
  rounds: z.number().int(),
  lives: z.number().int(),
  heroHp: z.array(z.number()),
  goldPerRound: z.array(z.number()),
  shop: z.object({
    slots: z.number().int(), bagOfferPct: z.number(), recipeOfferPct: z.number(), rerollCost: z.number(), heroOfferPct: z.number(), salePct: z.number(), sellPct: z.number(), looseLimit: z.number().int(),
    /** at most this many bags among the offers of one roll */
    maxBags: z.number().int(),
    /** an item is offered up to this many percent more often when all owned items share one of its tags (scaled by the share that do) */
    affinityPct: z.number(),
    /** once the player owns a hero item (anchor) of a path, hero shop items of that path are offered this many times as often */
    anchorPathWeight: z.number().positive().default(1),
    rarityOdds: z.array(Odds),
  }).strict(),
  specials: z.array(z.object({ afterRound: z.number().int(), pool: z.enum(["hero", "general"]), show: z.number().int() }).strict()),
  recipes: z.object({ maxDepth: z.number().int(), maxInputs: z.number().int() }).strict(),
  battle: z.object({
    tick: z.number(),
    phases: z.array(z.object({ id: z.string(), name: z.string(), seconds: z.number() }).strict()),
    supernova: z.object({ id: z.string(), name: z.string(), basePct: z.number(), growthPct: z.number(), interval: z.number() }).strict(),
    critMult: z.number(), lowHpPct: z.number(), maxSeconds: z.number(),
  }).strict(),
  /** every weapon attack costs Energy; Energy refills at a fixed rate. A weapon without enough Energy waits. */
  energy: z.object({ max: z.number().positive(), start: z.number().min(0), regen: z.number().min(0) }).strict(),
  status: z.object({
    burn: z.object({ interval: z.number(), decay: z.number() }).strict(),
    toxin: z.object({ interval: z.number() }).strict(),
    regen: z.object({ interval: z.number() }).strict(),
    cryo: z.object({ slowPct: z.number(), capPct: z.number(), decayInterval: z.number() }).strict(),
    jam: z.object({ missPct: z.number(), capPct: z.number(), decayInterval: z.number() }).strict(),
    radiation: z.object({ reducePct: z.number(), capPct: z.number() }).strict(),
    /** energyPct: Energy also refills this much faster per stack (same cap), so faster weapons do not starve */
    overclock: z.object({ speedPct: z.number(), capPct: z.number(), energyPct: z.number().default(0) }).strict(),
  }).strict(),
}).strict();
export type Rules = z.infer<typeof Rules>;
