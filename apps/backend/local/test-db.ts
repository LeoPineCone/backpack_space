/**
 * A throwaway backend database for automated checks (interface tests, browser runs): DynamoDB Local in memory in its
 * own container on a free port, with the tables and a small bot pool. Nothing of `npm run db` is touched.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadGameData, loadMeta } from "@backpack-space/core/node";
import { DynamoBackpackPool, documentClient } from "../src/adapters/dynamodb.js";
import { defaultSettings } from "../src/fakes/index.js";
import { BotNames, replaceBotPool, seedPool } from "../src/seed/bot-pool.js";
import { createTables, localClient, waitForDb } from "./tables.js";

export interface Tables {
  players: string;
  backpacks: string;
  actions: string;
}

/** The same image as `npm run db` (one place: local/compose.yaml). */
function dbImage(): string {
  const compose = readFileSync(new URL("./compose.yaml", import.meta.url), "utf8");
  const m = /image:\s*(\S+)/.exec(compose);
  if (!m?.[1]) throw new Error("no image in apps/backend/local/compose.yaml");
  return m[1];
}

const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8" }).trim();

/** Starts DynamoDB Local in memory on a free port (needs Docker). */
export function startTestDb(): { endpoint: string; stop: () => void } {
  const container = docker("run", "-d", "--rm", "-p", "127.0.0.1::8000", dbImage(), "-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb");
  const stop = () => void docker("stop", container);
  try {
    const port = docker("port", container, "8000").split("\n")[0]?.split(":").pop();
    return { endpoint: `http://127.0.0.1:${port}`, stop };
  } catch (e) {
    stop();
    throw e;
  }
}

/** Creates the tables and fills the pool with one bot backpack per bucket and tier (`npm run seed` in miniature). */
export async function prepareTestDb(endpoint: string, tables: Tables): Promise<void> {
  const client = localClient(endpoint);
  await waitForDb(client);
  await createTables(client, tables);
  const data = loadGameData();
  const names = BotNames.parse(JSON.parse(readFileSync(new URL("../../../data/bot-names.json", import.meta.url), "utf8")));
  const { entries } = seedPool(data, loadMeta(data), names, { seed: 1, perBucket: 1, perEasyBucket: 1, playersPerGroup: 4, season: 1, maxLobbies: 4 });
  const values = { ...defaultSettings(), tables };
  const pool = new DynamoBackpackPool(documentClient({ endpoint, region: "local" }), { get: async () => values });
  await replaceBotPool(pool, data, entries, { today: "2026-11-18", seed: 1 });
}
