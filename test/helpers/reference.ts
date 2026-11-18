/**
 * Reference fights (QA-06): fixed fights with their expected result. Pure (no Node APIs), so the same code runs in
 * Vitest (Node) and in the browser page of the Playwright check (Chromium, WebKit).
 */
import { compile, simulate, type Build, type GameData } from "@backpack-space/core";

export interface FightOutcome {
  winner: 0 | 1 | -1;
  seconds: number;
  hp: [number, number];
}
export interface ReferenceFight {
  /** why this fight is in the list (hero, effect kinds, merge, longest) */
  name: string;
  a: Build;
  b: Build;
  seed: number;
  expect: FightOutcome;
}
export interface ReferenceList {
  /** the simulation version the results were computed with (CORE-03) */
  simVersion: string;
  fights: ReferenceFight[];
}

export function fightOutcome(data: GameData, a: Build, b: Build, seed: number): FightOutcome {
  const r = simulate(compile(a, data), compile(b, data), data.rules, seed);
  return { winner: r.winner, seconds: r.seconds, hp: [r.hp[0], r.hp[1]] };
}

/** Every difference between the list and what this engine computes; empty when all fights match. */
export function checkReference(data: GameData, list: ReferenceList): string[] {
  const problems: string[] = [];
  if (list.simVersion !== data.simVersion)
    problems.push(`simulation version ${data.simVersion}, the list was made with ${list.simVersion}: regenerate it with npm run sim:reference`);
  for (const f of list.fights) {
    const got = fightOutcome(data, f.a, f.b, f.seed);
    if (JSON.stringify(got) !== JSON.stringify(f.expect)) problems.push(`${f.name}: expected ${JSON.stringify(f.expect)}, got ${JSON.stringify(got)}`);
  }
  return problems;
}
