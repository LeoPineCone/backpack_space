/** Validates data/*.json and prints a summary of the catalogue. */
import { checkItemArt, loadGameData, loadItemArt, loadMeta } from "@backpack-space/core/node";
import { checkLore, loadLore } from "../lore/lore";

try {
  const d = loadGameData();
  const items = d.itemList.filter((i) => !i.isBag);
  const count = (f: (i: (typeof items)[number]) => boolean) => items.filter(f).length;
  console.log(`OK: ${d.heroList.length} heroes, ${items.length} items (${count((i) => i.inShop)} in the shop, ${count((i) => i.crafted)} crafted, ${count((i) => i.rarity === "artifact")} artifacts), ${d.itemList.length - items.length} bags, ${d.recipes.length} recipes.`);
  console.log(`Recipe chain lengths: ${[1, 2, 3].map((n) => `${n} step${n > 1 ? "s" : ""}: ${count((i) => i.depth === n)}`).join(", ")}; recipes with 3 inputs: ${d.recipes.filter((r) => r.in.length === 3).length}.`);
  const art = checkItemArt(d, loadItemArt());
  if (art.length) throw new Error(`Picture data problems:\n- ${art.join("\n- ")}`);
  const places = loadLore(), lore = checkLore(d, places);
  if (lore.length) throw new Error(`Lore problems:\n- ${lore.join("\n- ")}`);
  console.log(`Lore: ${places.length} places, ${places.reduce((a, p) => a + p.items.length, 0)} items with an origin (lore/planets.json).`);
  console.log(`Glossary: ${d.glossary.terms.length} terms. Pictures: brief and description for all ${d.itemList.length} items.`);
  const langs = d.locales.languages.filter((l) => l.id !== "en").map((l) => {
    const missing = d.locales.missing[l.id]!.length, unused = d.locales.unused[l.id]!.length;
    return `${l.name} ${missing ? `(${missing} texts missing, English stands in)` : "complete"}${unused ? `, ${unused} unused` : ""}`;
  });
  console.log(`Languages: English (source)${langs.length ? `, ${langs.join(", ")}` : ""}. Details: npm run i18n`);
  const meta = loadMeta(d);
  const season = meta.seasons[meta.seasons.length - 1]!;
  console.log(`Meta: ${meta.heroLevels.xp.length + 1} hero levels, ${meta.planetTrack.length} planet track steps, ${meta.leagues.ids.length} leagues, ${meta.seasons.length} season(s) (latest: ${season.pass.levels.length} pass levels), ${meta.cosmeticById.size} cosmetics.`);
  const orphans = items.filter((i) => i.crafted && !d.recipes.some((r) => r.out === i.id));
  if (orphans.length) console.log(`Warning: crafted without recipe: ${orphans.map((i) => i.id).join(", ")}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
