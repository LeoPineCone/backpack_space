/**
 * The local backend (DEV-02): a small Node HTTP server that calls the same router as the Lambdas. No second
 * implementation: it only turns Node's request into the router's request and back.
 * `npm run backend` starts it with the local settings against DynamoDB Local (`npm run db` first).
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { MAX_BODY_BYTES } from "@backpack-space/api";
import { createApp } from "../src/app.js";
import { DynamoActionStore, DynamoBackpackPool, DynamoPlayerStore, documentClient } from "../src/adapters/dynamodb.js";
import { cryptoRandom, stdoutLog, systemClock } from "../src/adapters/system.js";
import type { Ports } from "../src/domain/context.js";
import type { HttpRequest, HttpResponse } from "../src/http/types.js";
import type { LogSink } from "../src/ports/index.js";
import { loadLocalSettings, localSettingsPort, type LocalSettings } from "./settings.js";

/** Reads at most one byte more than allowed, so the router can refuse an oversized body without us holding it. */
async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    if (size > MAX_BODY_BYTES) continue;
    chunks.push(chunk);
    size += chunk.length;
  }
  if (size === 0) return null;
  return Buffer.concat(chunks)
    .subarray(0, MAX_BODY_BYTES + 1)
    .toString("utf8");
}

// The client runs on another port in development; the cloud API sets its own CORS rules.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-app-version",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function localPorts(values: LocalSettings, overrides: Partial<LocalSettings> = {}, log: LogSink = stdoutLog): Ports {
  const settings = localSettingsPort(systemClock, overrides);
  const doc = documentClient(values.dynamodb);
  return {
    clock: systemClock,
    random: cryptoRandom,
    settings,
    players: new DynamoPlayerStore(doc, settings),
    backpacks: new DynamoBackpackPool(doc, settings),
    actions: new DynamoActionStore(doc, settings),
    // sign-in checks come with the sign-in issue; until then nobody is accepted
    identity: { check: async () => null },
    // RevenueCat comes in M4
    revenuecat: { balance: async () => 0 },
    log,
  };
}

export interface RunningServer {
  url: string;
  server: Server;
  close(): Promise<void>;
}

/** Starts the local backend; `overrides` replace values of the settings file (tests: ports, tables). */
export async function startServer(overrides: Partial<LocalSettings> = {}, log?: LogSink): Promise<RunningServer> {
  const { values } = loadLocalSettings(overrides);
  const route = createApp(localPorts(values, overrides, log));
  const server = createServer((req, res) => {
    void (async () => {
      let out: HttpResponse;
      if (req.method === "OPTIONS") out = { status: 204, headers: {}, body: "" };
      else {
        const headers: HttpRequest["headers"] = {};
        for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : v;
        const path = new URL(req.url ?? "/", "http://local").pathname;
        out = await route({ method: req.method ?? "GET", path, headers, body: await readBody(req) });
      }
      res.writeHead(out.status, { ...out.headers, ...CORS });
      res.end(out.body);
    })().catch((e: unknown) => {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify({ error: "internal" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(values.port, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { values, file } = loadLocalSettings();
  const { url } = await startServer();
  console.log(`Backend at ${url} (settings: ${file}, database: ${values.dynamodb.endpoint})`);
}
