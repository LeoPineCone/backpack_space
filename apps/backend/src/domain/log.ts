/**
 * Event lines (BE-09, docs/backend.md "Logs and numbers"): one JSON line per event that counts. They are the source
 * of the usage numbers and of the reconcile command after a restore, so every event has a fixed set of fields.
 * Never a name, a store identity or a backpack: only ids, numbers and fixed words.
 *
 * Domain functions call `logEvent(ctx, ...)`; the router writes the lines after the request line.
 */
import type { DomainContext } from "./context.js";

type Id = string;

/** The fields of each event. The player id and the time are added by the router. */
export interface EventFields {
  run_started: { runId: Id; hero: Id; simVersion: string };
  fight: { runId: Id; round: number; result: "win" | "loss" | "draw"; simVersion: string };
  run_finished: { runId: Id; reason: "finished" | "gave_up" | "abandoned"; wins: number; livesLeft: number };
  /** a real-money purchase reported by RevenueCat; `ref` is RevenueCat's event id */
  purchase: { ref: Id; product: Id };
  credits_spent: { ref: Id; amount: number; thing: Id };
  credits_earned: { ref: Id; amount: number; source: Id };
  refund: { ref: Id; product: Id; removed: Id[] };
  account_deleted: Record<string, never>;
  plausibility_rejected: { runId: Id; round: number; reason: Id };
  result_mismatch: { runId: Id; round: number; simVersion: string };
  /** an unexpected failure inside a request (the request line says `internal`) */
  error: { message: string };
}
export type EventType = keyof EventFields;

export const EVENT_TYPES = [
  "run_started",
  "fight",
  "run_finished",
  "purchase",
  "credits_spent",
  "credits_earned",
  "refund",
  "account_deleted",
  "plausibility_rejected",
  "result_mismatch",
  "error",
] as const satisfies readonly EventType[];

export function logEvent<T extends EventType>(ctx: DomainContext, event: T, fields: EventFields[T]): void {
  ctx.events.push({ event, ...fields });
}
