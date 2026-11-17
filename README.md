# Backpack Space

Design draft of a backpack auto-battler in space: shared battle core, game data, balancing tools and a browser preview.

- Concept: [docs/concept.md](docs/concept.md)
- Art style: [docs/style.md](docs/style.md)
- Player retention and economy (currencies, progress tracks, season pass, leagues): [docs/retention.md](docs/retention.md)
- UX (flows, navigation, every screen and action, decided UI rules): [docs/ux.md](docs/ux.md)
- Requirements for version 1 (what has to hold at launch, milestones, dependencies, launch blockers): [docs/requirements.md](docs/requirements.md)
- Matchmaking (opponent per round, bot backpacks, league groups, versions; concept): [docs/matchmaking.md](docs/matchmaking.md)
- Client and server (every request between app and backend, flows as diagrams, error cases; concept): [docs/client-server.md](docs/client-server.md)
- Store and purchases (RevenueCat, real money and Credits, refunds; concept): [docs/store.md](docs/store.md)
- Every hero, item, bag and recipe: [docs/catalog.md](docs/catalog.md) (generated)
- Game terms in English and German: [docs/glossary.md](docs/glossary.md) (generated from `data/glossary.json`)
- Languages (English, German), how the game picks one and how to add one: [docs/i18n.md](docs/i18n.md)
- Picture list for every item and bag with a short brief and a full description for image prompts: [docs/item-art.md](docs/item-art.md) (generated from `data/item-art.json`; `npm run art:prompt -- <id>` prints the finished prompt)
- Latest measurements: [docs/findings.md](docs/findings.md), full reports in [docs/reports/](docs/reports/)

## Setup

```
npm install
npm run validate     # checks data/*.json and prints the size of the catalogue
npm run typecheck
npm test
```

## The game client

`apps/client` is the game itself (TypeScript + PixiJS; Capacitor wraps it as an iOS and Android app). It follows the wireframes: hero ring, shop and backpack on one screen (buying is dragging, loose pieces drop below the backpack), item popup with symbols and the "i" legend, artifact choice, fight playback with ×1/×2/×4, round result, run end with Galaxies, hero XP and league points. Progress between runs (hero levels, planet track, season pass, leagues, profile with patch and background) sits in one popup with five tabs (`scenes/progress.ts`); the rules for it are in the core (`meta.ts`), the numbers in `data/meta.json`, the profile is kept on the device (`src/profile.ts`). It has no art yet: items are tiles with a type symbol and their initials, all symbols are simple line icons (`src/icons.ts`). The client never decides a rule or a fight; it calls the core and replays the battle log (`Replay` in the core). Opponents come through `src/opponents.ts` (`OpponentSource`): the stored bot builds of the preview until there is a server with saved backpacks of real players. A running run is kept on the device (`src/save.ts`): a reload continues in the shop, or replays a fight that was already started with the same opponent and seed, so it ends the same way. Stars that have an item on them are always shown in the backpack (gold when the star's effect counts that item, `starLinks` in the core), and the first run starts with a short introduction of five spots on the shop screen (`scenes/intro.ts`, again behind the i button).

Hosted build (private link, state of 2026-11-15): https://claude.ai/artifact/ENE9du3Hhp2LDQLeVxNQ5Q

```
npm run client        # dev server
npm run client:build  # static build in out/client
npm run app:ios       # build, copy into the iOS project, open Xcode
npm run app:android   # build, copy into the Android project, open Android Studio
```

How to get it onto a phone: [docs/mobile.md](docs/mobile.md).

Drag a piece to place it; while dragging, a second finger, the mouse wheel or R turns it. Tap a piece to see what it does.

## Play it in the browser (design tool)

Hosted build of the preview (private link, state of 2026-11-15): https://claude.ai/artifact/7Sn3PH5UH19ZMAp7bmgFsP

```
npm run play          # dev server with the preview tester
npm run play:ghosts   # refresh the stored bot builds you fight against (after data changes)
npm run play:build    # static build in out/play
```

## Play a run as text (playtest)

A person or an AI plays one run by the player's rules (same shop, gold, merges and free picks as the client) against the stored bot builds, and writes down what the choices felt like. Expensive per run, but it finds what the bots cannot: dead shops, picks that fit no build, hopeless matchups.

```
npm run playtest -- new beasts1 --hero quill --seed 11 --goal "Big beasts"
npm run playtest -- beasts1 "buy 2 4 3; reroll; note no beast offered yet; fight"
npm run playtest -- beasts1 report      # out/playtest/beasts1.md
```

Commands: show, info <id>, spots <id>, buy <slot> [x y rot], place <loose> x y [rot], move <item> x y [rot], bag <bag> x y [rot], drop, sell, sellloose, sellbag, reroll, freeze, lock, pick, tidy, fight, note <text>, report. Several commands go in one call, split by ";" (so no ";" inside a note).

## Balancing reports

Every report states the question it answers, takes the same flags and can be written to a file:

```
npm run report:battles    # fight length per round, Supernova share, damage sources
npm run report:heroes     # win share per hero, by part of the run, hero against hero
npm run report:runs       # where runs end with the real lives, backpack and gold per round, does skill pay
npm run report:items      # what each item adds to a build compared with its price (STRONG / WEAK)
npm run report:recipes    # which recipes get made, how deep chains go
npm run report:placement  # what the layout is worth
npm run report:paths      # does every hero have several paths that win (bots commit to one path each); path profile: does each path win in its own way
npm run report:picks      # free picks after rounds 2 and 6: gain per item and hero, choice test (is one always taken?); --careful: bots lay out with much more care
npm run report:synergy    # hero against hero and path against path; do items and hero rules interlock more each round
npm run report:strength   # item outliers by three views: add one (rating), remove one, regression over all fights (needs npm run baseline)
npm run report:meta       # path against path, hero against hero, how much is rock-paper-scissors, meta share per hero and path (needs npm run baseline)
npm run report:selftest   # checks the measuring tool itself: same result again, honest ±, sees a real change
npm run report:all        # all of them into out/reports/
npm run ratings           # measure every item again and store data/sim/ratings.json (rarely; --seeds 1,2 for a steadier result)
npm run ratings -- --only a,b   # after an item change: measure only these items again, all other ratings stay

npm run baseline          # the reference for tuning: lobbies on two seeds stored with every build and fight (out/baseline/main/)
npm run balance:replay -- --patch p.json   # what a number change does to every target, in seconds (--full: bots shop again)
npm run balance:sense -- --knobs hero:venn    # which number moves which target by how much
npm run balance:propose -- --knobs hero:venn  # proposes the fewest number changes that bring the targets into their bands (changes nothing)
npm run balance:sweep -- --knob rule:shop.heroOfferPct --values 20,40,50   # one number at several values, full runs: paths and heroes per value, with curves
```

Tuning never edits `data/` to try something: a patch file (`{ "changes": [{ "item": "venus_mantrap", "set": { "cooldown": 2.0 } }] }`) is measured against the baseline, and a proposal is only a patch file until the designer agrees. How this works and when a replay is exact: `.claude/skills/balancing/SKILL.md`; the design behind it: `docs/proposals/balancing-workflow.md`.

Every report run also writes a static HTML page with tables, heatmaps (hero against hero, path against path), charts per round and a light per target: `out/reports/<report>.html`, or next to the `--out` file. `out/reports/index.html` links all report pages and lists every target that is OFF. Open it straight from disk in a browser (no server needed); `--no-html` skips the page.

Balancing targets (fight length, Supernova, hero win shares, recipe dominance) live in `data/sim/targets.json`; the battles, heroes and recipes reports end with an OK / OFF line per target.

Flags: `--accuracy quick|normal|precise` (or `--quick`, `--precise`), `--sims N` for the main count, `--seed S` for an independent sample, `--out file`.
Reports that play whole lobbies (`paths`, `selftest`) use all processor cores (`--jobs N` to limit); the result does not depend on it.

How exact is a number? `±N` in the paths report is one standard error measured from how much a share varies between blocks of lobbies (one bot's fights are not independent, so the error over single fights was far too small). Rule of thumb for one path: about ±2 points at precise, ±4 at normal. To judge a change, measure before and after with the same seed: `npm run report:paths -- --precise --baseline out/reports/paths.json` compares with the previous run on the same lobbies (paired) and marks a change with * when it is at least two standard errors. Re-measure the ratings first when items changed (`npm run ratings`).
`npm run ratings` (= `report:items -- --write-ratings`) stores the measured strength per item in `data/sim/ratings.json`; the bots then prefer items that measured strong. Two runs with different seeds agree to about ±0.2 per item (correlation 0.84).

`npm run i18n` lists texts that are missing in a language (English stands in for them).

Other tools: `npm run battle -- --round 8 --a venn --b ysel --log` prints one fight; `npm run catalog` regenerates `docs/catalog.md`, `docs/glossary.md` and `docs/item-art.md`.

## Layout

```
data/                 rules.json, heroes.json, recipes.json, glossary.json, item-art.json, items/*.json, locales/*.json, sim/ratings.json
packages/core/src/    deterministic core: grid and bags, compile, battle, replay, shop, run rules, bots, rules text
packages/core/node/   JSON loader (Node only)
src/sim/              lobbies of bots playing whole runs
src/reports/          balancing reports
src/cli/              validate, battle, catalog
apps/client/          the game client (PixiJS, Vite); ios/ and android/ are the Capacitor app projects
playground/           browser preview tester (Vite), a design tool
test/                 vitest
```

## How the bots play

A bot plays a run by the rules: it gets the round's gold, sees six offers, buys what it values above its price, rerolls a few times, buys bags when the backpack is nearly full, and lays everything out so that as many stars as possible point at something useful and the inputs of every recipe it owns lie together. Like a player's, those inputs fight as separate items and merge after the round's fight; a bot never locks an item. It values an item by price, synergies with what it owns, recipes it opens, the hero path it committed to (see `paths` in `data/heroes.json`; one bot in four plays without one) and the measured ratings.
