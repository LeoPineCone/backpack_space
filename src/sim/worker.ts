/**
 * Worker process for parallel measurements: plays a range of lobbies and prints the result as JSON on stdout.
 * Started by runParallel (parallel.ts) with the same Node/tsx flags as the report. Progress: one "." per lobby on stderr.
 */
import { loadGameData, loadRatings } from "@backpack-space/core/node";
import { useRatings } from "./lobby";
import { boostPath, measurePathLobby } from "./paths";
import type { WorkerTask } from "./parallel";

const task = JSON.parse(process.argv[2]!) as WorkerTask;
const data = loadGameData();
useRatings(task.ratings ? loadRatings() : {});
for (const b of task.boost ?? []) boostPath(data, b.path, b.pct);
const out: unknown[] = [];
for (let i = task.from; i < task.to; i++) {
  if (task.kind === "paths") out.push(measurePathLobby(data, task.seed, i));
  process.stderr.write(".");
}
process.stdout.write(JSON.stringify(out));
