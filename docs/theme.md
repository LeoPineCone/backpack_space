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
theme. How buttons get their final comic look (ink outline, hard shadow, press effect) is still open.
