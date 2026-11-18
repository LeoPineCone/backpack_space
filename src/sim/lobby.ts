/**
 * Lobbies of bots playing whole runs against each other. Every round each bot fights the current build of another bot
 * of the same lobby (async PvP: only the attacker's result counts for the attacker).
 */
import {
  botBuild,
  botMerge,
  botShop,
  botSpecial,
  compile,
  newBot,
  simulate,
  type Bot,
  type BotOpts,
  type BattleResult,
  type Build,
  type CSide,
  type GameData,
  Rng,
} from "@backpack-space/core";

/** Measured item ratings every bot uses unless its own options say otherwise (set by the reports from data/sim/ratings.json). */
let defaultRatings: Record<string, number> = {};
export function useRatings(r: Record<string, number>): void {
  defaultRatings = r;
}
export const currentRatings = (): Record<string, number> => defaultRatings;

export interface LobbyOpts {
  /** bots per lobby (default 16, heroes evenly spread) */
  size?: number;
  /** keep playing after the lives are gone (for late-round data); the run result still records when the run really ended */
  immortal?: boolean;
  /** bot options per seat; default: all the same */
  bot?: BotOpts | ((seat: number) => BotOpts);
  /** fixed hero per seat */
  hero?: (seat: number) => string;
  /** fixed path per seat ("" = none); default: the bot chooses */
  path?: (seat: number) => string | undefined;
  /** called right before a bot gets its free special item after a round (the moment of the pick) */
  onSpecial?: (seat: Seat, afterRound: number) => void;
}
export interface Fight {
  round: number;
  a: number;
  b: number;
  res: BattleResult;
  /** the dice of this fight: the same two builds with this seed fight the same fight again */
  seed: number;
}
export interface Seat {
  bot: Bot;
  seat: number;
  /** build per round (index 0 = round 1) */
  builds: Build[];
  /** won[r] for the rounds played */
  won: boolean[];
  /** round after which the run ended by the rules (lives gone or last round) */
  endedAfter: number;
  wins: number;
  livesLeft: number;
}
export interface Lobby {
  seats: Seat[];
  fights: Fight[];
}

export function playLobby(data: GameData, seed: number, opts: LobbyOpts = {}): Lobby {
  const rng = new Rng(seed);
  const size = opts.size ?? 16;
  const optOf = (i: number): BotOpts => ({ ratings: defaultRatings, ...(typeof opts.bot === "function" ? opts.bot(i) : (opts.bot ?? {})) });
  const seats: Seat[] = Array.from({ length: size }, (_, i) => {
    const hero = opts.hero ? opts.hero(i) : data.heroList[i % data.heroList.length]!.id;
    return { bot: newBot(data, hero, rng, opts.path?.(i)), seat: i, builds: [], won: [], endedAfter: 0, wins: 0, livesLeft: data.rules.lives };
  });
  const fights: Fight[] = [];
  for (let round = 1; round <= data.rules.rounds; round++) {
    const active = seats.filter((s) => opts.immortal || s.endedAfter === 0);
    if (active.length === 0) break;
    const sides = new Map<number, CSide>();
    for (const s of active) {
      botShop(data, s.bot, round, rng, optOf(s.seat));
      const b = botBuild(s.bot, round);
      s.builds[round - 1] = b;
      sides.set(s.seat, compile(b, data));
    }
    // the last bot standing meets the final builds of bots that already left (ghosts, as in async PvP)
    const pool = active.length >= 2 ? active : seats.filter((s) => s.builds.length > 0);
    if (active.length < 2) for (const s of pool) if (!sides.has(s.seat)) sides.set(s.seat, compile(s.builds[s.builds.length - 1]!, data));
    for (const s of active) {
      if (pool.length < 2) break;
      let o = pool[rng.int(pool.length - 1)]!;
      if (o.seat === s.seat) o = pool[pool.length - 1]!;
      const fightSeed = rng.int(2 ** 31);
      const res = simulate(sides.get(s.seat)!, sides.get(o.seat)!, data.rules, fightSeed);
      fights.push({ round, a: s.seat, b: o.seat, res, seed: fightSeed });
      const won = res.winner === 0;
      s.won.push(won);
      if (s.endedAfter === 0) {
        if (won) s.wins++;
        else s.livesLeft--;
        if (s.livesLeft <= 0 || round === data.rules.rounds) s.endedAfter = round;
      }
      botMerge(data, s.bot, optOf(s.seat));
      if (opts.onSpecial && data.rules.specials.some((x) => x.afterRound === round)) opts.onSpecial(s, round);
      botSpecial(data, s.bot, round, rng, optOf(s.seat));
    }
  }
  return { seats, fights };
}

/** Builds of many immortal lobbies, by round: the field the reports measure against. */
export function makeField(
  data: GameData,
  lobbies: number,
  seed: number,
  opts: LobbyOpts = {},
  onLobby?: (i: number) => void,
): { byRound: Build[][]; lobbies: Lobby[] } {
  const byRound: Build[][] = Array.from({ length: data.rules.rounds }, () => []);
  const all: Lobby[] = [];
  for (let i = 0; i < lobbies; i++) {
    const l = playLobby(data, seed * 100003 + i, { ...opts, immortal: true });
    all.push(l);
    for (const s of l.seats) s.builds.forEach((b, r) => byRound[r]!.push(b));
    onLobby?.(i);
  }
  return { byRound, lobbies: all };
}

/** Win share of `build` against `n` random opponents from the field of its round. */
export function winShare(data: GameData, build: Build, field: Build[], n: number, rng: Rng): number {
  const me = compile(build, data);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const res = simulate(me, compile(rng.pick(field), data), data.rules, rng.int(2 ** 31));
    wins += res.winner === 0 ? 1 : res.winner === -1 ? 0.5 : 0;
  }
  return wins / n;
}
