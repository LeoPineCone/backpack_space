import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { fakePorts } from "../src/fakes/index.js";

describe("client error reports (BE-15)", () => {
  it("logs a reported crash with app and simulation version, without a player and with addresses cut", async () => {
    const f = fakePorts();
    const app = createApp(f.ports);
    const res = await app({
      method: "POST",
      path: "/reports/error",
      headers: { "x-app-version": "1.0.0" },
      body: JSON.stringify({
        kind: "error",
        message: "TypeError: x is undefined",
        stack: "at go (https://app.test/main.js?player=Ann:1:2)",
        simVersion: "3.abc",
      }),
    });
    expect(res.status).toBe(200);
    const lines = f.log.lines;
    expect(lines.find((l) => l.type === "request")).toMatchObject({
      route: "clientError",
      status: 200,
      appVersion: "1.0.0",
      simVersion: "3.abc",
      player: null,
    });
    const ev = lines.find((l) => l.event === "client_error")!;
    expect(ev).toMatchObject({ kind: "error", message: "TypeError: x is undefined", appVersion: "1.0.0", simVersion: "3.abc", player: null });
    expect(String(ev.stack)).not.toContain("Ann");
  });

  it("takes reports in maintenance and from old apps, and refuses oversized ones", async () => {
    const f = fakePorts();
    const s = await f.ports.settings.get();
    f.settings.values = { ...s, maintenance: { on: true }, minAppVersion: "9.0.0" };
    const app = createApp(f.ports);
    const post = (body: unknown) => app({ method: "POST", path: "/reports/error", headers: { "x-app-version": "1.0.0" }, body: JSON.stringify(body) });
    expect((await post({ kind: "rejection", message: "m", simVersion: "3.abc" })).status).toBe(200);
    expect((await post({ kind: "error", message: "m".repeat(301), simVersion: "3.abc" })).status).toBe(400);
  });
});
