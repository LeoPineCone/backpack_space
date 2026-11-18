/**
 * Crash and error reports (BE-15, docs/backend.md "Logs and numbers"): an uncaught error or a failed promise nobody
 * waits for is sent to our own backend (POST /reports/error) with the simulation version; the app version rides in
 * the request header. Only the message and the stack leave the device, never a player id, name or backpack. A
 * session sends each message once and at most `MAX_REPORTS`, so an error in a frame loop does not flood the backend.
 * Without a backend (offline builds) nothing is sent.
 */
import type { ClientErrorRequest } from "@backpack-space/api";

export const MAX_REPORTS = 5;

export type SendReport = (report: ClientErrorRequest) => Promise<unknown>;

/** Turns whatever was thrown into a report; returns the report sent, or null when it was a repeat or over the cap. */
export function createReporter(send: SendReport, simVersion: string) {
  const seen = new Set<string>();
  return (kind: ClientErrorRequest["kind"], thrown: unknown): ClientErrorRequest | null => {
    const e = thrown instanceof Error ? thrown : null;
    const message = (e ? `${e.name}: ${e.message}` : String(thrown)).slice(0, 300);
    if (seen.has(message) || seen.size >= MAX_REPORTS) return null;
    seen.add(message);
    const report: ClientErrorRequest = { kind, message, simVersion, ...(e?.stack ? { stack: e.stack.slice(0, 2000) } : {}) };
    // a failing report must never cause another one
    send(report).catch(() => undefined);
    return report;
  };
}

/** The part of the window the reports listen on (a small shape, so tests need no browser). */
export interface ErrorSource {
  addEventListener(type: "error", fn: (ev: { error?: unknown; message?: string }) => void): void;
  addEventListener(type: "unhandledrejection", fn: (ev: { reason?: unknown }) => void): void;
}

/** Listens for uncaught errors and failed promises on `target` (the window). */
export function installCrashReports(target: ErrorSource, report: ReturnType<typeof createReporter>): void {
  target.addEventListener("error", (ev) => report("error", ev.error ?? ev.message));
  target.addEventListener("unhandledrejection", (ev) => report("rejection", ev.reason));
}
