/**
 * Starts a fresh DynamoDB Local (in memory, own container on a free port), creates the tables and starts the local
 * server on a free port. Everything is thrown away afterwards, so the tests never see data of `npm run db`.
 * With API_URL set (for example the test environment after a deployment) nothing is started.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { startServer } from "../../local/server.js";
import { createTables, localClient, waitForDb } from "../../local/tables.js";
import { loadGameData, loadMeta } from "@backpack-space/core/node";
import { DynamoBackpackPool, documentClient } from "../../src/adapters/dynamodb.js";
import { defaultSettings } from "../../src/fakes/index.js";
import { BotNames, replaceBotPool, seedPool } from "../../src/seed/bot-pool.js";

declare module "vitest" {
  export interface ProvidedContext {
    apiUrl: string;
    /** empty when the tests run against an external backend */
    dbEndpoint: string;
    /** the local server's log, one JSON line each; empty when the tests run against an external backend */
    logFile: string;
  }
}

/** The same image as `npm run db` (one place: local/compose.yaml). */
function dbImage(): string {
  const compose = readFileSync(new URL("../../local/compose.yaml", import.meta.url), "utf8");
  const m = /image:\s*(\S+)/.exec(compose);
  if (!m?.[1]) throw new Error("no image in apps/backend/local/compose.yaml");
  return m[1];
}

export default async function setup(project: TestProject) {
  const external = process.env.API_URL;
  if (external) {
    project.provide("apiUrl", external.replace(/\/$/, ""));
    project.provide("dbEndpoint", "");
    project.provide("logFile", "");
    return;
  }
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8" }).trim();
  const container = docker("run", "-d", "--rm", "-p", "127.0.0.1::8000", dbImage(), "-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb");
  try {
    const port = docker("port", container, "8000").split("\n")[0]?.split(":").pop();
    const endpoint = `http://127.0.0.1:${port}`;
    const tables = { players: "test-players", backpacks: "test-backpacks", actions: "test-actions" };
    const client = localClient(endpoint);
    await waitForDb(client);
    await createTables(client, tables);
    await seedSmallPool(endpoint, tables);
    const logFile = join(mkdtempSync(join(tmpdir(), "backpack-space-api-")), "log.jsonl");
    writeFileSync(logFile, "");
    const server = await startServer(
      { port: 0, dynamodb: { endpoint, region: "local" }, tables },
      { write: (l) => appendFileSync(logFile, JSON.stringify(l) + "\n") },
    );
    project.provide("apiUrl", server.url);
    project.provide("dbEndpoint", endpoint);
    project.provide("logFile", logFile);
    return async () => {
      await server.close();
      docker("stop", container);
      checkOneLinePerRequest(logFile);
    };
  } catch (e) {
    docker("stop", container);
    throw e;
  }
}

/** BE-09: every request of the interface tests wrote exactly one request line. */
function checkOneLinePerRequest(logFile: string) {
  const lines = readFileSync(logFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; requestId?: string });
  const count = new Map<string, number>();
  for (const l of lines) if (l.type === "request") count.set(l.requestId ?? "none", (count.get(l.requestId ?? "none") ?? 0) + 1);
  const wrong = [...count].filter(([id, n]) => id === "none" || n !== 1);
  if (wrong.length > 0) throw new Error(`requests without exactly one log line: ${JSON.stringify(wrong)}`);
}

/** A small bot pool (one backpack per bucket and tier), so runs can be played over HTTP (`npm run seed` in miniature). */
async function seedSmallPool(endpoint: string, tables: { players: string; backpacks: string; actions: string }) {
  const data = loadGameData();
  const names = BotNames.parse(JSON.parse(readFileSync(new URL("../../../../data/bot-names.json", import.meta.url), "utf8")));
  const { entries } = seedPool(data, loadMeta(data), names, { seed: 1, perBucket: 1, perEasyBucket: 1, playersPerGroup: 4, season: 1, maxLobbies: 4 });
  const values = { ...defaultSettings(), tables };
  const pool = new DynamoBackpackPool(documentClient({ endpoint, region: "local" }), { get: async () => values });
  await replaceBotPool(pool, data, entries, { today: "2026-11-18", seed: 1 });
}
