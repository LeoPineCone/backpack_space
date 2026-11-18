# UI theme

The game UI keeps one look: **dark blue with a strong yellow** (Ilja, 2026-11-17), plus a cold light blue for
selection and info. All values live in [`data/theme.json`](../data/theme.json); the client reads them through
`apps/client/src/theme.ts`. Change a colour there, never in code.

This is the theme of the **interface** (buttons, panels, text). The **art** (items, heroes, planets) has its
own bright ink palette in [style.md](style.md); the two meet in the yellow (UI `sun` / art `mustard`) and the
night blue (art `navy`).

## Structure

- `palette`: every colour once, with a name (`night`, `sun`, `beacon`, ...).
- `ui`: the job of a colour (`bg`, `panel`, `text`, `gold`, ...). The code only uses these jobs (`C.gold`), so a
  colour can be changed or swapped for a season without touching screens.
- `buttons`: the kinds of buttons (below).
- `rarity`, `tagFill`: rarity colours and the tile colour per item type (while items have no pictures).
- `fonts`: display font for titles, numbers and buttons; text font for sentences.
  The font files ship inside the app (`apps/client/src/fonts/`, loaded by `apps/client/src/fonts.css`): Chakra Petch 600/700 and Inter 400/600, Latin subset. Both are under the SIL Open Font License 1.1, which allows bundling them in an app, also a paid one, as long as the licence text goes along (it does: `fonts/*-OFL.txt`) and the fonts are not sold on their own. A new font or weight needs its file and licence there too; the client loads nothing from another server.

## Colours

| Job | Palette | Hex | Used for |
|---|---|---|---|
| `bgDeep` | `space` | `#070b18` | deepest background, outside the screen, dark fades |
| `bg` | `night` | `#0d1326` | screen background |
| `backdrop` | `dusk` | `#141c38` | plain menu background without a picture |
| `panel` | `hull` | `#1a2340` | cards, popups, round buttons |
| `line` | `wire` | `#3a476e` | outlines, dividers |
| `text` | `starlight` | `#eef1fb` | main text |
| `dim` | `haze` | `#a9b4d6` | secondary text, inactive symbols |
| `gold` | `sun` | `#f5b942` | main action, rewards, highlights |
| `goldInk` | `sunInk` | `#1a1300` | text and symbols on gold |
| `cyan` | `beacon` | `#5cc8ff` | selection, info, "i" buttons |
| `cyanInk` | `beaconInk` | `#04202e` | text on cyan |
| `bag` | `plate` | `#24305a` | bags in the backpack |
| `bagLine` | `rivet` | `#4a5a8c` | bag outlines |
| `gridLine` | `seam` | `#2a3558` | backpack grid |
| `floor` | `floor` | `#101830` | floor under the backpack (loose items) |
| `zap` | `spark` | `#8ff3ff` | merge beam |
| `flash` | `white` | `#ffffff` | hit flash in fights |
| `good` | `mint` | `#6fe3a1` | healing, buffs, wins |
| `bad` | `flare` | `#ff7a59` | damage, debuffs, losses |
| `ink` | `ink` | `#14161f` | ink outline and hard shadow of every UI element (same as the art's Ink) |
| `health` | `cream` | `#f1e6cc` | own health bar in fights |
| `shield` | `teal` | `#2f9a9a` | Shield on top of the health bar |

## Rules

- **Yellow means "do this" or "you got this".** One main yellow button per screen (FIGHT, START, TAKE);
  rewards and currencies may use yellow too. Everything else stays blue.
- **Light blue means "selected" or "explain".** Chosen hero, active tab, the "i" buttons.
- **Green and red only for game results**: healing and buffs, damage and debuffs, win and loss.
- Text on yellow is always `goldInk`, text on light blue `cyanInk`. `npm test` checks the contrast of text
  on its background (at least 7:1 for main text, 4.5:1 for secondary text).
- No gradients, no glow (same as the art). Fades for readability over pictures are stepped bands
  (`src/backdrop.ts`).

## Buttons

| Kind | Look | When |
|---|---|---|
| `primary` | yellow fill, dark ink, dark ring | the one main action of a screen |
| `icon` | round, dark blue fill, blue outline, light symbol | navigation and tools (glossary, settings, pass, shop) |
| `secondary` | outline in yellow on dark | a second action next to a main one |
| locked | any kind at 0.4 opacity, with a lock symbol | not available yet |

`pillButton` uses `primary` and `roundButton` uses `icon` by default (`src/ui.ts`), so every screen follows the
theme.

## Hand-inked look

The UI speaks the same hand-inked language as the art (`docs/style.md`), decided by Ilja on 2026-11-18 after
trying black ink outlines with hard shadows, a coloured base and a light sticker rim: on the dark blue none of them
read well. What stays is a plain frame and ink on the surfaces. It is drawn in code, not with pictures, so it stays
sharp on every phone and follows this theme. Sizes live in `comic`.

- **Frame:** a plain frame, `comic.frame` points wide, in a darker tone of the surface (yellow gets dark mustard) or
  in `line` on dark surfaces. `box`/`disc` with `framed: true`; a given `line` replaces it. No black outline, no shadow.
- **Ink shading:** buttons, cards, popups and HUD pills get diagonal ink strokes low on the surface, in a darker
  tone of the surface colour (`inkShade` in `src/ui.ts`). The shading edge rises from left to right, from a sliver
  on the left to about a third of the height on the right, so the light comes from the upper left. A strip of
  cross-hatching sits in the darkest corner. Keep it subtle: Ilja asked twice for less, not more.
- **Press:** while the finger is down, a button shrinks to `comic.press` (`pressable`). No vibration.
- **Plates:** popups and shop cards are ship plates (`plate`): frame, a thin inner line, rivets in the corners.
- **Inked titles:** titles and big numbers (hero name, item name, gold) get an ink outline around the letters and a
  hard shadow (`txt(..., { inked: true })`). Sentences stay plain.
- **Bars:** dark track with notches every quarter; own health in `health`, the opponent's in `dim`, Shield as a
  `shield` strip on top, Energy in `gold`. Lost health stays a moment as a light chunk.
- **Bags:** a stitched seam inside the outline, like sewn cloth; the cell grid inside is faint.
- **Shop cards:** rarity is a coloured corner with one pip per rarity step; the price is the coin symbol.
- **Main symbols are pictures:** gold, Credits, Galaxies, league patch, full and empty heart, Energy, level,
  dice, bin, pin and settings are coloured ink pictures in `apps/client/art/ui/` (docs/client-art.md). They keep
  their colours; all other symbols stay tinted line symbols.

## Rarity

Rarity colours come from the art palette: common warm grey, rare teal, epic violet (the only colour the art palette
does not have), legendary mustard, artifact coral red.
