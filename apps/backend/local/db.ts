/**
 * `npm run db`        starts DynamoDB Local (Docker) and creates the tables
 * `npm run db:stop`   stops it, keeps the data
 * `npm run db:reset`  stops it and removes the data
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalSettings } from "./settings.js";
import { createTables, localClient, waitForDb } from "./tables.js";

const compose = join(dirname(fileURLToPath(import.meta.url)), "compose.yaml");
const docker = (...args: string[]) => execFileSync("docker", ["compose", "-f", compose, ...args], { stdio: "inherit" });

export async function dbUp(): Promise<void> {
  const { values, file } = loadLocalSettings();
  docker("up", "-d");
  const client = localClient(values.dynamodb.endpoint, values.dynamodb.region);
  await waitForDb(client);
  const created = await createTables(client, values.tables);
  console.log(`DynamoDB Local at ${values.dynamodb.endpoint} (settings: ${file})`);
  console.log(created.length > 0 ? `Created tables: ${created.join(", ")}` : "Tables already exist.");
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const cmd = process.argv[2] ?? "up";
  if (cmd === "up") await dbUp();
  else if (cmd === "stop") docker("stop");
  else if (cmd === "reset") docker("down", "--volumes");
  else {
    console.error(`Unknown command "${cmd}". Use up, stop or reset.`);
    process.exit(1);
  }
}
