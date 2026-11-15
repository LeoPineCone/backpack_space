# Backpack Space

Design draft of a backpack auto-battler in space: shared battle core, game data, balancing tools and a browser preview.

- Concept: [docs/concept.md](docs/concept.md)
- Every hero, item, bag and recipe: [docs/catalog.md](docs/catalog.md) (generated)
- Latest measurements: [docs/findings.md](docs/findings.md), full reports in [docs/reports/](docs/reports/)

## Setup

```
npm install
npm run validate     # checks data/*.json and prints the size of the catalogue
npm run typecheck
npm test
```

## Play it in the browser

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
npm run report:all        # all of them into out/reports/
```

Flags: `--accuracy quick|normal|precise` (or `--quick`, `--precise`), `--sims N` for the main count, `--seed S` for an independent sample, `--out file`.
`npm run report:items -- --write-ratings` also stores the measured strength per item in `data/sim/ratings.json`; the bots then prefer items that measured strong (run it again after bigger item changes).

Other tools: `npm run battle -- --round 8 --a flora --b ysel --log` prints one fight; `npm run catalog` regenerates `docs/catalog.md`.

## Layout

```
data/                 rules.json, heroes.json, recipes.json, items/*.json, sim/ratings.json
packages/core/src/    deterministic core: grid and bags, compile, battle, shop, run rules, bots, rules text
packages/core/node/   JSON loader (Node only)
src/sim/              lobbies of bots playing whole runs
src/reports/          balancing reports
src/cli/              validate, battle, catalog
playground/           browser preview tester (Vite)
test/                 vitest
```

## How the bots play

A bot plays a run by the rules: it gets the round's gold, sees five offers, buys what it values above its price, rerolls a few times, buys bags when the backpack is nearly full, combines recipes, and lays everything out so that as many stars as possible point at something useful. It values an item by price, synergies with what it owns, recipes it opens, a personal taste and the measured ratings. One simplification: a bot combines as soon as it owns all inputs.
