---
name: hero-art
description: How to make the pictures of a Backpack Space hero (look drafts, model sheet, full body, round head picture, home scene) with OpenArt - which assets, sizes, order, approvals, credits, prompts that worked and pitfalls. Use before generating any hero, season hero or hero skin picture.
---

# Hero pictures

(Written 2026-11-17 after Venn, the first hero done end to end. Ilja's feedback during that run is in here.)

Read first: the hero in `docs/heroes.md` (story, look, **fixed marks**, skin slot), the hero's paths in
`data/heroes.json`, its home in `lore/planets.json`, and the style rules in `docs/style.md`.

## Assets per hero

| Asset | Used for | Format | Background |
|---|---|---|---|
| Model sheet | Not in the app. The fixed reference for every later picture and for skins. | 16:9, front + three-quarter + back, same scale and baseline | flat light grey `#c8c8c8` |
| Full body | Hero choice (shown at 200×240 pt), hero popup, Credits shop | 4:5, three-quarter view, whole figure with margin | flat light grey, cut out afterwards |
| Head picture | Hero ring (r 30/40 pt), hero badges (r 18–30 pt: shop, free pick, run end, progress, fight bar) | 1:1, head and shoulders, fixed marks centred so they fit in a circle | flat light grey, cut out, put on a disc |
| Home scene | Behind the hero choice, shop offer, website/store (crop to landscape) | 9:16 | painted scene |

Locked and silhouette states are drawn by code; skins and hero level rewards come later (a skin swaps only the
skin slot and keeps the fixed marks).

Where the files go today: `/mnt/project-files/heroes/<hero>/` (drafts in `.../<hero>-entwuerfe/` and
`.../<hero>/szene-entwuerfe/`, raw downloads in `.../<hero>/raw/`). They are not in `apps/client/art/` yet; when
they move there, add a row to `docs/client-art.md`.

## Order and approvals

Ilja decides every look; never jump ahead to the final picture.

1. **Describe first.** Give the hero description in German and, when the look is open, a few short idea
   directions (text only). Ilja wanted ideas that are *creative and clearly space*, not "a plant in a suit":
   the winning Venn idea was a lure flower whose poison pollen turns as a small spiral galaxy. Tie ideas to the
   hero's three paths where possible.
2. **Look drafts:** 3 different ideas, cheap (1k, medium, 10 credits each). Ilja often combines or removes
   parts ("1, but without X"): do that as an **image2image edit** of the chosen draft (2 variants, 20 credits).
3. **Model sheet** from the approved draft (2k, high, 40). Wait for OK.
4. **Full body + head picture** together in one batch (2k, high, 2×40), both with the model sheet and the
   draft as references. Cut out, make the phone preview (below), check the fixed marks still read in the
   smallest circle.
5. **Home scene:** describe the scene in text first. Then 3 **really different scenes** as cheap drafts
   (Ilja: "verschiedene Szenen, damit man wirklich die Wahl hat", not three versions of one), then the chosen
   one final (2k, high, 40) with the draft and the model sheet as references.
6. Update `docs/heroes.md` when a fixed mark or look detail changed.

Budget seen with Venn: about 330 credits for everything, including two redo rounds of the scene. Tell Ilja the
credits used and left in every result message (`openart_account_get`).

## OpenArt settings that worked

- Model `gpt-image-2-5-sunburst`. Drafts `resolutionTier 1k, quality medium` (10). Finals `2k, high` (40).
- Changes to an existing picture: mode `image2image`, `visualReferences: [{type:"image", id:"resource:<resourceId>", label:"..."}]`.
  The resource id is in `openart_creation_get` → `resources[].id`. Keep the ids of the approved draft and the
  model sheet; every later picture uses the model sheet as reference.
- Several different pictures: `openart_generate_image_batch` in one call. Wait about 90–110 s, then read
  each result with `openart_creation_get` and download the `url` with curl.

## Prompt rules (learned the hard way)

- **Detail level is the main risk.** Ilja on the first scenes: "sieht zu nach KI aus, zu viel Pflanzen überall";
  on the stripped-down retry: "zu minimalistisch". What worked was the middle:
  > Classic hand-inked comic book panel, balanced detail: a fully drawn room with clear readable background and
  > a handful of meaningful props, but with breathing room and calm areas, not cluttered and not empty.
  Put the hero's signature material (Venn: tendrils) only on the hero and on two or three spots in the scene,
  and say "nowhere else".
- **Spell out the hero from the model sheet** in every prompt (suit, visor, fixed marks, what each arm is), and
  say "exactly as in the model sheet". Without it the design drifts.
- **Forbidden body parts drift back in.** Venn got human hands in several scene drafts. Write "NO hands, it
  holds things only with tendrils" and give each held object a holder ("a hose held in its vine whip"). Check
  every picture for it before showing it.
- **Count the fixed parts.** Rook's first full body came out with seven legs (two wrenches and a loose
  floating hook). Name the parts with a number ("EXACTLY SIX tool legs: 1) ... 6) ..., each attached to the body")
  and count them in every result. A fix as image2image edit of the faulty picture keeps the rest.
- Ideas must have a reason in the hero's life. Ilja rejected scrap circling around Rook ("macht keinen Sinn") and
  a hatch dragged on a chain ("passt gar nicht"). An older picture Ilja already liked can be the better base.
- Planets in a scene drift to Earth (blue oceans, white clouds). Ask for a strange alien planet, no blue
  oceans, no white clouds, and give **every hero its own planet look** (Venn: rust, bone and teal bands; Rook:
  pale cracked planet with a rust-red ring). Ilja noticed Rook's first scene had the same banded planet as Venn.
  To change only the planet, an image2image edit of the chosen draft that says "ONLY CHANGE THE PLANET" works.
- For pictures that get cut out (sheet, full body, head): "Background: flat plain light grey (#c8c8c8),
  nothing else, no floor shadow". A black ink outline on a dark background cannot be cut out cleanly.
- Composition of the home scene: hero in the upper two thirds; the bottom third calmer, because the hero ring
  covers it on the hero choice screen.
- Always end with the style part: dark ink comic, heavy solid black shadows, bold angular shapes, flat matte
  colours, no gradients, no glow, no glossy highlights, no 3D, no text, no letters, no frame. No alcohol
  (no bottles or glasses in food scenes).

## Cut out and preview

`python3 -I .claude/skills/hero-art/scripts/cut.py <hero-folder>` expects `raw/<hero>-ganzkoerper.png` and
`raw/<hero>-kopf.png` and writes:

- `<hero>-ganzkoerper.png`: full body without background, cropped to the figure.
- `<hero>-kopf-freigestellt.png` and `<hero>-kopf-rund.png` (512 px, cut out and placed on the dark UI panel
  colour inside a circle).
- `vorschau-handy-3x.png`: full body at hero choice size (200×240 pt) and the round head at r 40/30/26/22/18 pt,
  at 3× (open full screen on a phone for real size), plus `vorschau-1x.png`.

The cut-out flood-fills the grey from the border and also removes enclosed grey holes (between a whip and the
body). If the head is not centred in the square, change `HEAD_CENTER` / `HEAD_RADIUS` at the top of the script.
Look at the preview yourself before sending it: grey specks, cut-off flower or whip, readability in the
smallest circle.
