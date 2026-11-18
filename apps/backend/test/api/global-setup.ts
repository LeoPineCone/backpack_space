/**
 * Starts a fresh DynamoDB Local (in memory, own container on a free port), creates the tables and starts the local
 * server on a free port. Everything is thrown away afterwards, so the tests never see data of `npm run db`.
 * With API_URL set (for example the test environment after a deployment) nothing is started.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { TestProject } from "vitest/node";
import { startServer } from "../../local/server.js";
import { createTables, localClient, waitForDb } from "../../local/tables.js";

declare module "vitest" {
  export interface ProvidedContext {
    apiUrl: string;
    /** empty when the tests run against an external backend */
    dbEndpoint: string;
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
    const server = await startServer({ port: 0, dynamodb: { endpoint, region: "local" }, tables }, { write: () => {} });
    project.provide("apiUrl", server.url);
    project.provide("dbEndpoint", endpoint);
    return async () => {
      await server.close();
      docker("stop", container);
    };
  } catch (e) {
    docker("stop", container);
    throw e;
  }
}
