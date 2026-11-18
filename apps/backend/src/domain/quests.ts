/**
 * GET /quests (META-06): the daily and weekly quests open on the server's date, and whether this player already
 * played each. Which quests are open follows from the date alone (core `questsOn`); a run of a quest is started with
 * POST /runs and `quest`, and its finish marks it played (runs.ts).
 */
import type { QuestsResponse } from "@backpack-space/api";
import { questsOn } from "@backpack-space/core";
import { isoDay } from "./config.js";
import type { DomainContext } from "./context.js";
import { playerKey } from "./players.js";
import { questKey } from "./runs.js";

export async function quests(ctx: DomainContext): Promise<QuestsResponse> {
  const { game, clock, players } = ctx.ports;
  const open = questsOn(game.meta.quests, isoDay(clock.now()));
  const pk = playerKey(ctx.playerId!);
  const played = await Promise.all(open.map((q) => players.get(pk, questKey(q.id))));
  return { quests: open.map((q, i) => ({ ...q, played: !!played[i] })) };
}
