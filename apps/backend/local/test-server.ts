/**
 * `npm run backend:test`: the local backend on a throwaway database for the browser runs (e2e/runs.e2e.ts).
 * DynamoDB Local runs in memory in its own container (Docker), or at `TEST_DB_ENDPOINT` when one is given (CI starts
 * it as a service). The server listens on `TEST_BACKEND_PORT` (default 3100) until it is stopped.
 */
import { prepareTestDb, startTestDb } from "./test-db.js";
import { startServer } from "./server.js";

const given = process.env.TEST_DB_ENDPOINT;
const db = given ? { endpoint: given, stop: () => {} } : startTestDb();
const port = Number(process.env.TEST_BACKEND_PORT ?? 3100);
try {
  const tables = { players: "e2e-players", backpacks: "e2e-backpacks", actions: "e2e-actions" };
  await prepareTestDb(db.endpoint, tables);
  const server = await startServer({ port, dynamodb: { endpoint: db.endpoint, region: "local" }, tables, devIdentity: true }, { write: () => {} });
  console.log(`Test backend at ${server.url} (database: ${db.endpoint})`);
  const stop = () => {
    db.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (e) {
  db.stop();
  throw e;
}
