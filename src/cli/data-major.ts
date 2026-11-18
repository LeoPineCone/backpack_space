/**
 * Records what the current major data version stands for (data/sim/data-major.json): run it after raising the major
 * of `dataVersion` in data/rules.json, when test/dataversion.test.ts asks for it.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, loadGameData } from "../../packages/core/node/load.js";
import { majorEntries, parseDataVersion } from "../../packages/core/src/index.js";

const data = loadGameData();
const major = parseDataVersion(data.dataVersion)!.major;
const file = join(DATA_DIR, "sim", "data-major.json");
const note =
  "The major data version and what it was set for: items with shapes, recipes, grid. test/dataversion.test.ts fails when one of these entries is gone: then raise the major of dataVersion in data/rules.json and run npm run data:major.";
writeFileSync(file, JSON.stringify({ note, major, entries: majorEntries(data) }, null, 2) + "\n");
console.log(`data/sim/data-major.json: major ${major}, ${majorEntries(data).length} entries`);
