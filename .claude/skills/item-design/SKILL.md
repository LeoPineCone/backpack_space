---
name: item-design
description: How to design or change an item (or bag) in Backpack Space - size by type, price by rarity, a number budget for the first draft, all the files an item touches, and the checks. Use before adding or changing anything in data/items/*.json.
---

# Designing an item

(Rewritten 2026-11-16. The first version from 2026-11-15 never reached the repo because `.claude/` was
git-ignored; its rules are restored here from the decisions, plus what the measurements taught since.)

An item is data only: `data/items/*.json`. Its rules text is generated from the effects (`describe.ts`), so an
item is only as expressive as the effect schema (`packages/core/src/schema.ts`). An idea the schema cannot
express needs a schema + battle change first, with tests. Not a clone: no names or looks of existing games.
No alcohol.

## 1. Idea and place

- Which hero pool (`hero`) or the general shop? Which **path** of the hero does it serve? A path item should
  pay off mainly for a committed build (it counts or needs other items of that path), otherwise every bot of the
  hero buys it and the paths stay alike (see the balancing skill, lessons learned).
- Types (`tags`, first tag = main type): weapon, armor, accessory, pet, food, mechanical, organic. Synergies
  refer to these ("starred food", "your pets", "crafted").
- Recipe input or result? Results are never sold (`crafted`), cost the sum of their inputs, are stronger and
  usually smaller than the inputs together. A chain has at most 3 steps above a base item (`validate` checks).
- Words: use terms from `data/glossary.json`; add a term there before using a new word.

## 2. Size follows the thing (decided 2026-11-15, not a strict rule)

| Type | Cells | Today (shop items) |
|---|---|---|
| Weapon | 2 or more. 1 cell only for daggers, fangs, small throwables and a hero's start weapon | 1 cell: 10 of 83; 2: 35; 3: 16; 4+: 22 |
| Pet | by body size (pup 2, bear 4+) | 1: 8, 2: 24, 4: 9 |
| Food | single fruit, snack or drink 1, a meal 2, a feast more | 1: 23, 2: 6 |
| Armor | 2 typical, heavy pieces 4 | 2: 18, 4: 10 |
| Accessory | 1–2 | 1: 41, 2: 29 |

A test keeps one-cell weapons at most 25 % of the shop weapons. Stars (`*` in `shape`) are for items that
point at neighbours: about 1 in 6 items has them. Larger shapes cost backpack room, which is part of the price.

## 3. Price by rarity

| Rarity | Gold (range, median) | Cells (median) |
|---|---|---|
| common | 1–4, 3 | 1 |
| rare | 4–7, 5 | 2 |
| epic | 7–11, 8 | 3 |
| legendary | 11–21, 13 | 4 |

Artifacts are free picks (after rounds 4 and 8), never sold. `weight` (default 1) only changes how often the
shop offers the item within its rarity (0.8 rarer, 1.25–1.5 more often); it is not a strength knob.

## 4. Number budget for a first draft

Damage per second of a weapon (average damage / cooldown) ≈ **0.3 × price + 0.4 × cells**.
Measured on today's shop weapons the ratio to this budget has a median of about 0.9 (middle half 0.75–1.2),
so the formula is a good start. Then:
- Energy: every weapon has `range` (melee/ranged) and `energy` per attack; pets have `energy` 0 (validate).
  A fast weapon with low energy cost is stronger than its damage per second says; check report:items.
- Effects instead of damage (heal, shield, buffs, debuffs): there is no exact exchange rate. Start from an item
  of the same rarity with a similar effect and adjust; the measurement decides.
- Effects that **count** (`per`) grow with the build: cap them (`max`) and check the late rounds.
- **Saturating numbers:** Strip above ~10 rarely does more (enemies seldom hold more stacks); Jam/Cryo/
  Overclock are capped in `rules.status`. Raising a capped number changes nothing.
- **Cheap items every bot buys are strong levers** (start items, common food, artifacts): change them in small
  steps; +1 Power per use on one rare Quill food moved all of Quill by 4 points.

## 5. All the files an item touches

1. `data/items/<file>.json`: the item (keep the one-item-per-line format of the file).
2. `data/item-art.json`: `brief` ending with `Accent: <colour>.` (rust red, deep teal, mustard, moss, copper,
   bone) and a `description` within the word limit for its size (see `docs/style.md`).
3. `data/locales/de.json`: German name `item.<id>` (English comes from the item). `npm run i18n` lists gaps.
4. `data/recipes.json` if it is an input or result.
5. Size changes: `npm run play:ghosts` (stored opponent builds of the playground).

## 6. Checks

- `npm run validate && npm run typecheck && npm test`, then `npm run catalog` (docs/catalog.md shows the
  generated rules text: read it, it is what the player sees).
- Measure (balancing skill): `npm run ratings` so the bots value it, `npm run report:items` (gain per gold;
  STRONG / WEAK / never bought), and the hero's `report:paths -- --precise --baseline ...` if it belongs to a
  hero or path. Keep it only if it lands within its rarity's band and does not push a hero out of 48–52 %.
