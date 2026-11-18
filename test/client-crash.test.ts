import { describe, expect, it } from "vitest";
import { ClientErrorRequest } from "@backpack-space/api";
import { createReporter, installCrashReports, MAX_REPORTS, type ErrorSource } from "../apps/client/src/crash";

describe("client crash reports (BE-15)", () => {
  it("sends an uncaught error with its stack and the simulation version, each message once", () => {
    const sent: unknown[] = [];
    const report = createReporter(async (r) => sent.push(r), "3.abc");
    const listeners: Record<string, (ev: unknown) => void> = {};
    const source = { addEventListener: (type: string, fn: (ev: never) => void) => void (listeners[type] = fn as (ev: unknown) => void) } as ErrorSource;
    installCrashReports(source, report);

    const boom = new TypeError("cannot read x");
    listeners.error!({ error: boom, message: boom.message });
    listeners.error!({ error: boom, message: boom.message });
    listeners.unhandledrejection!({ reason: "no answer" });

    expect(sent).toHaveLength(2);
    expect(ClientErrorRequest.parse(sent[0])).toMatchObject({ kind: "error", message: "TypeError: cannot read x", simVersion: "3.abc" });
    expect((sent[0] as { stack: string }).stack).toContain("cannot read x");
    expect(sent[1]).toEqual({ kind: "rejection", message: "no answer", simVersion: "3.abc" });
  });

  it("stops after a few reports and never fails itself", () => {
    let calls = 0;
    const report = createReporter(async () => {
      calls++;
      throw new Error("backend down");
    }, "3.abc");
    for (let i = 0; i < MAX_REPORTS + 5; i++) report("error", new Error(`e${i}`));
    expect(calls).toBe(MAX_REPORTS);
    expect(report("error", new Error("x".repeat(1000)))).toBeNull();
  });
});
