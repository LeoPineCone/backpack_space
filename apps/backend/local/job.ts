/**
 * `npm run job -- <name>` (BE-14): runs one timed job once against the local tables, the same code as the `jobs`
 * Lambda (src/jobs). Names: `season` (move profiles into the season running now), `actions` (delete expired shop
 * actions). `npm run db` first.
 */
import { JOB_NAMES, runJob, type JobName } from "../src/jobs/index.js";
import { localPorts } from "./server.js";
import { loadLocalSettings } from "./settings.js";

const name = process.argv[2] as JobName;
if (!JOB_NAMES.includes(name)) {
  console.error(`usage: npm run job -- <${JOB_NAMES.join("|")}>`);
  process.exit(1);
}
const { values } = loadLocalSettings();
const r = await runJob(localPorts(values), name);
console.log(`Job ${r.job}: looked at ${r.seen}, changed ${r.changed}.`);
