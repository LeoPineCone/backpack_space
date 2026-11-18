/** Runs the reference fights in the browser engine (QA-06) with the same game data the client bundles. */
import { DATA } from "../../apps/client/src/data";
import { checkReference, type ReferenceList } from "../../test/helpers/reference";
import list from "../../data/sim/reference-fights.json";

const reference = list as unknown as ReferenceList;
const problems = checkReference(DATA, reference);
const result = { fights: reference.fights.length, simVersion: DATA.simVersion, problems };
(window as unknown as { __reference: typeof result }).__reference = result;
document.getElementById("out")!.textContent = JSON.stringify(result, null, 2);
