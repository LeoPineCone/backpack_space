# Art style

Decided direction: **dark ink comic**. The style rules below are fixed. Hero designs, fixed marks and skin slots are in `docs/heroes.md`.

## Rules

- Heavy solid black shadows and a dark outline. Shapes are bold and angular, with a clear silhouette first and detail second.
- Flat, matte colours. No gradients, no glossy highlights, no glow, bloom or lens flares, no 3D rendering.
- Rough ink and paper texture; things look worn, patched and used.
- A small, muted palette (below). One accent colour per piece is enough.
- Mood: strange, slightly gloomy outer space, with dry humour. Odd rather than scary.
- Backgrounds stay plain and dark so figures and items carry the picture.
- Not a clone: no names, characters or look of existing games.

## Palette (starting values)

| Name | Hex | Use |
|---|---|---|
| Ink | `#0b0d14` | shadows, outline |
| Night | `#12162a` | backgrounds |
| Bone | `#e6dcc3` | light surfaces, text on dark |
| Rust red | `#a63d2a` | main accent |
| Deep teal | `#1f5a5e` | second accent, metal, glass |
| Mustard | `#c9962e` | lights, eyes, gold |
| Moss | `#5d6b3a` | plants, verdigris |
| Copper | `#8a5a34` | leather, rust, wood |

These values were picked by eye from the reference images and are not final. They are the palette of the art; the interface (buttons, panels, text) has its own theme in [theme.md](theme.md).

## Heroes and skins

- Every hero has one or two fixed marks that never change (for example a single yellow lantern eye and six tool legs). A skin swaps the rest: shell, outfit, props.
- Skins come in two flavours: a serious one and a funny one. The funny ones are drawn just as seriously as the rest; the joke is in the idea.
- Every hero has a model sheet (front, three-quarter, back) that all later pictures and skins use as reference. How hero pictures are made: `.claude/skills/hero-art/SKILL.md`.

## Items

Item pictures are described in `data/item-art.json` (list: [item-art.md](item-art.md)). The rules there, in short:

- **Space first, never boring.** Every item is clearly made for or found in outer space, or comes from one of many different planets, with one inventive twist that an earth object would not have (see the item-art skill, `.claude/skills/item-art/SKILL.md`). Name and look should click: Moon Cheese is a little cratered cheese moon with a crumb in orbit.
- **One world.** General items are worn, practical gear of people who live off salvage and long trips: chunky, riveted, patched, taped, stencilled without readable text. Animals are odd space fauna, drawn seriously with dry humour, never cute and glossy. Food is station food: packed, canned, grown in trays, a little strange.
- **Size decides detail.** One backpack cell is 40 points on a phone (about 6 mm; the 9×7 grid fills the screen width). Pictures are generated large and stored at 176 px per cell. A one-cell item gets one clear shape and one feature, a big item up to four. The picture fills its box; odd shapes (L, T, gate) leave their empty cells free.
- **Beasts and swarms read at a glance.** A beast is one single big, heavy animal that fills its box. A swarm pet is drawn as one single small animal with room around it, never as a group: several animals in one cell are too small to read (decided 2026-11-16). The swarm idea lives in the name and the rules, not in the picture.
- **Crafted items show their parts.** A recipe result keeps something recognisable from each ingredient (the Prism Laser is the Laser Pistol with the Crystal Shard on its muzzle), so players can read where it came from.
- **Hero items speak the hero's language** ([heroes.md](heroes.md)):
  - *Venn:* the station's botany lab taken over by the plant. Specimen tags, petri dishes, flasks, seed trays, station pipes and crates, the botanist's drone; rust-red tendrils, pale seed bulbs, bark, thorns. Plants never get eyes or faces, only jaws.
  - *Rook:* everything is salvage, welded or tied together from wreck parts: mismatched plates, clamps, wire, pieces of satellite housing, spare tool legs. The mustard lantern eye comes back as a lamp or sticker.
  - *Quill:* made by the herd, not by people: woven grass and twigs, shed fur, braided cords, tusk tips, bone, shells, berries and roots. No leashes, whistles or cages. Quill's mechanical items are machines the herd found and made their own: dented salvage padded and tied with weaving and fur.
  - *Ysel:* relics of her order: dark iron, bent iron rings like her head cage, cracked sun pieces in flat mustard and rust red, bells, rosary stones, heavy cloth with rust-red bands. Heat is drawn as wavy ink lines, never as glow.
- Accent colour as in the brief; the heroes' own marks (Venn's rust-red tendrils, Rook's mustard eye, Ysel's rust-red bands) may appear next to it.

## Menu backgrounds (planets)

A menu background is a place from `lore/planets.json` as a slowly turning planet in front of a star field.
Only the flat surface map of the planet is generated (evenly lit, seamless left to right, large shapes, same
ink comic rules); the app adds light, the hatched shadow edge and the outline. Step by step, with the prompt:
`.claude/skills/planet-art/SKILL.md`. Technical side: [client-art.md](client-art.md).

## Open

- First item test (2026-11-16, 5 items): the style holds at backpack size; fine scratches and fur turn into noise, so prompts ask for little texture. Some swarm and crafted descriptions in `data/item-art.json` still show several animals and need rewriting to one animal.
- Rarity and item-type colours have to be mapped onto the palette.

## Prompt base for image generation

For items, `npm run art:prompt -- <id>` uses the style part of this base and replaces the background sentence: items are generated on flat light grey, because a black ink outline on a dark background cannot be cut out cleanly.

> Style: dark ink comic illustration. Heavy solid black shadows, bold angular shapes, flat matte colours with no gradients, a small muted palette of rust red, bone white, deep teal, mustard and black, rough ink texture, strong readable silhouette. No glossy highlights, no glow effects, no lens flares, no 3D rendering. Background: plain dark night-sky colour with a few simple stars, nothing else. No text, no letters, no logos, no frame.
