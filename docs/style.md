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

These values were picked by eye from the reference images and are not final.

## Heroes and skins

- Every hero has one or two fixed marks that never change (for example a single yellow lantern eye and six tool legs). A skin swaps the rest: shell, outfit, props.
- Skins come in two flavours: a serious one and a funny one. The funny ones are drawn just as seriously as the rest; the joke is in the idea.
- Hero pictures are generated one by one today, so body details drift between images. Real skins need a fixed base model per hero first.

## Open

- Items in this style have not been tested at backpack size (about 44 px on a phone). They will need simpler shapes than the hero pictures.
- Rarity and item-type colours have to be mapped onto the palette.
- The client still uses its placeholder colours.

## Prompt base for image generation

> Style: dark ink comic illustration. Heavy solid black shadows, bold angular shapes, flat matte colours with no gradients, a small muted palette of rust red, bone white, deep teal, mustard and black, rough ink texture, strong readable silhouette. No glossy highlights, no glow effects, no lens flares, no 3D rendering. Background: plain dark night-sky colour with a few simple stars, nothing else. No text, no letters, no logos, no frame.
