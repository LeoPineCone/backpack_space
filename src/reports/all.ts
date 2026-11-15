/**
 * Runs every balancing report one after the other and writes each one to out/reports/<name>.txt.
 *   npm run report:all -- [--accuracy quick|normal|precise] [--seed S]
 * Other flags are passed on to every report. With normal accuracy this takes about a quarter of an hour.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const REPORTS = ["battles", "heroes", "runs", "items", "recipes", "placement"] as const;
const args = process.argv.slice(2);
const dir = join("out", "reports");
mkdirSync(dir, { recursive: true });
for (const name of REPORTS) {
  const t0 = Date.now();
  const out = join(dir, `${name}.txt`);
  const res = spawnSync(process.execPath, ["--import", "tsx", join("src", "reports", `${name}.ts`), ...args, "--out", out], { stdio: ["ignore", "ignore", "inherit"] });
  console.log(`${res.status === 0 ? "✓" : "✗"} ${name.padEnd(10)} ${((Date.now() - t0) / 1000).toFixed(0).padStart(5)} s  ${out}`);
}
