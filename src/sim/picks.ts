/**
 * Free picks: a bot at the moment of a pick plays the rest of its run once with every option (and once with
 * nothing), with the same shop rolls, opponents and fight dice, so the difference is the item.
 */
import { botBuild, botMerge, botShop, botSpecial, compile, simulate, Rng, type Bot, type BotOpts, type Build, type GameData } from "@backpack-space/core";
import { currentRatings, playLobby } from "./lobby";

export interface Moment { hero: string; after: number; bot: Bot }
export interface Scored { hero: string; after: number; none: number; score: Record<string, number> }
export interface PickLobby { /** builds per seat and round */ builds: Build[][]; moments: Moment[] }

/** Lobby i of a seed with every pick moment in it (bots choose their own paths). */
export function playPickLobby(data: GameData, seed: number, i: number): PickLobby {
  const moments: Moment[] = [];
  const l = playLobby(data, seed * 100003 + i, { immortal: true, onSpecial: (s, after) => moments.push({ hero: s.bot.hero, after, bot: structuredClone(s.bot) }) });
  return { builds: l.seats.map((s) => s.builds), moments };
}

/** the pool a pick draws from */
export function poolOf(data: GameData, hero: string, after: number): string[] {
  const sp = data.rules.specials.find((s) => s.afterRound === after)!;
  return sp.pool === "hero" ? [...data.heroes.get(hero)!.artifacts] : data.generalArtifacts.map((i) => i.id);
}

/** careful placement: the arranger searches much longer, to tell a weak item from one the bots lay out badly */
export const CAREFUL = { moves: 1500, tries: 8 };

/** Plays the rest of the run with `extra` added at the pick; returns the share of fights won. Same seed = same dice. */
export function playRest(data: GameData, byRound: readonly Build[][], m: Moment, extra: string | null, seed: number, fights: number, careful: boolean): number {
  const bot = structuredClone(m.bot);
  if (extra) bot.loose.push(extra);
  const opts: BotOpts = { ratings: currentRatings(), ...(careful ? { arrange: CAREFUL } : {}) };
  let w = 0, n = 0;
  for (let round = m.after + 1; round <= data.rules.rounds; round++) {
    botShop(data, bot, round, new Rng(seed + 7919 * round), opts);
    const me = compile(botBuild(bot, round), data);
    const field: Build[] = byRound[round - 1]!.filter((b) => b.hero !== m.hero);
    const pick = new Rng(seed * 31 + round);
    for (let f = 0; f < fights; f++) {
      const opp = field[pick.int(field.length)]!;
      const res = simulate(me, compile(opp, data), data.rules, pick.int(2 ** 31));
      w += res.winner === 0 ? 1 : res.winner === -1 ? 0.5 : 0; n++;
    }
    botMerge(data, bot, opts);
    botSpecial(data, bot, round, new Rng(seed + 104729 * round), opts);
  }
  return w / Math.max(1, n);
}

/** Every option of the moment's pool, and nothing, on the same dice. */
export function scoreMoment(data: GameData, byRound: readonly Build[][], m: Moment, seed: number, fights: number, careful: boolean): Scored {
  const score: Record<string, number> = {};
  for (const id of poolOf(data, m.hero, m.after)) score[id] = playRest(data, byRound, m, id, seed, fights, careful);
  return { hero: m.hero, after: m.after, none: playRest(data, byRound, m, null, seed, fights, careful), score };
}
