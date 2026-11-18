import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";

const url = inject("apiUrl");
const logFile = inject("logFile");

const linesOf = (requestId: string) =>
  readFileSync(logFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((l) => l.requestId === requestId);

describe.skipIf(!logFile)("log lines of the local backend", () => {
  it("writes exactly one request line per request, with the request id it sends back", async () => {
    for (const path of ["/config", "/no-such-path"]) {
      const res = await fetch(`${url}${path}`, { headers: { "x-app-version": "1.0.0" } });
      const id = res.headers.get("x-request-id");
      expect(id).toBeTruthy();
      const lines = linesOf(id!);
      expect(lines.filter((l) => l.type === "request")).toHaveLength(1);
      expect(lines[0]).toMatchObject({ type: "request", status: res.status });
    }
  });
});
