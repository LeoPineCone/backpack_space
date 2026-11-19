import { describe, expect, it } from "vitest";
import type { RunBody, RunFinishResponse } from "@backpack-space/api";
import { act, newProfile, patchId } from "../packages/core/src/index.js";
import { loadGameData, loadMeta } from "../packages/core/node/load.js";
import { bookingFromServer, decideEntry, failureStep, nextSeed, patchLeague, roundActions } from "../apps/client/src/server-run";

const meta = loadMeta(loadGameData());
const run = (o: Partial<RunBody> = {}): RunBody => ({ runId: "run-1", hero: "venn", round: 3, lives: 4, wins: 2, shopSeed: 77, over: false, ...o });
const { credits: _c, ...serverProfile } = newProfile(meta);
const finished: RunFinishResponse = {
  result: {
    runId: "run-0",
    hero: "venn",
    wins: 5,
    livesLeft: 0,
    roundsPlayed: 9,
    completed: false,
    galaxies: 5,
    xp: 40,
    level: [1, 2],
    points: 12,
    league: [0, 0],
    pass: [0, 1],
    rewards: [],
  },
  profile: { ...serverProfile, name: "From server", galaxies: 5 },
};

describe("entering a run online", () => {
  it("shows what the server booked when the open run was over", () => {
    expect(decideEntry({ run: null, finished }, null)).toEqual({ kind: "booked", finished });
  });

  it("drops a stale copy when no run is open", () => {
    expect(decideEntry({ run: null }, { runId: "run-1", round: 3, answered: false })).toEqual({ kind: "none" });
    expect(decideEntry({ run: null }, null)).toEqual({ kind: "none" });
  });

  it("continues a copy of the open run in the server's round", () => {
    expect(decideEntry({ run: run() }, { runId: "run-1", round: 3, answered: false })).toEqual({ kind: "resume" });
  });

  it("continues a copy whose answered fight of the round before is being shown", () => {
    expect(decideEntry({ run: run() }, { runId: "run-1", round: 2, answered: true })).toEqual({ kind: "resume" });
    // the last round: the server stays on it and the run is over
    expect(decideEntry({ run: run({ round: 12, over: true }) }, { runId: "run-1", round: 12, answered: true })).toEqual({ kind: "resume" });
  });

  it("reports an open run without a fitting copy", () => {
    expect(decideEntry({ run: run() }, null)).toEqual({ kind: "noCopy", runId: "run-1" });
    expect(decideEntry({ run: run() }, { runId: "run-9", round: 3, answered: false })).toEqual({ kind: "noCopy", runId: "run-1" });
    expect(decideEntry({ run: run() }, { runId: undefined, round: 3, answered: false })).toEqual({ kind: "noCopy", runId: "run-1" });
    // the copy fought a round the server never answered
    expect(decideEntry({ run: run() }, { runId: "run-1", round: 2, answered: false })).toEqual({ kind: "noCopy", runId: "run-1" });
  });
});

describe("run requests", () => {
  it("sends only the shop actions of the round in progress", () => {
    const log = [act.reroll(), act.buy(0), "won 12", act.freeze(1), act.reroll()];
    expect(roundActions(log)).toEqual([act.freeze(1), act.reroll()]);
    expect(roundActions([act.reroll()])).toEqual([act.reroll()]);
    expect(roundActions([act.reroll(), "lost"])).toEqual([]);
  });

  it("takes the next shop seed from the answer, none when the run is over", () => {
    expect(nextSeed(run())).toBe(77);
    expect(nextSeed(run({ over: true }))).toBeUndefined();
  });

  it("shows the server's booking with the server's profile and the local Credits", () => {
    const local = { ...newProfile(meta), credits: 33 };
    const b = bookingFromServer(finished, local);
    expect(b).toMatchObject({ galaxies: 5, xp: 40, level: [1, 2], points: 12, rewards: [] });
    expect(b.profile).toMatchObject({ name: "From server", galaxies: 5, credits: 33 });
  });

  it("maps failures to what the screen does", () => {
    expect(failureStep("network")).toBe("retry");
    expect(failureStep("bad_answer")).toBe("retry");
    expect(failureStep("rate_limited")).toBe("retry");
    expect(failureStep("maintenance")).toBe("status");
    expect(failureStep("update_required")).toBe("status");
    expect(failureStep("unauthorized")).toBe("signIn");
    expect(failureStep("run_conflict")).toBe("reload");
    expect(failureStep("invalid_backpack")).toBe("rejected");
  });

  it("reads the league from the opponent's patch", () => {
    expect(patchLeague(patchId(1, "comet"))).toBe("comet");
    expect(patchLeague(null)).toBeNull();
    expect(patchLeague("something")).toBeNull();
  });
});
