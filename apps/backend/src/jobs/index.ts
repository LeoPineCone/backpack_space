/**
 * Timed jobs (BE-14), run by the `jobs` Lambda on a schedule and locally with `npm run job -- <name>`:
 *   season    moves every profile of an earlier season into the season running now (META-03): league patch, drop,
 *             new pass. Each player counts once: a profile already in the season is left alone, so a repeated or
 *             overlapping run changes nothing. Players the job does not reach get the change when they next appear.
 *   actions   deletes recorded shop actions after their expiry. DynamoDB does that on its own within about two days;
 *             this is the safety net, and locally (DynamoDB Local has no expiry) the only way.
 * A job writes one line when it ends, plus the event lines of what it changed.
 */
import type { Ports } from "../domain/context.js";
import type { DomainContext } from "../domain/context.js";
import { loadProfile } from "../domain/players.js";
import { seasonNow } from "../domain/season.js";

export const JOB_NAMES = ["season", "actions"] as const;
export type JobName = (typeof JOB_NAMES)[number];

export interface JobResult {
  job: JobName;
  /** items looked at */
  seen: number;
  /** items changed or deleted */
  changed: number;
}

export async function runJob(ports: Ports, job: JobName): Promise<JobResult> {
  const started = ports.clock.now();
  const result = job === "season" ? await seasonJob(ports) : await actionsJob(ports);
  ports.log.write({ type: "job", time: new Date(ports.clock.now()).toISOString(), ...result, ms: ports.clock.now() - started });
  return result;
}

async function seasonJob(ports: Ports): Promise<JobResult> {
  const settings = await ports.settings.get();
  const season = seasonNow(ports.game.meta, settings, ports.clock.now()).id;
  let seen = 0;
  let changed = 0;
  let next: string | undefined;
  do {
    const page = await ports.players.scan("PROFILE", next);
    for (const item of page.items) {
      seen++;
      if ((item.season as { id: number }).id >= season) continue;
      const playerId = item.pk.slice("P#".length);
      const ctx: DomainContext = { ports, settings, playerId, events: [] };
      // loading moves the profile into the season and stores it, the same way a request of the player would
      await loadProfile(ctx, playerId);
      if (ctx.events.length > 0) changed++;
      for (const e of ctx.events) ports.log.write({ type: "event", time: new Date(ports.clock.now()).toISOString(), requestId: null, player: playerId, ...e });
    }
    next = page.next;
  } while (next);
  return { job: "season", seen, changed };
}

async function actionsJob(ports: Ports): Promise<JobResult> {
  const nowSec = Math.floor(ports.clock.now() / 1000);
  let seen = 0;
  let next: string | undefined;
  const old: { pk: string; sk: string }[] = [];
  // collect first, then delete, so deleting does not move the pages being read
  do {
    const page = await ports.actions.expired(nowSec, next);
    seen += page.items.length;
    old.push(...page.items.map((i) => ({ pk: i.pk, sk: i.sk })));
    next = page.next;
  } while (next);
  for (const k of old) await ports.actions.remove(k.pk, k.sk);
  return { job: "actions", seen, changed: old.length };
}
