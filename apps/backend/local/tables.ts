/** Creates the three tables (src/tables.ts) in DynamoDB Local if they do not exist yet. */
import { CreateTableCommand, DynamoDBClient, ListTablesCommand, UpdateTimeToLiveCommand } from "@aws-sdk/client-dynamodb";
import { createTableRequest, TABLE_NAMES, TABLES, type TableName } from "../src/tables.js";

export function localClient(endpoint: string, region = "local"): DynamoDBClient {
  return new DynamoDBClient({ endpoint, region, credentials: { accessKeyId: "local", secretAccessKey: "local" } });
}

/** Returns the physical names it created (existing tables are kept with their data). */
export async function createTables(client: DynamoDBClient, names: Record<TableName, string>): Promise<string[]> {
  const existing = new Set((await client.send(new ListTablesCommand({}))).TableNames ?? []);
  const created: string[] = [];
  for (const table of TABLE_NAMES) {
    const name = names[table];
    if (existing.has(name)) continue;
    await client.send(new CreateTableCommand(createTableRequest(table, name)));
    const ttl = TABLES[table].expiresField;
    if (ttl) await client.send(new UpdateTimeToLiveCommand({ TableName: name, TimeToLiveSpecification: { AttributeName: ttl, Enabled: true } }));
    created.push(name);
  }
  return created;
}

/** Waits until DynamoDB Local answers (the container needs a moment after start). */
export async function waitForDb(client: DynamoDBClient, timeoutMs = 30_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      await client.send(new ListTablesCommand({}));
      return;
    } catch (e) {
      if (Date.now() > until) throw new Error(`DynamoDB Local did not answer within ${timeoutMs / 1000} s: ${String(e)}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
