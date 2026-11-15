/**
 * One fight between two bot builds, with the event log.
 *   npm run battle -- [--round 6] [--a flora] [--b ysel] [--seed 1] [--log]
 */
import { compile, simulate } from "@backpack-space/core";
import { loadGameData } from "@backpack-space/core/node";
import { playLobby } from "../sim/lobby";
import { parseArgs } from "./args";

const { flags } = parseArgs();
const data = loadGameData();
const round = Number(flags.round ?? 6), seed = Number(flags.seed ?? 1);
const lobby = playLobby(data, seed, { immortal: true });
const pick = (hero: string | undefined, skip: number) => lobby.seats.find((s) => s.seat !== skip && (!hero || s.bot.hero === hero))!;
const a = pick(flags.a, -1), b = pick(flags.b, a.seat);
const builds = [a.builds[round - 1]!, b.builds[round - 1]!];
const res = simulate(compile(builds[0]!, data), compile(builds[1]!, data), data.rules, seed, { log: true });
builds.forEach((bd, i) => console.log(`${i === 0 ? "A" : "B"}: ${data.heroes.get(bd.hero)!.name} (round ${round}, ${res.maxHp[i]} health): ${bd.items.map((p) => data.items.get(p.item)!.name).join(", ")}`));
if (flags.log) for (const e of res.log!) {
  const who = e.s === 0 ? "A" : "B", item = e.i >= 0 ? data.items.get(builds[e.s]!.items[e.i]!.item)!.name : "-";
  console.log(`${e.t.toFixed(1).padStart(5)}  ${who}  ${e.k.padEnd(8)} ${String(e.v).padStart(4)}  ${e.w ?? ""}${e.crit ? " crit" : ""}  ${item}`);
}
console.log(`Winner: ${res.winner === -1 ? "draw" : res.winner === 0 ? "A" : "B"} after ${res.seconds} s (${res.supernova ? "Supernova reached" : "before the Supernova"}). Health left: A ${res.hp[0]}, B ${res.hp[1]}.`);
for (const i of [0, 1] as const) { const s = res.stats[i]; console.log(`${i === 0 ? "A" : "B"} dealt: weapons ${s.weapon}, direct ${s.direct}, burn ${s.burn}, toxin ${s.toxin}, spikes ${s.spikes}; healed ${s.healed}, shield ${s.shielded}, took ${s.nova} from the Supernova.`); }
