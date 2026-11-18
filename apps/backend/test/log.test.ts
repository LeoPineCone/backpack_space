import { readFileSync } from "node:fs";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { Route } from "@backpack-space/api";
import { createApp } from "../src/app.js";
import { createRouter, type DomainFn } from "../src/http/router.js";
import { EVENT_TYPES, logEvent } from "../src/domain/log.js";
import { fakePorts } from "../src/fakes/index.js";
import { lambdaHandler } from "../src/handlers/lambda.js";

// A route that receives what must never reach a log: a player name and a store identity.
const table = {
  config: { method: "GET", path: "/config", auth: false, request: z.strictObject({}), response: z.strictObject({ ok: z.boolean() }) },
  fight: {
    method: "POST",
    path: "/fight",
    auth: true,
    request: z.strictObject({ name: z.string(), storeId: z.string(), simVersion: z.string() }),
    response: z.strictObject({ ok: z.boolean() }),
  },
} satisfies Record<string, Route>;

const fight: DomainFn = async (ctx) => {
  logEvent(ctx, "fight", { runId: "run-1", round: 3, result: "win", simVersion: ctx.simVersion ?? "" });
  return { ok: true };
};

const setup = () => {
  const f = fakePorts();
  const call = createRouter({ ports: f.ports, routes: { fight } as never, tokens: async (t) => (t === "good" ? "player-7" : null), table });
  return { ...f, call };
};

const post = (body: unknown, requestId?: string) => ({
  method: "POST",
  path: "/fight",
  headers: { "x-app-version": "1.0.0", authorization: "Bearer good" },
  body: JSON.stringify(body),
  ...(requestId ? { requestId } : {}),
});

describe("request and event lines", () => {
  it("writes one request line with the fixed fields, then the event lines", async () => {
    const { call, log } = setup();
    await call(post({ name: "Captain Zorb", storeId: "G:1234567", simVersion: "2-abc" }, "req-1"));
    expect(log.lines).toHaveLength(2);
    const [request, event] = log.lines;
    expect(Object.keys(request!).sort()).toEqual(["appVersion", "error", "ms", "player", "requestId", "route", "simVersion", "status", "time", "type"]);
    expect(request).toMatchObject({ type: "request", requestId: "req-1", route: "fight", player: "player-7", status: 200, simVersion: "2-abc" });
    expect(event).toMatchObject({ type: "event", event: "fight", requestId: "req-1", player: "player-7", runId: "run-1", round: 3, result: "win" });
  });

  it("never writes a name, a store identity or the path of an unknown route", async () => {
    const { call, log } = setup();
    const secrets = ["Captain Zorb", "G:1234567", "/players/Captain-Zorb"];
    await call(post({ name: secrets[0], storeId: secrets[1], simVersion: "2-abc" }));
    await call(post({ name: secrets[0], storeId: secrets[1] })); // refused by the schema
    await call({ ...post({ name: secrets[0], storeId: secrets[1], simVersion: "x" }), headers: { "x-app-version": "1.0.0", authorization: "Bearer forged" } });
    await call({ method: "GET", path: secrets[2]!, headers: {}, body: null });
    expect(log.lines.filter((l) => l.type === "request")).toHaveLength(4);
    const text = JSON.stringify(log.lines);
    for (const s of secrets) expect(text).not.toContain(s);
    expect(text).not.toContain("Bearer");
  });

  it("still answers and logs once when the settings cannot be read", async () => {
    const { call, log, ports } = setup();
    ports.settings.get = async () => {
      throw new Error("parameter store down");
    };
    const res = await call(post({ name: "a", storeId: "b", simVersion: "1" }));
    expect(res.status).toBe(500);
    expect(log.lines.map((l) => l.type)).toEqual(["request", "event"]);
    expect(log.lines[1]).toMatchObject({ event: "error", message: "parameter store down" });
  });

  it("sends the request id back and takes it from the Lambda event", async () => {
    const { ports, log } = fakePorts();
    const handler = lambdaHandler(createApp(ports));
    const out = await handler({ rawPath: "/config", requestContext: { requestId: "aws-42", http: { method: "GET" } }, headers: {} });
    expect(out.headers["x-request-id"]).toBe("aws-42");
    expect(log.lines[0]).toMatchObject({ requestId: "aws-42", route: "config" });
  });

  it("knows every event of docs/backend.md", () => {
    const doc = readFileSync("docs/backend.md", "utf8");
    const line = doc.split("\n").find((l) => l.startsWith("- **One line per event that counts**"));
    const named = [...(line ?? "").matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(5);
    expect([...EVENT_TYPES].filter((e) => e !== "error").sort()).toEqual([...named].sort());
  });
});
