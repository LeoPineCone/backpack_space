/**
 * The `jobs` Lambda (BE-14): a schedule calls it with the name of a job, `{ "job": "season" }`. The cloud setup (#56)
 * builds the ports and sets the schedules: the season job daily shortly after midnight UTC, the actions job weekly.
 */
import type { Ports } from "../domain/context.js";
import { JOB_NAMES, runJob, type JobName, type JobResult } from "../jobs/index.js";

export function jobsHandler(ports: Ports): (e: { job?: string }) => Promise<JobResult> {
  return async (e) => {
    if (!JOB_NAMES.includes(e.job as JobName)) throw new Error(`unknown job: ${String(e.job)}`);
    return runJob(ports, e.job as JobName);
  };
}
