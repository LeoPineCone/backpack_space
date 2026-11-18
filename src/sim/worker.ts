/**
 * Worker process for parallel measurements: plays a range of lobbies and prints the result as JSON on stdout.
 * Started by runParallel (parallel.ts) with the same Node/tsx flags as the report. Progress: one "." per lobby on stderr.
 */
import { readFileSync } from "node:fs";
import { loadGameData, loadRatings } from "@backpack-space/core/node";
import { useRatings } from "./lobby";
import { boostPath, measurePathLobby } from "./paths";
import type { WorkerTask } from "./parallel";
import { patchedData } from "../balance/patch";
import { playPanelLobby } from "../balance/panel";
import { measureItem } from "./items";
import { playPickLobby, scoreMoment, type Moment } from "./picks";
import type { Build } from "@backpack-space/core";

const task = JSON.parse(process.argv[2]!) as WorkerTask;
const data = task.patch ? patchedData(task.patch) : loadGameData();
useRatings(task.ratingsFile ? (JSON.parse(readFileSync(task.ratingsFile, "utf8")) as Record<string, number>) : task.ratings ? loadRatings() : {});
for (const b of task.boost ?? []) boostPath(data, b.path, b.pct);
const out: unknown[] = [];
const field = task.kind === "items" || task.kind === "picks" ? (JSON.parse(readFileSync(task.field!, "utf8")) as Build[][]) : [];
const moments = task.kind === "picks" ? (JSON.parse(readFileSync(task.moments!, "utf8")) as { m: Moment; seed: number }[]) : [];
for (let i = task.from; i < task.to; i++) {
  out.push(
    task.kind === "pickLobby"
      ? playPickLobby(data, task.seed, i)
      : task.kind === "picks"
        ? scoreMoment(data, field, moments[i]!.m, moments[i]!.seed, task.fights!, !!task.careful)
        : task.kind === "items"
          ? measureItem(data, data.items.get(task.ids![i]!)!, field, { builds: task.builds!, fights: task.fights! }, task.seed)
          : task.kind === "panel"
            ? playPanelLobby(data, task.seed, i, task.free, task.bot)
            : measurePathLobby(data, task.seed, i),
  );
  process.stderr.write(".");
}
process.stdout.write(JSON.stringify(out));
