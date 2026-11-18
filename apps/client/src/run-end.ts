/**
 * The animations of the run end (META-07, docs/ux.md F6), as numbers per moment: the hero XP bar fills and a new level
 * pops; then the league points count up and a new league fades in with a soft ring, inside the screen (no full-screen
 * moment). Everything comes from the booking, which online is the server's answer. No drawing here.
 */
import { heroLevel, type Meta, type RunBooking } from "@backpack-space/core";

/** seconds before the XP bar moves, the time it fills, and the time the league points count */
export const RUN_END = { delay: 0.4, fill: 1.2, league: 0.8, pop: 0.5 };
/** after this the screen stands still */
export const RUN_END_SECONDS = RUN_END.delay + RUN_END.fill + RUN_END.league + 0.5;

export interface RunEndFrame {
  level: number;
  /** the shown level is above the one before the run */
  up: boolean;
  /** how full the XP bar is, 0..1 */
  bar: number;
  /** scale of the level text (1 = rest; the pop when a level is reached) */
  pop: number;
  /** league points shown so far */
  points: number;
  /** 0 = the league before the run, 1 = the league after; stays 1 when the league did not change */
  league: number;
  /** alpha of the ring around the league icon (only when the league changes) */
  ring: number;
  /** scale of that ring */
  ringScale: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The run end at `time` seconds after it opened; `xpAfter` is the hero's XP after the booking. */
export function runEndFrame(meta: Meta, b: Pick<RunBooking, "xp" | "level" | "points" | "league">, xpAfter: number, time: number): RunEndFrame {
  const xp0 = Math.max(0, xpAfter - b.xp);
  const k = clamp01((time - RUN_END.delay) / RUN_END.fill);
  const ease = 1 - (1 - k) ** 3;
  const lv = heroLevel(meta, xp0 + (xpAfter - xp0) * ease);
  const up = lv.level > b.level[0];
  // the level pops once when it goes up
  const popAt = up ? time - (RUN_END.delay + RUN_END.fill * 0.2) : -1;
  const pop = popAt >= 0 && popAt < RUN_END.pop ? 1 + 0.5 * Math.sin((popAt / RUN_END.pop) * Math.PI) : 1;
  const kl = clamp01((time - RUN_END.delay - RUN_END.fill) / RUN_END.league);
  const changed = b.league[1] !== b.league[0];
  return {
    level: lv.level,
    up,
    bar: lv.need ? lv.into / lv.need : 1,
    pop,
    points: Math.round(b.points * kl),
    league: changed ? kl : 1,
    ring: changed && kl > 0 && kl < 1 ? Math.sin(kl * Math.PI) : 0,
    ringScale: 1 + kl * 0.6,
  };
}
