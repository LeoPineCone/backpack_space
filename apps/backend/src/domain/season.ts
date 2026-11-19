/**
 * Which season runs (META-03): it follows the server date. The setting `season` names the current season with its
 * dates, so the next season can be set ahead of time and starts on its date without a deployment; until that date the
 * season before it runs. Only seasons the game data knows count (their pass lives in `data/meta.json`).
 */
import type { Meta } from "@backpack-space/core";
import type { SettingsValues } from "../ports/index.js";
import { isoDay } from "./config.js";

export interface SeasonNow {
  id: number;
  start: string;
  end: string;
}

const dayBefore = (day: string) => isoDay(Date.parse(`${day}T00:00:00Z`) - 86_400_000);

/** The season on the day of `nowMs` (UTC), with its dates. */
export function seasonNow(meta: Meta, settings: SettingsValues, nowMs: number): SeasonNow {
  const today = isoDay(nowMs);
  const set = settings.season;
  const known = (id: number) => meta.seasons.find((s) => s.id === id);
  if (set.start <= today && known(set.id)) return { ...set };
  // before the start of the season in the settings (or one the data does not know yet): the latest earlier one
  const before = meta.seasons.filter((s) => s.id < set.id && s.start <= today).at(-1) ?? meta.seasons.filter((s) => s.id < set.id).at(0);
  if (!before) return { ...set };
  const next = meta.seasons.find((s) => s.id > before.id);
  const end = set.id > before.id && set.start > today ? dayBefore(set.start) : next ? dayBefore(next.start) : set.end;
  return { id: before.id, start: before.start, end };
}
