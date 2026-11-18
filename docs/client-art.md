# Pictures in the client

Real pictures live in `apps/client/art/`. The path without the extension is the picture's id
(`art/planets/rime.jpg` is `planets/rime`). Vite bundles every file there, so the app works offline,
and `src/art.ts` loads them at start. A picture that does not exist yet is not an error: the screen
keeps its placeholder symbol, so pictures can be added one by one.

| Folder | What | Size |
|---|---|---|
| `art/space.jpg` | star field behind every menu background | 1080×1920, JPEG |
| `art/planets/<place>.jpg` | surface map of a place in `lore/planets.json` | 2048×1024 (2:1), JPEG, left edge continues the right edge |
| `art/items/<item id>.png` | item picture, replaces the type symbol and initials on the tile (`src/pieces.ts`) | 176 px per cell of the unturned shape (a 1×2 item is 176×352), PNG with transparent background; the client turns it with the item |
| `art/ui/<symbol>.png` | coloured ink symbol that replaces the line symbol of the same name (`icon()` in `src/icons.ts`): coin, credits, galaxy, patch, heartFull, heart, energy, level, dice, bin, pin, settings, and the item types (ranged, armor, accessory, pet, beast, swarm, food, mechanical, organic; `weapon` is kept for the glossary) | 128×128, PNG with transparent background; made as sheets of four or nine (OpenArt, 2k high) on flat light grey and cut out |
| `art/heroes/<hero id>.webp`, `art/heroes/<hero id>-head.webp` | hero full body (hero choice, 200×240 pt) and round head picture (hero ring and every hero badge, cut to a circle by `heroHead` in `src/ui.ts`); made with `.claude/skills/hero-art/SKILL.md` | full body fits 600×720, head 256×256, WebP with transparent background |

## Menu backgrounds

A background cosmetic in `data/meta.json` names its place (`"planet": "rime"`). `src/backdrop.ts`
draws the star field, a few twinkling stars and the place's planet; `src/planet.ts` wraps the flat
surface map around a sphere in a shader and turns it slowly (one turn in 150 s), so the loop never
jumps. Light, the hatched shadow edge and the ink outline come from the shader, so a surface map is
drawn evenly lit, without a day and night side.

Generating a surface map (full steps and prompt: `.claude/skills/planet-art/SKILL.md`): ask for a flat equirectangular map that fills the image edge to edge,
evenly lit, seamlessly tileable horizontally, large clear shapes, in the style of `docs/style.md`
(21:9 works; it is resized to 2:1). Check the seam by putting the right half in front of the left half.
