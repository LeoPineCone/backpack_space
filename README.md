# Backpack Space

Design draft of a backpack auto-battler in space: shared battle core, game data, balancing tools and a browser preview.

- Concept: [docs/concept.md](docs/concept.md)
- Art style: [docs/style.md](docs/style.md)
- Every hero, item, bag and recipe: [docs/catalog.md](docs/catalog.md) (generated)
- Game terms in English and German: [docs/glossary.md](docs/glossary.md) (generated from `data/glossary.json`)
- Picture list for every item and bag: [docs/item-art.md](docs/item-art.md) (generated from `data/item-art.json`)
- Latest measurements: [docs/findings.md](docs/findings.md), full reports in [docs/reports/](docs/reports/)

## Setup

```
npm install
npm run validate     # checks data/*.json and prints the size of the catalogue
npm run typecheck
npm test
```

## The game client

`apps/client` is the game itself (TypeScript + PixiJS; Capacitor wraps it for the stores later). It follows the wireframes: hero ring, shop and backpack on one screen (buying is dragging, loose pieces drop below the backpack), item popup with symbols and the "i" legend, artifact choice, fight playback with ×1/×2/×4, round result, run end with the reward. It has no art yet: items are tiles with a type symbol and their initials, all symbols are simple line icons (`src/icons.ts`). The client never decides a rule or a fight; it calls the core and replays the battle log (`Replay` in the core). Opponents are the stored bot builds of the preview until there is a server.

Hosted build (private link, state of 2026-11-15): https://claude.ai/artifact/ENE9du3Hhp2LDQLeVxNQ5Q

```
npm run client        # dev server
npm run client:build  # static build in out/client
```

Drag a piece to place it; while dragging, a second finger, the mouse wheel or R turns it. Tap a piece to see what it does.

## Play it in the browser (design tool)

Hosted build of the preview (private link, state of 2026-11-15): https://claude.ai/artifact/7Sn3PH5UH19ZMAp7bmgFsP

```
npm run play          # dev server with the preview tester
npm run play:ghosts   # refresh the stored bot builds you fight against (after data changes)
npm run play:build    # static build in out/play
```

## Balancing reports

Every report states the question it answers, takes the same flags and can be written to a file:

```
npm run report:battles    # fight length per round, Supernova share, damage sources
npm run report:heroes     # win share per hero, by part of the run, hero against hero
npm run report:runs       # where runs end with the real lives, backpack and gold per round, does skill pay
npm run report:items      # what each item adds to a build compared with its price (STRONG / WEAK)
npm run report:recipes    # which recipes get made, how deep chains go
npm run report:placement  # what the layout is worth
npm run report:paths      # does every hero have several paths that win (bots commit to one path each)
npm run report:synergy    # hero against hero and path against path; do items and hero rules interlock more each round
npm run report:all        # all of them into out/reports/
```

Balancing targets (fight length, Supernova, hero win shares, recipe dominance) live in `data/sim/targets.json`; the battles, heroes and recipes reports end with an OK / OFF line per target.

Flags: `--accuracy quick|normal|precise` (or `--quick`, `--precise`), `--sims N` for the main count, `--seed S` for an independent sample, `--out file`.
`npm run report:items -- --write-ratings` also stores the measured strength per item in `data/sim/ratings.json`; the bots then prefer items that measured strong (run it again after bigger item changes).

Other tools: `npm run battle -- --round 8 --a venn --b ysel --log` prints one fight; `npm run catalog` regenerates `docs/catalog.md`, `docs/glossary.md` and `docs/item-art.md`.

## Layout

```
data/                 rules.json, heroes.json, recipes.json, glossary.json, item-art.json, items/*.json, sim/ratings.json
packages/core/src/    deterministic core: grid and bags, compile, battle, replay, shop, run rules, bots, rules text
packages/core/node/   JSON loader (Node only)
src/sim/              lobbies of bots playing whole runs
src/reports/          balancing reports
src/cli/              validate, battle, catalog
apps/client/          the game client (PixiJS, Vite)
playground/           browser preview tester (Vite), a design tool
test/                 vitest
```

## How the bots play

A bot plays a run by the rules: it gets the round's gold, sees six offers, buys what it values above its price, rerolls a few times, buys bags when the backpack is nearly full, and lays everything out so that as many stars as possible point at something useful and the inputs of every recipe it owns lie together. Like a player's, those inputs fight as separate items and merge after the round's fight; a bot never locks an item. It values an item by price, synergies with what it owns, recipes it opens, the hero path it committed to (see `paths` in `data/heroes.json`; one bot in four plays without one) and the measured ratings.
