# Art style

Decided direction: **bright ink comic** (since 2026-11-18). The style rules below are fixed. Hero designs, fixed marks and skin slots are in `docs/heroes.md`.

Until 2026-11-18 the game used a dark ink comic (heavy black shadows, muted palette, worn and dirty). Ilja switched
after a side-by-side test: the bright version reads much better on the dark blue interface, especially items at
backpack size, and should appeal to more players while still looking like our own game. Old pictures are archived
in the project files (`archiv/dunkler-stil/`).

## Rules

- Clean hand-inked comic: bold black outlines, small solid black shadows (no large black areas). Shapes are bold, with a clear silhouette first and detail second.
- Bright, warm colours from the palette below. Saturated, but not candy-coloured; one accent colour per piece is enough.
- Flat colours. No gradients, no glossy highlights, no glow, bloom or lens flares, no 3D rendering.
- Clean surfaces: wear shows as a patch, a dent or a strip of tape, not as dirt, grime or rust all over.
- **Detail grows with size on screen.** Items (40 points per cell) stay smooth: one clear shape, large flat colour areas, little texture. Heroes get medium detail. Big pictures (home scenes, planet maps, menu backgrounds) get more hand-inked texture: hatching, cross-hatching, stippling, small cracks and flow lines, drawn with black and darker tones of the same colours, never photographic. Decided 2026-11-18 on the Cinder planet.
- Mood: strange outer space with dry humour, friendly rather than gloomy. Odd rather than scary.
- Backgrounds are a deep navy night sky, not pure black, and stay calmer than the figures and items in front.
- Not a clone: no names, characters or look of existing games.

## Palette (starting values)

| Name | Hex | Use |
|---|---|---|
| Ink | `#14161f` | outline, small shadows |
| Navy | `#1c2b5a` | sky, backgrounds |
| Cream | `#f1e6cc` | light surfaces, suits, bone |
| Warm grey | `#8d8478` | metal, rock, stone |
| Coral red | `#e0563f` | main accent, tendrils, lava |
| Teal | `#2f9a9a` | second accent, glass, patches, solar panels |
| Mustard | `#f2b632` | lights, eyes, gold, lava cracks |
| Sage | `#7fa04a` | plants, leaves |
| Copper | `#c27a45` | leather, wood, rust spots |

These values were picked by eye from the first pictures in the new style and are not final. They are the palette of the art; the interface (buttons, panels, text) has its own theme in [theme.md](theme.md).

## Heroes and skins

- Every hero has one or two fixed marks that never change (for example a single yellow lantern eye and six tool legs). A skin swaps the rest: shell, outfit, props.
- Skins come in two flavours: a serious one and a funny one. The funny ones are drawn just as seriously as the rest; the joke is in the idea.
- Every hero has a model sheet (front, three-quarter, back) that all later pictures and skins use as reference. How hero pictures are made: `.claude/skills/hero-art/SKILL.md`.

## Items

Item pictures are described in `data/item-art.json` (list: [item-art.md](item-art.md)). The rules there, in short:

- **Space first, never boring.** Every item is clearly made for or found in outer space, or comes from one of many different planets, with one inventive twist that an earth object would not have (see the item-art skill, `.claude/skills/item-art/SKILL.md`). Name and look should click: Moon Cheese is a little cratered cheese moon with a crumb in orbit.
- **One world.** General items are practical gear of people who live off salvage and long trips: chunky, riveted, patched, taped, stencilled without readable text, but clean and clearly drawn. Animals are odd space fauna, drawn seriously with dry humour, never glossy. Food is station food: packed, canned, grown in trays, a little strange.
- **Size decides detail.** One backpack cell is 40 points on a phone (about 6 mm; the 9×7 grid fills the screen width). Pictures are generated large and stored at 176 px per cell. A one-cell item gets one clear shape and one feature, a big item up to four. The picture fills its box; odd shapes (L, T, gate) leave their empty cells free.
- **Beasts and swarms read at a glance.** A beast is one single big, heavy animal that fills its box. A swarm pet is drawn as one single small animal with room around it, never as a group: several animals in one cell are too small to read (decided 2026-11-16). The swarm idea lives in the name and the rules, not in the picture.
- **Crafted items show their parts.** A recipe result keeps something recognisable from each ingredient (the Prism Laser is the Laser Pistol with the Crystal Shard on its muzzle), so players can read where it came from.
- **Hero items speak the hero's language** ([heroes.md](heroes.md)):
  - *Venn:* the station's botany lab taken over by the plant. Specimen tags, petri dishes, flasks, seed trays, station pipes and crates, the botanist's drone; green tendrils, pink lure flowers, pale seed bulbs, bark, thorns. Plants never get eyes or faces, only jaws.
  - *Rook:* everything is salvage, welded or tied together from wreck parts: mismatched plates, clamps, wire, pieces of satellite housing, spare tool legs. The mustard lantern eye comes back as a lamp or sticker.
  - *Quill:* made by the herd, not by people: woven grass and twigs, shed fur, braided cords, tusk tips, bone, shells, berries and roots. No leashes, whistles or cages. Quill's mechanical items are machines the herd found and made their own: dented salvage padded and tied with weaving and fur.
  - *Ysel:* relics of her order of solar moths: bronze bells, strings of star-shard beads, eclipse rings, moth-wing shapes and feathered antennae, cocoon shapes, pale moth silk, singed wing scales, heavy night-blue cloth with gold bands of sun and moon phases, cracked star pieces in flat mustard and coral red. Heat is drawn as wavy ink lines, never as glow.
- Accent colour as in the brief; the heroes' own colours ([heroes.md](heroes.md): Venn green and pink, Rook rust orange and steel, Quill cream and coral, Ysel violet and gold) may appear next to it.

## Menu backgrounds (planets)

A menu background is a place from `lore/planets.json` as a slowly turning planet in front of a star field.
Only the flat surface map of the planet is generated (evenly lit, seamless left to right, large shapes, same
ink comic rules, with more ink texture than items); the app adds light, the hatched shadow edge and the outline. Step by step, with the prompt:
`.claude/skills/planet-art/SKILL.md`. Technical side: [client-art.md](client-art.md).

## Open

- Some swarm and crafted descriptions in `data/item-art.json` still show several animals and need rewriting to one animal.
- Item-type colours have to be mapped onto the palette (rarity is done, see [theme.md](theme.md)).
- UI elements follow the hand-inked look in [theme.md](theme.md#hand-inked-look) since 2026-11-18; more symbols can get pictures the same way.

## Prompt base for image generation

For items, `npm run art:prompt -- <id>` uses the style part of this base and replaces the background sentence: items are generated on flat light grey, because a black ink outline on a dark background cannot be cut out cleanly.

> Style: clean hand-inked comic illustration, bold black outlines, bright warm colours: cream, coral red, sunny mustard yellow, clear teal and copper, small solid black shadows only, clean surfaces with almost no grime or scratches, flat colours with no gradients, strong readable silhouette. No glossy highlights, no glow effects, no lens flares, no 3D rendering. Background: deep navy-blue night sky with a few simple stars, nothing else. No text, no letters, no logos, no frame.
