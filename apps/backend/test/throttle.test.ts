import { ROUTES } from "@backpack-space/api";
import { describe, expect, it } from "vitest";
import { loadLocalSettings, toSettingsValues } from "../local/settings.js";
import { createApp } from "../src/app.js";
import { fakePorts } from "../src/fakes/index.js";
import { TokenBuckets } from "../src/http/throttle.js";

describe("request limits per route (BE-06)", () => {
  it("lets a burst through, then refills at the steady rate", () => {
    const b = new TokenBuckets();
    const limit = { rate: 2, burst: 3 };
    const t0 = 1_000_000;
    expect([1, 2, 3, 4].map(() => b.take("runFight", limit, t0))).toEqual([true, true, true, false]);
    expect(b.take("runFight", limit, t0 + 499)).toBe(false);
    expect(b.take("runFight", limit, t0 + 500)).toBe(true);
    // routes have their own buckets, and a route without a limit has none
    expect(b.take("runStart", limit, t0)).toBe(true);
    expect(Array.from({ length: 100 }, () => b.take("config", undefined, t0)).every(Boolean)).toBe(true);
    // a long pause does not save up more than the burst
    expect([1, 2, 3, 4].map(() => b.take("runFight", limit, t0 + 60_000))).toEqual([true, true, true, false]);
  });

  it("answers rate_limited above the limit and still writes one request line", async () => {
    const f = fakePorts();
    f.settings.values.limits = { config: { rate: 1, burst: 2 } };
    const app = createApp(f.ports, { throttle: new TokenBuckets() });
    const get = () => app({ method: "GET", path: "/config", headers: { "x-app-version": "1.0.0" }, body: null });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await get()).status);
    expect(statuses).toEqual([200, 200, 429, 429]);
    expect(JSON.parse((await get()).body)).toEqual({ error: "rate_limited" });
    const lines = f.log.lines.filter((l) => l.type === "request");
    expect(lines).toHaveLength(5);
    expect(lines.at(-1)).toMatchObject({ route: "config", status: 429, error: "rate_limited" });
    f.clock.advance(1);
    expect((await get()).status).toBe(200);
  });

  it("is not applied without a throttle (in the cloud the HTTP API does it)", async () => {
    const f = fakePorts();
    f.settings.values.limits = { config: { rate: 1, burst: 1 } };
    const app = createApp(f.ports);
    for (let i = 0; i < 3; i++) expect((await app({ method: "GET", path: "/config", headers: { "x-app-version": "1.0.0" }, body: null })).status).toBe(200);
  });

  it("has a limit for every route in the example settings", () => {
    const values = toSettingsValues(loadLocalSettings().values);
    for (const name of Object.keys(ROUTES)) expect(values.limits?.[name], name).toMatchObject({ rate: expect.any(Number), burst: expect.any(Number) });
  });
});
