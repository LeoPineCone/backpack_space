/**
 * Plays lobbies on several processor cores. Lobby i of a seed is the same lobby wherever it runs, so the result
 * does not depend on the number of jobs (only the time does).
 */
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

export interface WorkerTask {
  /** "paths": the seat stats of every lobby (report:paths); "panel": the lobbies with builds, pairings and fight records (baseline) */
  kind: "paths" | "panel" | "items" | "pickLobby" | "picks";
  /** "picks": file with the chosen moments and their seeds ({ m, seed }[]), scored from/to; the field comes from `field` */
  moments?: string;
  careful?: boolean;
  /** "panel": bots choose their path themselves (the field the item measurement uses) instead of one bot per path */
  free?: boolean;
  /** "items": file with the field (builds by round), the ids to measure (from/to index into it) and the sample sizes */
  field?: string;
  ids?: string[];
  builds?: number;
  fights?: number;
  seed: number;
  from: number;
  to: number;
  /** bots use data/sim/ratings.json */
  ratings: boolean;
  /** self-test: paths made stronger in this measurement only */
  boost?: { path: string; pct: number }[];
  /** number changes to play with (see src/balance/patch.ts) */
  patch?: { changes: { item?: string; hero?: string; rules?: true; set: Record<string, number | string | boolean | number[]> }[] };
  /** "panel": options for every bot of the lobby (a sweep over how bots play) */
  bot?: { pathLiking?: number; pathStrict?: boolean };
  /** bots use these ratings instead of data/sim/ratings.json */
  ratingsFile?: string;
}

/** jobs from --jobs N, default: all cores */
export const jobsFrom = (flags: Record<string, string>) => Math.max(1, Number(flags.jobs ?? availableParallelism()));

/**
 * Runs lobbies 0..lobbies-1 of the task: in this process when jobs is 1 (local(i) per lobby), otherwise in
 * worker processes. onLobby is called after every finished lobby with the number done.
 */
export async function runParallel<T>(
  task: Omit<WorkerTask, "from" | "to">,
  lobbies: number,
  jobs: number,
  local: (i: number) => T,
  onLobby?: (done: number) => void,
): Promise<T[]> {
  const n = Math.min(jobs, lobbies);
  if (n <= 1) {
    const out: T[] = [];
    for (let i = 0; i < lobbies; i++) {
      out.push(local(i));
      onLobby?.(i + 1);
    }
    return out;
  }
  const worker = fileURLToPath(new URL("./worker.ts", import.meta.url));
  let done = 0;
  const parts = Array.from({ length: n }, (_, k) => {
    const from = Math.floor((k * lobbies) / n),
      to = Math.floor(((k + 1) * lobbies) / n);
    return new Promise<T[]>((resolve, reject) => {
      const p = spawn(process.execPath, [...process.execArgv, worker, JSON.stringify({ ...task, from, to })], { stdio: ["ignore", "pipe", "pipe"] });
      const chunks: Buffer[] = [];
      let err = "";
      p.stdout.on("data", (c: Buffer) => chunks.push(c));
      p.stderr.on("data", (c: Buffer) => {
        const s = c.toString();
        const dots = s.split(".").length - 1;
        if (dots) {
          done += dots;
          onLobby?.(done);
        }
        err += s.replace(/\./g, "");
      });
      p.on("error", reject);
      p.on("close", (code) =>
        code === 0
          ? resolve(JSON.parse(Buffer.concat(chunks).toString()) as T[])
          : reject(new Error(`worker for lobbies ${from}–${to - 1} failed (${code}): ${err.trim()}`)),
      );
    });
  });
  return (await Promise.all(parts)).flat();
}
