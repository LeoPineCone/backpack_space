/** `npm run web` (preview) and `npm run web:build` (production, fails on placeholders): builds the site into out/web. */
import { join } from "node:path";
import { buildSite, WEB } from "./build.js";

const production = process.argv.includes("--production");
const out = join(WEB, "..", "..", "out", "web");
try {
  const r = buildSite(out, { production });
  console.log(`Website: ${r.files.length} files in ${out}, languages ${r.languages.join(", ")}.`);
  if (r.placeholders.length) console.log(`${r.placeholders.length} placeholders left (marked on the pages; the production build refuses them).`);
} catch (e) {
  console.error(String((e as Error).message));
  process.exit(1);
}
