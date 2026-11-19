/**
 * POST /reports/error (BE-15, docs/backend.md "Logs and numbers"): the app reports an unhandled error or crash, and it
 * becomes one event line next to the request line, with app and simulation version. Our own endpoint, so no crash
 * service of another company sees anything. No sign-in needed: a crash can come before it, and the report carries no
 * player id.
 */
import type { ClientErrorRequest, ClientErrorResponse } from "@backpack-space/api";
import type { DomainContext } from "./context.js";
import { logEvent } from "./log.js";

/** Removes what could identify a person from code text: query strings of addresses (tokens, player names in dev links). */
export const scrub = (s: string) => s.replace(/\?[^\s)'"]*/g, "?…");

export async function clientError(ctx: DomainContext, body: unknown): Promise<ClientErrorResponse> {
  const r = body as ClientErrorRequest;
  logEvent(ctx, "client_error", {
    kind: r.kind,
    message: scrub(r.message),
    stack: r.stack === undefined ? null : scrub(r.stack),
    appVersion: ctx.appVersion ?? null,
    simVersion: r.simVersion,
  });
  return { received: true };
}
