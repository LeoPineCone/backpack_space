import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ESLint } from "eslint";
import type { Route } from "@backpack-space/api";
import { createRouter, type DomainFn, type TokenCheck } from "../src/http/router.js";
import { ApiError, type Ports } from "../src/domain/context.js";
import { lambdaHandler } from "../src/handlers/lambda.js";
import {
  FakeActionStore,
  FakeBackpackPool,
  FakeClock,
  FakeIdentityCheck,
  FakePlayerStore,
  FakeRandom,
  FakeRevenueCat,
  FakeSettings,
  MemoryLog,
} from "../src/fakes/index.js";

const fakePorts = () => {
  const log = new MemoryLog();
  const settings = new FakeSettings();
  const ports: Ports = {
    clock: new FakeClock(),
    random: new FakeRandom(),
    settings,
    players: new FakePlayerStore(),
    backpacks: new FakeBackpackPool(),
    actions: new FakeActionStore(),
    identity: new FakeIdentityCheck(),
    revenuecat: new FakeRevenueCat(),
    log,
  };
  return { ports, log, settings };
};

// A small route table of its own, so the router is tested apart from the real routes.
const table = {
  config: { method: "GET", path: "/config", auth: false, request: z.strictObject({}), response: z.strictObject({ ok: z.boolean() }) },
  echo: {
    method: "POST",
    path: "/echo",
    auth: true,
    request: z.strictObject({ n: z.number().int().max(10) }),
    response: z.strictObject({ n: z.number(), player: z.string() }),
  },
  broken: { method: "POST", path: "/broken", auth: false, request: z.strictObject({}), response: z.strictObject({ ok: z.boolean() }) },
} satisfies Record<string, Route>;

const tokens: TokenCheck = async (t) => (t === "good" ? "player-1" : null);
const steps: string[] = [];
const routes: Record<string, DomainFn> = {
  config: async () => ({ ok: true }),
  echo: async (ctx, body) => {
    steps.push("domain");
    const { n } = body as { n: number };
    if (n === 7) throw new ApiError("run_conflict");
    return { n, player: ctx.playerId! };
  },
  broken: async () => ({ ok: "not a boolean" }),
};

function setup() {
  const f = fakePorts();
  const router = createRouter({ ports: f.ports, routes: routes as never, tokens, table });
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    router({
      method,
      path,
      headers: { "x-app-version": "1.0.0", authorization: "Bearer good", ...headers },
      body: body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
    });
  return { ...f, call };
}
const errorOf = (r: { body: string }) => (JSON.parse(r.body) as { error?: string }).error;

describe("router", () => {
  it("runs a request through every step and answers", async () => {
    const { call, log } = setup();
    steps.length = 0;
    const r = await call("POST", "/echo", { n: 3 });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ n: 3, player: "player-1" });
    expect(steps).toEqual(["domain"]);
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({ type: "request", route: "echo", player: "player-1", status: 200, error: null, appVersion: "1.0.0" });
  });

  it("answers not_found for unknown paths and methods", async () => {
    const { call } = setup();
    expect(errorOf(await call("GET", "/nope"))).toBe("not_found");
    expect((await call("GET", "/echo")).status).toBe(404);
  });

  it("refuses bodies that miss the schema, are not JSON or are too large, before the token is looked at", async () => {
    const { call } = setup();
    steps.length = 0;
    for (const body of [{ n: "3" }, { n: 11 }, { n: 3, extra: true }, {}, "{not json", JSON.stringify({ n: 1, pad: "x".repeat(20_000) })]) {
      const r = await call("POST", "/echo", body, { authorization: "Bearer bad" });
      expect(r.status, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect(errorOf(r)).toBe("bad_request");
    }
    expect(steps).toEqual([]);
  });

  it("refuses a missing or wrong token", async () => {
    const { call } = setup();
    expect(errorOf(await call("POST", "/echo", { n: 1 }, { authorization: "Bearer bad" }))).toBe("unauthorized");
    expect(errorOf(await call("POST", "/echo", { n: 1 }, { authorization: "" }))).toBe("unauthorized");
    expect((await call("POST", "/echo", { n: 1 }, { authorization: "good" })).status).toBe(401);
  });

  it("answers maintenance and update_required, but /config still answers", async () => {
    const { call, settings } = setup();
    settings.values.maintenance = { on: true, textKey: "maint.update" };
    const m = await call("POST", "/echo", { n: 1 });
    expect(m.status).toBe(503);
    expect(JSON.parse(m.body)).toEqual({ error: "maintenance", textKey: "maint.update" });
    expect((await call("GET", "/config")).status).toBe(200);
    settings.values.maintenance = { on: false };
    settings.values.minAppVersion = "1.2.0";
    expect(errorOf(await call("POST", "/echo", { n: 1 }, { "x-app-version": "1.1.9" }))).toBe("update_required");
    expect(errorOf(await call("POST", "/echo", { n: 1 }, { "x-app-version": "" }))).toBe("bad_request");
    expect((await call("POST", "/echo", { n: 1 }, { "x-app-version": "1.10.0" })).status).toBe(200);
    expect((await call("GET", "/config", undefined, { "x-app-version": "0.0.1" })).status).toBe(200);
  });

  it("turns a domain refusal into its code and anything else into internal", async () => {
    const { call, log } = setup();
    const r = await call("POST", "/echo", { n: 7 });
    expect(r.status).toBe(409);
    expect(errorOf(r)).toBe("run_conflict");
    const b = await call("POST", "/broken", {});
    expect(b.status).toBe(500);
    expect(errorOf(b)).toBe("internal");
    expect(log.lines.filter((l) => l.type === "request")).toHaveLength(2);
  });

  it("serves the same router from a Lambda event", async () => {
    const f = fakePorts();
    const handler = lambdaHandler(createRouter({ ports: f.ports, routes: routes as never, tokens, table }));
    const res = await handler({
      rawPath: "/echo",
      requestContext: { http: { method: "POST" } },
      headers: { "X-App-Version": "1.0.0", Authorization: "Bearer good" },
      body: Buffer.from(JSON.stringify({ n: 2 })).toString("base64"),
      isBase64Encoded: true,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ n: 2, player: "player-1" });
  });
});

describe("domain import rule", () => {
  const eslint = new ESLint();
  const lint = async (code: string) => (await eslint.lintText(code, { filePath: "apps/backend/src/domain/probe.ts" }))[0]!.messages.map((m) => m.ruleId);
  it("refuses AWS, Node, clock and random in src/domain", async () => {
    expect(await lint('import { DynamoDBClient } from "@aws-sdk/client-dynamodb";\nexport const c = DynamoDBClient;\n')).toContain("no-restricted-imports");
    expect(await lint('import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n')).toContain("no-restricted-imports");
    expect(await lint("export const t = Date.now();\n")).toContain("no-restricted-properties");
    expect(await lint("export const t = new Date();\n")).toContain("no-restricted-syntax");
    expect(await lint("export const r = Math.random();\n")).toContain("no-restricted-properties");
    expect(await lint("export const r = crypto.randomUUID();\n")).toContain("no-restricted-syntax");
  });
  it("lets the domain use dates it was given", async () => {
    expect(await lint("export const d = (ms: number) => new Date(ms).toISOString();\n")).toEqual([]);
  });
});
