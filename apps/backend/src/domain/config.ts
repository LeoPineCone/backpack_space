/**
 * GET /config (BE-07): what the app needs before anything else. Reads only the settings and the clock, loads no
 * core and no table, and answers in maintenance and to old apps (the router keeps it open).
 */
import type { ConfigResponse } from "@backpack-space/api";
import type { DomainContext } from "./context.js";

/** "YYYY-MM-DD" in UTC */
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function config(ctx: DomainContext): Promise<ConfigResponse> {
  const { minAppVersion, season, maintenance } = ctx.settings;
  return {
    minAppVersion,
    serverDate: isoDay(ctx.ports.clock.now()),
    season: { id: season.id, start: season.start, end: season.end },
    maintenance: maintenance.textKey ? { on: maintenance.on, textKey: maintenance.textKey } : { on: maintenance.on },
  };
}
