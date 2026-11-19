---
name: planet-art
description: How to make a turning planet menu background for Backpack Space - generate a seamless surface map for a place in lore/planets.json, check and prepare it, put it into apps/client/art/planets and link it to a background cosmetic in data/meta.json. Use when adding or changing a menu background or planet picture.
---

# Planet backgrounds

(Written 2026-11-17 after the first test with Rime, which Ilja liked: "sieht sehr gut aus".)

A menu background is not a finished picture. It is built in the app from two pictures:

- `apps/client/art/space.jpg`: one star field shared by all backgrounds (1080×1920, already exists).
- `apps/client/art/planets/<place>.jpg`: the flat **surface map** of one place in `lore/planets.json`.

`apps/client/src/planet.ts` wraps the map around a sphere in a shader and turns it (one turn in 150 s), so the
loop never jumps. Light from the upper left, the hatched shadow edge and the ink outline come from the shader.
`apps/client/src/backdrop.ts` adds the star field, a few twinkling stars and dark bands for the UI.
How the art folder works in general: `docs/client-art.md`.

So a new planet costs one generated image (10 credits with `gpt-image-2-5-sunburst`, 2k, medium) and about
0.5 MB in the app.

## 1. Read the place

Look up the place in `lore/planets.json`: `traits`, `life`, `background`. The map shows the ground seen from
orbit: seas, ice, lava, dunes, forests, ring shadows are not possible (the ring would need its own layer).
Pick 3 to 5 large features and one accent colour from the palette in `docs/style.md`.

## 2. Prompt for the surface map

Generate at **21:9, 2k, quality medium** (the model has no 2:1). Use this frame and fill in the place:

> Flat planet surface texture map, equirectangular projection like an unwrapped world map, seen straight from
> above, filling the entire image edge to edge. NOT a sphere, no horizon, no sky, no space, no border.
> The surface of <Name>, <one line from traits>: <3 to 5 large features with colours>, <one accent feature>.
> Evenly lit, no shading from a light source, no day/night side, no cast shadows. Seamlessly tileable
> horizontally: the left edge continues the right edge. Large clear shapes that still read when the map is
> small and wrapped around a sphere. Style: clean hand-inked comic illustration, bold black ink outlines around
> the shapes, bright warm flat colours with no gradients, a small palette of <colours>. Inside the flat areas
> hand-inked texture: fine hatching and cross-hatching, stippled dots, small cracks and pocks, flow lines,
> drawn with black and darker tones of the same colours, never photographic. No glossy highlights, no glow,
> no 3D rendering. No text, no letters, no logos, no frame.

Cinder (made from the planet in Rook's home scene, bright style 2026-11-18) uses: warm grey basalt plates, round
craters with light grey rims, a web of sunny mustard lava cracks, a few coral red lava rivers, light ash-grey
bands at the poles, plus ink hatching on the plates and flow lines in the lava. Ilja on the textured version:
"besser" than the smooth one; planets are big on screen and may carry more texture than items.
Rime's features (dark style, being redrawn) were: cracked seas of blue-black methane ice, branching white frost ridges, large bone-white ice
shelves, dark teal fracture lines, small round frozen craters, one long rust-red mineral streak.

What matters most:
- **Evenly lit.** A map with its own shadows looks wrong once the shader adds the real shadow.
- **Large shapes.** Only about half the map is visible at a time, squeezed towards the edges; fine texture
  turns into noise.
- **Poles.** The top and bottom rows get squeezed into points. Plain bands there (ice caps, haze) hide this.

## 3. Check the seam

Download the raw image to `/mnt/project-files/planet-anim/raw/`. Build a test picture with the right half
moved in front of the left half; the middle of that picture is the seam. If it shows a hard break, generate
again (Rime's first try was already almost seamless).

## 4. Prepare and add

Resize to 2048×1024, blend a 6 px band on both edges into each other (hides a last small step), save as JPEG
quality 84 to `apps/client/art/planets/<place>.jpg`. The script used for Rime:

```python
from PIL import Image
import numpy as np
im = Image.open("raw.png").convert("RGB").resize((2048, 1024), Image.LANCZOS)
a = np.asarray(im).astype(float); b = 6
for i in range(b):
    t = 0.5 * (1 - i / b); l = a[:, i].copy(); r = a[:, -1 - i].copy()
    a[:, i] = l * (1 - t) + r * t; a[:, -1 - i] = r * (1 - t) + l * t
Image.fromarray(a.clip(0, 255).astype("uint8")).save("apps/client/art/planets/<place>.jpg", quality=84, optimize=True, progressive=True)
```

Then link it: in `data/meta.json`, the background cosmetic gets `"planet": "<place id>"` (for example
`bg_rime` → `rime`). `npm run validate` checks that the place exists. A background without a map keeps the
placeholder, so nothing breaks while pictures are missing.

## 5. Look at it

`npm run client:build`, serve `out/client`, open the start screen with that background equipped. A headless
browser renders only a few frames per second, so for a video step the scene by hand (call the scene's
`update` with a fixed time step, screenshot each frame, join with ffmpeg). Show Ilja one full turn so he can
see the loop is seamless.

## Not done yet

- Clouds or haze as a second, faster layer; rings (gas giant, ringed planet) need an extra flat ring picture.
- Other screens than the start screen still use the plain background.
- `bg_home` (the default background) shows Cinder (2026-11-17, Ilja liked the lava planet
  from Rook's home scene); `bg_home` may get its own place later.
