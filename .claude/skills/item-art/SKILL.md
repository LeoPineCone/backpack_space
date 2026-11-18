---
name: item-art
description: How to write the picture brief and description for an item or bag in Backpack Space so the generated image is inventive, clearly space-themed and readable at backpack size, and how to turn it into an image prompt (npm run art:prompt). Use when adding or rewriting entries in data/item-art.json, when building image prompts, or before generating item pictures.
---

# Item pictures

(Written 2026-11-16 after the first two rounds of test images. Ilja's goal in his own words: items must not be
boring, they must be creative, and you see at once that the game has a space theme.)

A picture comes from two fields in `data/item-art.json` per item or bag:

- `brief`: one line for the asset list, ends with `Accent: <palette colour>.` (coral red, teal, mustard,
  sage, copper or cream; docs/style.md).
- `description`: the full English picture description that goes into the prompt. It is never shown in the app.

`npm run art:prompt -- <id> [<id> ...]` (or `--all`) builds the finished prompt from the style base in
`docs/style.md` plus the item's name, description, accent and box size (`src/art/prompt.ts`). Never write
prompts by hand: change the description, then print the prompt. After changing descriptions run
`npm run validate` (word limits) and `npm run catalog` (rewrites `docs/item-art.md`).

## 1. Read the item first

Before writing, look up in `data/items/*.json`: name, `tags` (main type first; pet kinds `beast` / `swarm`),
`shape`, rarity, `hero`, and in `data/recipes.json` whether it is a recipe result and what its ingredients are.
The rules text (`npm run catalog`, `docs/catalog.md`) often gives the best idea: an item that inflicts Cryo can
carry frost, one that gains Energy can carry a battery or solar sail.

## 2. Find the space idea (the important part)

Ask: **what would this thing look like if it was made, grown or found out there, not on earth?** Pick one
strong twist and build the picture around it. "Out there" means open space and stations, and just as much the
**many different planets**: animals, plants, food and materials can come from a specific planet whose
conditions shape them (Ilja, 2026-11-16). A plain earth object with "space" in the name is the failure we
want to avoid.

Twists that worked or fit the world:

- **Planet of origin.** Give the thing a home planet with one clear condition and let that condition shape it.
  Ice or night planet: ice spikes, wide snowshoe feet, big pale eyes. Lava planet: basalt skin with rust-red
  cracks, volcanic glass. Heavy-gravity planet: squat, flat, thick legs, layered rock. Low-gravity moon or
  comet: long thin legs, floating hair, dust trails. Thin-air planet: gills, frills, air sacs. Gas giant: floats,
  balloon bladders. Crystal or desert planets: crystal growths, sand-coloured armour. Planets with several moons
  or suns: markings and patterns that repeat them. Materials, too: ore, crystal, sand or wood from a named kind
  of planet. Vary the planets across items so the world feels wide.
- **Celestial shape.** The object takes the shape of something in the sky: Moon Cheese is a little cratered
  cheese moon with one crumb in orbit around it. Rings like a planet ring, a comet tail, an eclipse, a crescent.
- **Zero gravity.** Parts or crumbs float and orbit; liquids form balls; things are tethered so they do not
  drift away.
- **Vacuum work gear.** Suction clamps for hull plates, seals, valves, oxygen bottles, tether cords with clips,
  magnet soles, pressure gauges.
- **Built from ship parts.** Thruster nozzles, hull plating, solar panels, antenna dishes, cargo straps, stencil
  patches (no readable text).
- **Space material.** Meteor iron, comet ice, asteroid rock, crystal shards, stardust drawn as flat specks.
- **Alien anatomy** (best tied to the planet it comes from). Six legs, many small eyes, wings like solar sails, crystal growths, shells like asteroid
  rock. Odd and drawn seriously, never cute or glossy.

Rules for the idea:

- **Name and look must click.** The player should get the name from the picture and the picture from the
  name. That made Moon Cheese the best of the test round.
- **One big idea, not five small ones.** The picture is 40 points per cell on a phone (about 6 mm). A one-cell
  item carries one shape and one feature, a big item up to four.
- **Still the same world:** worn, practical, salvaged, patched (docs/style.md, "Items"). Inventive does not mean
  clean sci-fi chrome.
- **No projectiles.** A weapon shows no projectile at all: no shot, slug, needle, nocked arrow, beam or volley
  leaving or sitting in it (Ilja 2026-11-18). A flame or spray right at the nozzle is part of the weapon.
- **No glow.** Energy, heat and light are flat colour shapes or wavy ink lines, never glow, bloom or neon.
- **No text, letters, logos.** No alcohol. Nothing from Backpack Brawl or other existing games.

## 3. Animals

- **Always one single animal.** Also for swarm pets: several animals in one or two cells are too small to read
  (Ilja, 2026-11-16). A swarm pet is one small animal with room around it; the swarm lives in the name and the
  rules.
- A **beast** is one big, heavy animal that fills its whole box.
- Give every animal a home planet and one alien feature that comes from it (see "Planet of origin"), so it is
  space fauna and not a zoo animal. Recolouring or changing the material of a normal animal is not enough
  (Rock Crab was "too boring"); add something it does or has that no earth animal has.
- Places live in `lore/planets.json`. Pick the planet there (or add one) and add the item to its `items`, so
  pictures, backgrounds and lore stay consistent.
- Recipe results with animals (Dust Storm, Swarm Cloud, Rat Pack) also show one animal, carrying a recognisable
  piece of each ingredient.

## 4. Size and shape

- The box is the bounding box of the shape; `art:prompt` puts the aspect ratio and cell count in the prompt.
- Odd shapes (L, T, gate): say in the description where the parts go and which cells stay empty ("the pick head
  runs along the top two cells, the handle drops down the left cell; the empty corner stays free").
- Long items are drawn lying across their box; the game rotates them, so draw each item once.
- **The picture must fill its cells** (Ilja 2026-11-18): in the grid a player must see at a glance which cells an
  item takes. Pick a motif that is long by nature for long boxes (a long tray, a pole, an animal in side view
  from nose to tail) instead of a round thing in the middle. Start the description with where it reaches, e.g.
  "Stretched end to end across the wide box:", "Standing tall from the bottom to the top of the box:" or
  "Running the full length of the long box, end to end:". Target: the picture covers at least 75 % of the long
  side of its box (for square boxes, of both sides); measure after every batch and redo what falls short.
- **Odd shapes** (Ilja 2026-11-18): no part of the picture may reach into a cell outside the shape, because another
  item can lie there; the prompt names the empty cells (`art:prompt`). Pick a motif whose silhouette already has
  that shape: L = head and handle (pick, axe, pistol, saw, scythe); long with a foot = gun with grip, flag on a
  pole; 2×3 without a corner = hammer or sceptre with a big head over the top four cells; gate = arch, door,
  bridge; gap in the middle of the bottom row = two legs or tentacles. Round things (shields, discs), suits and
  lying or curled animals do not fit odd shapes: change the item's shape instead (item-design skill, balancing
  check, data version major), as done for Total Eclipse, Living Armor, Exo Suit, Ghost Shroud, Shadow Lynx and
  Rat Pack. Mining Pick is the model L.
- Thin items (1 cell wide) only need to fill their length; 50 % of the box area is fine there (Zenith Lance).
- Word limits (checked by `npm run validate`, `packages/core/node/load.ts`): 1 cell 30 words, 2–3 cells 45,
  4–5 cells 60, 6+ cells 75. Short is better: describe the idea and the silhouette, not texture.
- Avoid wording that invites noise: no "scratches", "grain", "fine detail", "intricate".

## 5. Hero items and crafted items

- Hero items speak their hero's language (docs/style.md, "Hero items"): Venn's lab plant, Rook's salvage, Quill's
  herd-made things, Ysel's solar-moth relics. The space twist comes on top of that language, not instead of it.
- A crafted item keeps something recognisable from each ingredient (Prism Laser = Laser Pistol with the Crystal
  Shard on its muzzle).

## 6. Examples

Only these two are templates (Ilja, 2026-11-16); the other test pictures are not:

- **moon_cheese** (1 cell): "A small cheese wheel shaped like a cratered mini moon, one wedge cut out showing the
  pale inside, a single crumb orbiting it like a tiny moon. Mustard rind." Ilja: name and look fit very well.
- **mining_pick** (L shape, 3 cells): "The pick head runs along the top two cells, the handle drops down the left
  cell; the empty corner stays free. Meteor-iron head with a teal crystal tip and a small thruster on its back,
  taped grip, tether clip."

Too boring (first round): a plain pistol with a hose, an ordinary cheese wedge, a normal yak with frost, a
pickaxe with tape. Correct and readable, but nothing says space.

Animals from different planets (2026-11-16, Ilja's verdict):

- **space_hamster** (1 cell, swarm) – "super": a round hamster from a thin-air desert planet, cheeks stuffed
  with shiny ore pebbles, frilly breathing gills on its neck, room around it. The best animal so far: a familiar
  animal, one clear alien feature from its planet, a funny detail that fits the name.
- **moon_moth** (1 cell, swarm) – "quite good": a pale moth from a planet with two moons, two crescents on each wing.
- **tundra_yak** (2×2, beast) – "better": yak from a frozen night planet, ice spikes along the back, snowshoe
  hooves, big pale eyes.
- **rock_crab** – "too boring": a squat crab with a sandstone shell and a crystal claw still reads as an
  ordinary crab. A changed material alone is not enough; the animal needs a surprising feature or behaviour.

## 7. Generating test images (only with Ilja's OK)

Image credits are limited. Generate only when Ilja asks, check the balance first and keep batches small.

- OpenArt, model `gpt-image-2-5-sunburst`, mode `text2image`, `resolutionTier` 1k, `quality` medium: 10 credits
  per image (2026-11-16). Aspect ratio: 1:1 for square boxes, 16:9 for 2×1 (add "Keep the item inside a
  centred 2:1 area; the extra width is empty background."), the closest ratio otherwise.
- The prompt asks for a flat light grey background so the black outline can be cut out. Cut out, crop and fit
  the picture into its box at 176 px per cell. Then check it at real size: on a phone-sized mock-up of the
  9×7 grid at 40 points per cell (rendered at 3×, opened full screen on a phone). A monitor shows it larger
  than the phone does.
- **Four small items per image** (tested 2026-11-16, works): for 1-cell items, ask for "a sheet of four separate
  game item icons arranged in a 2×2 grid, each centred in its own quarter, never touching", then list the four
  items as "Top left: <name>. <description> Main accent: <colour>." and so on, with the same style, colour,
  composition and background lines as `art:prompt`. One 1k image gives four quarters of 512 px, plenty for 176 px
  per cell. Cost per item drops to a quarter and the four come out in exactly the same style. Mix items from
  different planets and types on one sheet. Single images stay the rule for 2×2 and larger items.
- Lava, fire and heat tend to come out orange and glowing; keep insisting on flat coral red and ink lines.
- Small puffs of smoke or steam at an item's edge look odd at backpack size (Rocket Chili); leave them out.
- Judge in this order: does it read as the named thing at real size? Is there a space idea? Does it fit the
  style and palette?
- **Sheets with slots shaped like the items** (2026-11-18): on a 2×2 sheet of square quarters the model draws
  2×1 and 3×1 items compact and they fill only half their box. Put items of one shape on one sheet with slots of
  that shape instead (e.g. eight 2×1 items as 2 columns × 4 rows, four 4×1 items as 4 rows).
- At most two weapons per sheet, mixed with other items, and no flame tongues on weapons: sheets with three or
  more weapons and flames at a muzzle were refused by the safety filter (2026-11-18).
- A single weapon alone on one image (Railgun, 21:9) was refused twice by the model's safety filter; put
  weapons on a normal four-item sheet with other items.
- Pets that "fire" something (Laser Parrot with a laser line) read badly; show the animal and its alien feature,
  not the attack.
- Write lessons learned into this skill.
