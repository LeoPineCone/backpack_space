/**
 * GET /config (BE-07): what the app needs before anything else. Reads only the settings, the clock and the season
 * list of the game data, runs no simulation and reads no table, and answers in maintenance and to old apps (the
 * router keeps it open).
 */
import type { ConfigResponse } from "@backpack-space/api";
import type { DomainContext } from "./context.js";
import { seasonNow } from "./season.js";

/** "YYYY-MM-DD" in UTC */
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function config(ctx: DomainContext): Promise<ConfigResponse> {
  const { minAppVersion, maintenance } = ctx.settings;
  const now = ctx.ports.clock.now();
  return {
    minAppVersion,
    serverDate: isoDay(now),
    season: seasonNow(ctx.ports.game.meta, ctx.settings, now),
    maintenance: maintenance.textKey ? { on: maintenance.on, textKey: maintenance.textKey } : { on: maintenance.on },
  };
}
