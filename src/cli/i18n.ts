/** Lists per language which texts are missing (English stands in) and which keys are left over. */
import { loadGameData } from "@backpack-space/core/node";

const d = loadGameData();
let open = 0;
for (const l of d.locales.languages) {
  if (l.id === "en") continue;
  const missing = d.locales.missing[l.id]!, unused = d.locales.unused[l.id]!;
  open += missing.length;
  console.log(`## ${l.name} (data/locales/${l.id}.json): ${missing.length ? `${missing.length} missing` : "complete"}${unused.length ? `, ${unused.length} unused` : ""}`);
  const en = d.locales.get("en");
  for (const k of missing) console.log(`  missing  ${k}  (English: ${en.t(k)})`);
  for (const k of unused) console.log(`  unused   ${k}`);
}
if (!open) console.log("Every language is complete.");
