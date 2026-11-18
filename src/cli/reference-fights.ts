/**
 * Writes data/sim/reference-fights.json (QA-06): about 20 fixed fights between stored bot builds, chosen so that every
 * hero, every effect kind found in the builds, a merged item and the longest fight are covered.
 * Run it on purpose when a data or core change alters fight results: npm run sim:reference
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Build, GameData } from "@backpack-space/core";
import { ROOT, loadGameData } from "@backpack-space/core/node";
import { fightOutcome, type ReferenceFight, type ReferenceList } from "../../test/helpers/reference.js";
import ghosts from "../../playground/ghosts.json" with { type: "json" };

const SIZE = 20;
const data: GameData = loadGameData();
const rounds = ghosts as unknown as Build[][];

/** What a build brings into a fight: its hero, every effect kind of its items and hero, merged items. */
function features(b: Build): Set<string> {
  const out = new Set<string>([`hero:${b.hero}`]);
  const effects = [...data.heroes.get(b.hero)!.effects, ...b.items.flatMap((p) => data.items.get(p.item)!.effects)];
  for (const e of effects) {
    out.add(`on:${e.on}`);
    if (e.gain) out.add(`gain:${e.gain}`);
    if (e.inflict) out.add(`inflict:${e.inflict}`);
    if (e.do) out.add(`do:${e.do}`);
    for (const k of Object.keys(e.mod ?? {})) out.add(`mod:${k}`);
  }
  if (b.items.some((p) => data.items.get(p.item)!.crafted)) out.add("merge");
  return out;
}

interface Candidate extends ReferenceFight {
  features: Set<string>;
}
const candidates: Candidate[] = [];
rounds.forEach((builds, r) => {
  for (let i = 0; i + 1 < builds.length; i += 2) {
    const a = builds[i]!,
      b = builds[i + 1]!;
    const seed = 1000 * (r + 1) + i;
    candidates.push({ name: "", a, b, seed, expect: fightOutcome(data, a, b, seed), features: new Set([...features(a), ...features(b)]) });
  }
});

// the longest fight first, then greedily whatever covers the most features still missing, then the longest of the rest
const chosen: Candidate[] = [];
const take = (c: Candidate, why: string) => {
  c.name = `${why}: ${c.a.hero} vs ${c.b.hero}, round ${c.a.round}`;
  chosen.push(c);
  candidates.splice(candidates.indexOf(c), 1);
};
take(
  candidates.reduce((x, y) => (y.expect.seconds > x.expect.seconds ? y : x)),
  "longest fight",
);
const all = new Set(candidates.flatMap((c) => [...c.features]).concat([...chosen[0]!.features]));
const covered = new Set(chosen[0]!.features);
while (chosen.length < SIZE) {
  const gain = (c: Candidate) => [...c.features].filter((f) => !covered.has(f)).length;
  const best = candidates.reduce((x, y) => (gain(y) > gain(x) ? y : x));
  if (gain(best) === 0) break;
  const added = [...best.features].filter((f) => !covered.has(f));
  added.forEach((f) => covered.add(f));
  take(best, `covers ${added.slice(0, 3).join(", ")}${added.length > 3 ? ` and ${added.length - 3} more` : ""}`);
}
candidates.sort((x, y) => y.expect.seconds - x.expect.seconds || x.seed - y.seed);
while (chosen.length < SIZE && candidates.length) take(candidates[0]!, "long fight");

const list: ReferenceList = { simVersion: data.simVersion, fights: chosen.map(({ features: _f, ...f }) => f) };
const file = join(ROOT, "data", "sim", "reference-fights.json");
writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
const missing = [...all].filter((f) => !covered.has(f));
console.log(`Wrote ${file}: ${list.fights.length} fights, simulation version ${list.simVersion}, ${covered.size} features covered.`);
if (missing.length) console.log(`Not covered: ${missing.join(", ")}`);
