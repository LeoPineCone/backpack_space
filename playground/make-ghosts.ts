/**
 * Writes playground/ghosts.json: stored bot builds per round for the browser preview to fight against.
 * Usage: npm run play:ghosts [-- <seed> [<builds per round>]]
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Rng, type Build } from "@backpack-space/core";
import { loadGameData } from "@backpack-space/core/node";
import { makeField } from "../src/sim/lobby";

const seed = Number(process.argv[2] ?? 7) || 7;
const perRound = Number(process.argv[3] ?? 24) || 24;
const data = loadGameData();
// one lobby seats 16 bots with the heroes evenly spread; take enough lobbies to have a choice
const lobbies = Math.max(2, Math.ceil((perRound * 2) / 16));
const field = makeField(data, lobbies, seed);
const rng = new Rng(seed);
const ghosts: Build[][] = field.byRound.map((builds) => rng.shuffle([...builds]).slice(0, perRound));

const file = join(dirname(fileURLToPath(import.meta.url)), "ghosts.json");
writeFileSync(file, JSON.stringify(ghosts) + "\n");
const heroesSeen = new Set(ghosts.flat().map((b) => b.hero));
console.log(`Wrote ${file}: ${ghosts.length} rounds, ${ghosts.map((g) => g.length).join("/")} builds, heroes: ${[...heroesSeen].join(", ")}`);
