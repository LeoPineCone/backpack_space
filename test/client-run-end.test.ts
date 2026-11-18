import { describe, expect, it } from "vitest";
import type { RunFinishResponse } from "@backpack-space/api";
import { heroLevel, newProfile } from "../packages/core/src/index.js";
import { loadGameData, loadMeta } from "../packages/core/node/load.js";
import { bookingFromServer } from "../apps/client/src/server-run";
import { RUN_END, RUN_END_SECONDS, runEndFrame } from "../apps/client/src/run-end";
import { websiteUrl } from "../apps/client/src/website";

const meta = loadMeta(loadGameData());
const per = meta.leagues.pointsPerLeague;
const { credits: _c, ...base } = newProfile(meta);

/** A server answer for a run that took the hero from just below a level to above it and the player one league up. */
function answer(o: { xpBefore: number; xp: number; league: [number, number]; points: number }): RunFinishResponse {
  const xpAfter = o.xpBefore + o.xp;
  return {
    result: {
      runId: "run-1",
      hero: "venn",
      wins: 8,
      livesLeft: 1,
      roundsPlayed: 12,
      galaxies: 9,
      xp: o.xp,
      level: [heroLevel(meta, o.xpBefore).level, heroLevel(meta, xpAfter).level],
      points: o.points,
      league: o.league,
      pass: [1, 1],
      rewards: [],
    },
    profile: { ...base, heroXp: { venn: xpAfter }, season: { ...base.season, points: o.league[1] * per + 5, peak: o.league[1] } },
  };
}

describe("run end animations (META-07)", () => {
  const xpBefore = meta.heroLevels.xp[0]! - 10;
  const res = answer({ xpBefore, xp: 40, league: [0, 1], points: 25 });
  const b = bookingFromServer(res, { ...base, credits: 0 });
  const xpAfter = b.profile.heroXp.venn!;

  it("start from the standing before the run", () => {
    const f = runEndFrame(meta, b, xpAfter, 0);
    expect(f).toMatchObject({ level: b.level[0], up: false, pop: 1, points: 0, league: 0, ring: 0 });
  });

  it("end on the server's booking: the new level, all points and the new league", () => {
    const f = runEndFrame(meta, b, xpAfter, RUN_END_SECONDS);
    expect(f).toMatchObject({ level: b.level[1], up: true, pop: 1, points: 25, league: 1, ring: 0 });
    expect(f.level).toBeGreaterThan(b.level[0]);
  });

  it("pop the level once while the bar fills, then count the league points with a ring", () => {
    const times = Array.from({ length: 80 }, (_, i) => (i * RUN_END_SECONDS) / 79);
    const frames = times.map((t) => runEndFrame(meta, b, xpAfter, t));
    expect(frames.some((f) => f.pop > 1.2)).toBe(true);
    // the league moves only after the bar is full
    for (const [i, f] of frames.entries()) if (times[i]! < RUN_END.delay + RUN_END.fill) expect(f.league).toBe(0);
    expect(frames.some((f) => f.ring > 0.5)).toBe(true);
    // points only ever count up
    for (let i = 1; i < frames.length; i++) expect(frames[i]!.points).toBeGreaterThanOrEqual(frames[i - 1]!.points);
  });

  it("stay quiet without a new level or league", () => {
    const calm = bookingFromServer(answer({ xpBefore: 0, xp: 5, league: [2, 2], points: -10 }), { ...base, credits: 0 });
    const frames = Array.from({ length: 40 }, (_, i) => runEndFrame(meta, calm, calm.profile.heroXp.venn!, (i * RUN_END_SECONDS) / 39));
    expect(frames.every((f) => f.pop === 1 && f.ring === 0 && f.league === 1 && !f.up)).toBe(true);
    expect(frames.at(-1)!.points).toBe(-10);
  });
});

describe("website links (WEB-03)", () => {
  it("open the page in the player's language, and nothing without a website address", () => {
    expect(websiteUrl("https://example.org/", "privacy", "de")).toBe("https://example.org/de/privacy/");
    expect(websiteUrl("https://example.org", "terms", "en")).toBe("https://example.org/en/terms/");
    expect(websiteUrl(undefined, "privacy", "en")).toBeNull();
    expect(websiteUrl("", "terms", "en")).toBeNull();
  });
});
