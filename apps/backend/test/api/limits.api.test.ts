import { describe, expect, inject, it } from "vitest";
import { startServer } from "../../local/server.js";

const endpoint = inject("dbEndpoint");
const tables = { players: "test-players", backpacks: "test-backpacks", actions: "test-actions" };

describe.skipIf(!endpoint)("request limits over HTTP", () => {
  it("answers a burst above the limit with rate_limited", async () => {
    const server = await startServer(
      { port: 0, dynamodb: { endpoint, region: "local" }, tables, limits: { config: { rate: 1, burst: 3 } } },
      { write: () => {} },
    );
    try {
      const res = await Promise.all(Array.from({ length: 8 }, () => fetch(`${server.url}/config`, { headers: { "x-app-version": "1.0.0" } })));
      const statuses = res.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(3);
      expect(statuses.filter((s) => s === 429)).toHaveLength(5);
      expect(await res.find((r) => r.status === 429)!.json()).toEqual({ error: "rate_limited" });
    } finally {
      await server.close();
    }
  });
});
