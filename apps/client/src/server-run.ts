/**
 * The run against the backend (docs/client-server.md, docs/backend.md "What this means for the app"): the server
 * starts the run and hands out every shop seed, picks the opponent and the fight seed and decides the result; the app
 * computes the same fight only to show it. The local save stays the copy of the shop phase in progress.
 * Pure helpers here; the screens call them through `Game`.
 */
import type { RunBody, RunCurrentResponse, RunFinishResponse } from "@backpack-space/api";
import { parseFight, type Action, type Profile, type RunBooking } from "@backpack-space/core";
import type { ApiFailure } from "./api";
import { profileFromServer } from "./online";

/** What the app does with the open run the server reports at start. */
export type RunEntry =
  /** no open run: a local copy (if any) is stale and dropped */
  | { kind: "none" }
  /** the local copy belongs to the open run and stands where the server does: continue */
  | { kind: "resume" }
  /** the server booked a run that was over; show what it booked */
  | { kind: "booked"; finished: RunFinishResponse }
  /** an open run without a fitting local copy (reinstall, other device): report it, the server books it */
  | { kind: "noCopy"; runId: string };

/** The local copy of an online run, as far as the decision needs it. */
export interface LocalCopy {
  runId: string | undefined;
  /** the round the local run is about to fight */
  round: number;
  /** the server's answer to this round's fight is stored with the copy (the fight is shown or about to be) */
  answered: boolean;
}

export function decideEntry(server: RunCurrentResponse, local: LocalCopy | null): RunEntry {
  if (server.finished) return { kind: "booked", finished: server.finished };
  const run = server.run;
  if (!run) return { kind: "none" };
  if (local && local.runId === run.runId) {
    // in the shop of the server's round, or the fight of the round before was answered and is being shown
    if (local.round === run.round && !local.answered) return { kind: "resume" };
    if (local.answered && local.round + 1 === run.round) return { kind: "resume" };
    if (local.answered && run.over && local.round === run.round) return { kind: "resume" };
  }
  return { kind: "noCopy", runId: run.runId };
}

/** The shop actions of the round in progress: the log lines after the last fight. */
export function roundActions(log: readonly Action[]): Action[] {
  let i = log.length;
  while (i > 0 && !parseFight(log[i - 1]!)) i--;
  return log.slice(i);
}

/** The server's booking in the shape the run end screen shows; the profile is the server's (UX-03). */
export function bookingFromServer(r: RunFinishResponse, local: Profile): RunBooking {
  const { galaxies, xp, level, points, league, pass, rewards } = r.result;
  return { profile: profileFromServer(r.profile, local), galaxies, xp, level, points, league, pass, rewards };
}

/** The next round's shop seed from a fight answer; none when the run is over. */
export function nextSeed(run: RunBody): number | undefined {
  return run.over ? undefined : run.shopSeed;
}

/** What a failed run request leads to (UX-02). */
export type FailureStep =
  /** no answer: the run stays paused here; trying again sends the same request and gets the same answer */
  | "retry"
  /** maintenance or an old app: the status screen */
  | "status"
  /** the session token expired: sign in again silently and repeat */
  | "signIn"
  /** the run on the server is not where the app thinks: ask for the open run again */
  | "reload"
  /** the backpack was refused */
  | "rejected";

export function failureStep(error: ApiFailure): FailureStep {
  switch (error) {
    case "maintenance":
    case "update_required":
      return "status";
    case "unauthorized":
      return "signIn";
    case "run_conflict":
      return "reload";
    case "invalid_backpack":
      return "rejected";
    default:
      return "retry";
  }
}

/** The league id of a league patch ("patch_s1_comet" -> "comet"), for the opponent's tag in the fight. */
export function patchLeague(patch: string | null): string | null {
  const m = patch ? /^patch_s\d+_(.+)$/.exec(patch) : null;
  return m ? m[1]! : null;
}
