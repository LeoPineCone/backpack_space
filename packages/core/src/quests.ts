/**
 * Daily and weekly quests (META-06, CORE-07; docs/retention.md "Daily and weekly quests"): a quest is a whole run
 * with one special rule. A special rule only changes values of `data/rules.json` for that run (`questData`), so the
 * shop, the fights and the run code stay the same for quests and normal runs. Which quests run on a day follows from
 * the date alone (`questsOn`), equal on the device and the server. The rules live in `data/meta.json` → `quests`.
 */
import { z } from "zod";
import type { GameData } from "./gamedata.js";
import { Rng } from "./rng.js";

/** One special rule; every field it sets changes the rules of the run. */
export const QuestRule = z
  .object({
    id: z.string().regex(/^[a-z][a-zA-Z]*$/),
    /** a shorter run */
    rounds: z.number().int().positive().optional(),
    /** fewer (or more) lives */
    lives: z.number().int().positive().optional(),
    /** seconds of each phase of the star clock: a shorter clock brings the supernova earlier */
    phaseSeconds: z.number().positive().optional(),
    /** extra gold at the start of every round */
    goldBonus: z.number().int().positive().optional(),
    /** the shop cannot be rerolled */
    noReroll: z.literal(true).optional(),
    /** the shop offers rarities as this many rounds later */
    rarityAhead: z.number().int().positive().optional(),
    /** no free picks after rounds 2 and 6 */
    noSpecials: z.literal(true).optional(),
  })
  .strict();
export type QuestRule = z.infer<typeof QuestRule>;

export const QuestsData = z
  .object({
    $comment: z.string().optional(),
    /** quests per day and per week */
    perDay: z.number().int().min(0),
    perWeek: z.number().int().min(0),
    /** the rules a daily or a weekly quest is drawn from (ids of `rules`) */
    daily: z.array(z.string()),
    weekly: z.array(z.string()),
    /** extra Galaxies for a played quest run on top of what the run pays (docs/retention.md "Quests") */
    bonusGalaxies: z.object({ daily: z.number().int().min(0), weekly: z.number().int().min(0) }).strict(),
    rules: z.array(QuestRule).min(1),
  })
  .strict();
export type QuestsData = z.infer<typeof QuestsData>;

export type QuestKind = "daily" | "weekly";

export interface Quest {
  /** `<kind letter><period>:<rule>`, e.g. `d2026-11-18:shortFlight` or `w2026-11-16:oneShot` */
  id: string;
  kind: QuestKind;
  rule: string;
  /** the day (daily) or the Monday of the week (weekly), YYYY-MM-DD */
  period: string;
}

/** Problems of the quests section against the game data (empty when fine). */
export function checkQuests(q: QuestsData, data: GameData): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const r of q.rules) {
    if (ids.has(r.id)) problems.push(`quests: rule ${r.id} is listed twice`);
    ids.add(r.id);
    if (r.rounds !== undefined && r.rounds > data.rules.rounds) problems.push(`quests: rule ${r.id} has more rounds than a run`);
  }
  for (const kind of ["daily", "weekly"] as const) {
    for (const id of q[kind]) if (!ids.has(id)) problems.push(`quests: ${kind} names unknown rule ${id}`);
    if (new Set(q[kind]).size !== q[kind].length) problems.push(`quests: ${kind} names a rule twice`);
  }
  if (q.perDay > q.daily.length) problems.push("quests: perDay is more than the daily rules");
  if (q.perWeek > q.weekly.length) problems.push("quests: perWeek is more than the weekly rules");
  return problems;
}

/** The game data a quest run plays with: the same items and heroes, the rules changed by the special rule. */
export function questData(data: GameData, rule: QuestRule): GameData {
  const base = data.rules;
  const odds = base.shop.rarityOdds;
  const rules: GameData["rules"] = {
    ...base,
    rounds: rule.rounds ?? base.rounds,
    lives: rule.lives ?? base.lives,
    goldPerRound: base.goldPerRound.map((g) => g + (rule.goldBonus ?? 0)),
    shop: {
      ...base.shop,
      ...(rule.noReroll ? { rerolls: false } : {}),
      rarityOdds: rule.rarityAhead ? odds.map((_, i) => odds[Math.min(i + rule.rarityAhead!, odds.length - 1)]!) : odds,
    },
    specials: rule.noSpecials ? [] : base.specials,
    battle: rule.phaseSeconds ? { ...base.battle, phases: base.battle.phases.map((p) => ({ ...p, seconds: rule.phaseSeconds! })) } : base.battle,
  };
  return { ...data, rules };
}

/** Days since 1970-01-01 of a YYYY-MM-DD date (pure arithmetic, no clock). */
function dayNumber(day: string): number {
  return Math.floor(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000);
}
/** YYYY-MM-DD of a day number (civil date from days, integer math only). */
function dayString(n: number): string {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The Monday of the week of a day (weeks run Monday to Sunday, UTC). */
export function weekOf(day: string): string {
  const n = dayNumber(day);
  // 1970-01-01 was a Thursday
  return dayString(n - ((n + 3) % 7));
}

/** `count` different rules of `pool`, drawn with a seed that depends only on the period. */
function draw(pool: readonly string[], count: number, seed: number): string[] {
  const left = [...pool];
  const rng = new Rng(seed);
  const out: string[] = [];
  while (out.length < count && left.length) out.push(left.splice(rng.int(left.length), 1)[0]!);
  return out;
}

/** The quests open on a day (YYYY-MM-DD, the server's date): the dailies of that day and the weeklies of its week. */
export function questsOn(q: QuestsData, day: string): Quest[] {
  const week = weekOf(day);
  const make = (kind: QuestKind, period: string) => (rule: string) => ({ id: `${kind[0]}${period}:${rule}`, kind, rule, period });
  return [
    ...draw(q.daily, q.perDay, dayNumber(day) * 2 + 1).map(make("daily", day.slice(0, 10))),
    ...draw(q.weekly, q.perWeek, dayNumber(week) * 2).map(make("weekly", week)),
  ];
}

/** Whether a quest id is a daily or a weekly quest (its first letter), or null for no quest id. */
export function questKind(questId: string): QuestKind | null {
  return questId.startsWith("d") ? "daily" : questId.startsWith("w") ? "weekly" : null;
}

/** The rule of a quest id, if the quests know it. */
export function questRule(q: QuestsData, questId: string): QuestRule | null {
  const id = questId.split(":")[1];
  return q.rules.find((r) => r.id === id) ?? null;
}
