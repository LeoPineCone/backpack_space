/**
 * The one router (DEV-02): it maps method and path to a domain function. The Lambda handlers and the local server
 * both call `handle`, so a path is defined in exactly one place (`ROUTES` in packages/api).
 *
 * Every request goes through the same steps (docs/backend.md):
 *   1. schema check of the body (fields, types, size)
 *   2. session token check (routes with `auth`); the player id comes from the token
 *   3. maintenance and version check (not for /config, which reports both)
 *   4. the domain function
 *   5. the answer, checked against the response schema, or a fixed error code
 *   6. one JSON log line
 */
import {
  APP_VERSION_HEADER,
  AUTH_HEADER,
  AppVersion,
  ERROR_STATUS,
  MAX_BODY_BYTES,
  ROUTES,
  type ErrorCode,
  type Route,
  type RouteName,
} from "@backpack-space/api";
import { ApiError, type DomainContext, type Ports } from "../domain/context.js";
import { logEvent } from "../domain/log.js";
import type { HttpRequest, HttpResponse } from "./types.js";
import { compareVersions } from "./version.js";

/** A domain function: gets the checked body, returns the answer body. */
export type DomainFn = (ctx: DomainContext, body: unknown) => Promise<unknown>;

/** Checks a session token; returns the player id, or null when the token is missing, expired or forged. */
export type TokenCheck = (token: string, ctx: DomainContext) => Promise<string | null>;

export interface RouterOptions {
  ports: Ports;
  /** which routes this router serves (a Lambda serves only its own) */
  routes: Partial<Record<RouteName, DomainFn>>;
  tokens: TokenCheck;
  /** the route table; tests may pass their own */
  table?: Record<string, Route>;
}

/** Routes that answer in maintenance and to old apps: the app must learn about both from them. */
const ALWAYS_OPEN = new Set<string>(["config"]);

const json = (status: number, body: unknown): HttpResponse => ({
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(body),
});
const fail = (code: ErrorCode, textKey?: string) => json(ERROR_STATUS[code], textKey ? { error: code, textKey } : { error: code });

export function createRouter(opts: RouterOptions): (req: HttpRequest) => Promise<HttpResponse> {
  const table: Record<string, Route> = opts.table ?? ROUTES;
  const byKey = new Map(Object.entries(table).map(([name, r]) => [`${r.method} ${r.path}`, { name, route: r }]));

  return async (req) => {
    const started = opts.ports.clock.now();
    const found = byKey.get(`${req.method.toUpperCase()} ${req.path}`);
    // settings are read first thing inside the try, so a failing read still answers and logs
    const ctx: DomainContext = { ports: opts.ports, settings: undefined as never, events: [] };
    let res: HttpResponse;
    try {
      ctx.settings = await opts.ports.settings.get();
      res = await run(found, req, ctx);
    } catch (e) {
      res = e instanceof ApiError ? fail(e.code, e.textKey) : fail("internal");
      if (!(e instanceof ApiError)) logEvent(ctx, "error", { message: String((e as Error)?.message ?? e).slice(0, 200) });
    }
    if (req.requestId) res.headers["x-request-id"] = req.requestId;
    writeLines(req, res, ctx, found?.name, started);
    return res;
  };

  /**
   * Step 6 (BE-09): exactly one request line, then the event lines of the request. Only fixed fields: no names,
   * no store identities, no backpacks, and not the path of an unknown route (it is whatever the caller sent).
   */
  function writeLines(req: HttpRequest, res: HttpResponse, ctx: DomainContext, route: string | undefined, started: number) {
    const now = opts.ports.clock.now();
    const errorCode = res.status >= 400 ? (JSON.parse(res.body) as { error?: string }).error : undefined;
    const player = ctx.playerId ?? null;
    opts.ports.log.write({
      type: "request",
      time: new Date(started).toISOString(),
      requestId: req.requestId ?? null,
      route: route ?? "unknown",
      player,
      status: res.status,
      error: errorCode ?? null,
      ms: now - started,
      appVersion: ctx.appVersion ?? null,
      simVersion: ctx.simVersion ?? null,
    });
    for (const e of ctx.events) opts.ports.log.write({ type: "event", time: new Date(now).toISOString(), requestId: req.requestId ?? null, player, ...e });
  }

  async function run(found: { name: string; route: Route } | undefined, req: HttpRequest, ctx: DomainContext): Promise<HttpResponse> {
    const fn = found && opts.routes[found.name as RouteName];
    if (!found || !fn) return fail("not_found");
    const { name, route } = found;

    // 1. schema check
    if (req.body && req.body.length > MAX_BODY_BYTES) return fail("bad_request");
    let raw: unknown = {};
    if (route.method !== "GET" && req.body) {
      try {
        raw = JSON.parse(req.body);
      } catch {
        return fail("bad_request");
      }
    }
    const parsed = route.request.safeParse(raw);
    if (!parsed.success) return fail("bad_request");
    const version = req.headers[APP_VERSION_HEADER];
    if (version !== undefined && !AppVersion.safeParse(version).success) return fail("bad_request");
    ctx.appVersion = version;
    const sim = (parsed.data as { simVersion?: unknown } | undefined)?.simVersion;
    if (typeof sim === "string") ctx.simVersion = sim;

    // 2. token check
    if (route.auth) {
      const header = req.headers[AUTH_HEADER] ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const player = token ? await opts.tokens(token, ctx) : null;
      if (!player) return fail("unauthorized");
      ctx.playerId = player;
    }

    // 3. maintenance and version
    if (!ALWAYS_OPEN.has(name)) {
      if (ctx.settings.maintenance.on) return fail("maintenance", ctx.settings.maintenance.textKey);
      if (!version || compareVersions(version, ctx.settings.minAppVersion) < 0) return fail("update_required");
    }

    // 4. domain, 5. answer
    const out = await fn(ctx, parsed.data);
    const checked = route.response.safeParse(out);
    if (!checked.success) throw new Error(`answer of ${name} does not match its schema`);
    return json(200, checked.data);
  }
}
