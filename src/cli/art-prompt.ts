/** Prints the image prompt for items: `npm run art:prompt -- <id> [<id> ...]`, or `--all` for every item and bag. */
import { loadGameData, loadItemArt } from "@backpack-space/core/node";
import { itemPrompt, styleBase } from "../art/prompt";

const args = process.argv.slice(2);
const d = loadGameData(), art = loadItemArt(), base = styleBase();
const ids = args.includes("--all") ? d.itemList.map((i) => i.id) : args;
if (!ids.length) {
  console.error("Usage: npm run art:prompt -- <item id> [<item id> ...] | --all");
  process.exit(1);
}
for (const id of ids) {
  const it = d.items.get(id), a = art[id];
  if (!it || !a) {
    console.error(`Unknown item: ${id}`);
    process.exit(1);
  }
  console.log(`# ${it.name} (items/${id}.png)\n${itemPrompt(it, a, base)}\n`);
}
