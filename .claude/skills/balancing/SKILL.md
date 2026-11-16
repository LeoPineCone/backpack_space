---
name: balancing
description: How to measure and balance Backpack Space (heroes, paths, items, recipes, fight length) with the simulation reports. Use for any balancing question, any change to item/hero/rule numbers, a new hero or new items, and before trusting a report number.
---

# Balancing Backpack Space

The simulation is our only balancing instrument until real players exist. It is good at **comparisons** and
only rough at **absolute values**. Everything below exists so that a number we act on is a real effect,
not chance and not a bot quirk.

## Ground rules

- Game values live in `data/*.json`; never balance in code. Rules text comes from the data (`describe.ts`).
- **Hero rules** (`effects`, `craftGold`, `supernovaResist` etc. in `data/heroes.json`) are design decisions:
  change them only with the designer's OK. Item numbers, prices and shop weights may be tuned freely, but say
  what changed.
- Path definitions (`paths[].focus`) and item concepts are design: number tuning does not rebuild them.
- Item changes follow `.claude/skills/item-design/SKILL.md` (size by type, price, number budget).
- Never merge a balancing PR without the designer's OK. Report results short, in German, in the chat;
  repo text stays English.
- Write every balancing pass into `docs/findings.md` (newest on top): question, what changed, numbers
  before/after with accuracy and seed, what stays open.

## The tools

| Command | Answers | Time here (4 cores) |
|---|---|---|
| `npm run report:paths` | win share per hero and per path, vs the hero's open bot; targets marked ✓/✗ | quick 10 s, normal 30 s, precise ~1.5 min |
| `npm run report:picks` | free picks after rounds 4 and 8: gain per item and hero, choice test (best/worst in its offer), offers with no good option | quick 30 s |
| `npm run report:heroes` | hero win share per third of the run, hero against hero | single core, not timed yet |
| `npm run report:battles` | fight length, Supernova share, damage sources | single core, not timed yet |
| `npm run report:items` | gain per item vs its price (STRONG / WEAK), never-bought items | normal ~4 min (single core) |
| `npm run report:recipes` | which chains get made, does one recipe dominate | single core, not timed yet |
| `npm run report:synergy` | matchups, path against path, interlocking | single core, not timed yet |
| `npm run report:runs`, `report:placement` | run length, gold/backpack growth; what layout is worth | |
| `npm run report:selftest` | is the measuring tool itself reliable (see below) | normal ~1.5 min |
| `npm run ratings` | measures every item again, writes `data/sim/ratings.json` | normal ~4 min (single core) |
| `npm run report:all` | everything into `out/reports/` | ~15 min: run in background |

Flags: `--quick | --precise`, `--seed S`, `--sims N`, `--out file`, `--jobs N` (paths/selftest use all cores
by default; the result does not depend on it), `--baseline file.json` (paths). Every run writes
`out/reports/<id>.html` + `.json`; `out/reports/index.html` lists every target that is OFF.

Targets are data: `data/sim/targets.json`. The paths targets (agreed 2026-11-16): hero overall 48–52 %,
every path 46–54 %, rounds 9–12 44–56 %, every path ≥ +2 pts over the hero's open bot, best-to-weakest path
≤ 6 pts. Path profile: main mechanic ≥ 40 % of the damage, every two paths of a hero differ ≥ 0.35 (1 − cosine
of the damage mix), path items ≥ 50 % of the build. Free picks (wide on purpose): gain 0.6–1.6 × median (hero
items 0.7–1.4), best or worst in its offer ≤ 55 % (hero items ≤ 65 %), no general artifact below 0.4 × median
for any hero, ≤ 10 % of offers without a good option. Older targets: fights 18–25 s, Supernova reached 5–20 %, hero 45–55 % per third, duel 35–65 %,
recipe lift ≤ 12 pts, no recipe in > 60 % of a hero's runs.

## How exact is a number?

- **±N** in report:paths is one standard error from blocks of lobbies. Fights of one bot (and bots of one
  lobby) are not independent; an error over single fights looks 2–3× too small. Other reports still print the
  error over single fights (`share()` in common.ts): read their ± as at least doubled.
- Rule of thumb for **one path**: ±2 points at precise, ±4 at normal. One hero overall: about half that.
  Open bots are the noisiest rows (one bot per lobby).
- **A gap smaller than 2× its ± can be chance.** Do not tune on it.
- **Two independent runs** (different seeds): their difference has error √(se₁² + se₂²).
- **Paired before/after** is far more exact (~±1 point at precise): same seed and lobby count, compare with
  `--baseline`. Both runs play the same lobbies, so only your change differs. Use this for every tuning step.
- A run that differs from another person's run with the same command and seed is **not noise**: the simulation
  is deterministic. Compare game data, branch and `data/sim/ratings.json` first.
- `report:selftest` must stay all OK: same lobby same result on 1 or many cores; two seeds differ by about
  their ± (rms z 0.6–1.5); a path made 25 % stronger is found (≥ 3 standard errors). Run it after changing the
  simulation, the bots or the reports.

## What the bots can and cannot tell us

- Bots buy by price, synergies, recipes, path liking (1.5× for items on their path) and the measured
  **ratings**. Stale ratings mean bots shop by old values: re-measure after item changes (`npm run ratings`,
  then compare). Two rating runs agree with correlation ~0.84; averaging two seeds is better than one.
- Bots merge like players (inputs side by side, merge after the fight, no lock) and do not plan like players.
  Real players combine more deliberately: strong paths are likely **stronger** in real play.
- The **open bot** takes the best item of any path. A path below it gives no reason to follow it; that is a
  design signal, not a number problem.
- Win shares are **relative**: making several heroes stronger at once cancels out. Change one thing per step.

## Procedure: a tuning pass

1. **State the question** and the target it is about (targets.json). If a needed target is missing, propose it
   and get the designer's OK before tuning to it.
2. **Fresh basis:** after item changes `npm run ratings`; then a precise baseline:
   `npm run report:paths -- --precise --out out/base/paths.txt` (and the other reports the question touches).
3. **Diagnose before changing.** Which items do the bots of that hero/path actually end with? Damage mix,
   healed+shielded, fight length, rounds 1–4 / 5–8 / 9–12. Find the cause, not just the symptom.
4. **Change little, then measure paired:** `npm run report:paths -- --precise --baseline out/base/paths.json
   --out out/t1/paths.txt`. Keep a change only if it moved what it should (`*` in "change vs baseline") and did
   not push the hero or another hero out of its band. Revert changes with no effect.
5. **Confirm** the final state on a second seed (`--seed 2`), since one seed can hide a quirk.
6. **Checks:** `npm run validate && npm run typecheck && npm test`, `npm run catalog`; write `docs/findings.md`;
   open a PR with before/after numbers; ask before merging.

## Procedure: a new hero (or a hero redesign)

1. Concept first (with the designer): theme, own rule, three **paths** with `focus` that picks **different**
   items (see lessons: overlapping focus makes paths indistinguishable), start items, artifacts.
2. Items via the item-design skill: hero shop pool, path items, recipes; picture briefs, German texts.
3. `npm run validate`, then `npm run ratings` (new items have no rating yet: bots value them by price only).
4. Measure: `report:heroes` (all thirds of the run, all matchups), `report:paths --precise`, `report:recipes`,
   `report:battles` (fight length, Supernova), `report:selftest` once.
5. Tune the **new hero's items** first; touch other heroes only when a matchup is broken. Other heroes' win
   shares move whenever a hero is added (shares are relative): re-check all four bands.
6. Tune with the paired procedure above; record in `docs/findings.md`.

## Lessons learned (keep adding)

- 2026-11-16: an old local checkout gave Ysel 55–57 % per path; main gave 49–53 %. Check the state before acting.
- 2026-11-16: the ± over single fights understated the noise 2–3×; same report, other seed moved a path by 5
  points. Fixed for report:paths (lobby blocks); other reports still use the old ± (read it doubled).
- 2026-11-16: Gravity Well Strip 14 → 10 changed **no fight at all**: enemies rarely hold more than ~10 buff
  stacks, so Strip above that is wasted. Saturating numbers can only be found with a paired run.
- 2026-11-16: paths of one hero share most of their hero items (focus by tag: "heal", "weapon", "pet" match
  almost everything). Boosting Venn's Hungry jungle items raised Poison garden more than Jungle. Number changes
  move the whole hero, not one path against the open bot. Paths need items that only pay off for a committed
  build (proposal: hero item after round 4 as path anchor, PR #16).
- 2026-11-16: Banquet Trough +1 Power per use lifted all of Quill by 4 points (every Quill bot buys it).
  Cheap, widely bought items are strong levers; buff them in small steps.
- 2026-11-15: always measure two seeds before deciding; Rook swung by 5 points between seeds at normal.
- 2026-11-15: after item size changes run `npm run play:ghosts` (stored opponent builds of the playground).
- 2026-11-15: hero curves matter: a hero can be even overall but weak early and strong late (check thirds).

## Still open (2026-11-16)

Rook Workshop too strong late (61 %, likely the hero's own crafted speed rule: needs the designer's OK),
Venn Hungry jungle and Quill Well-fed pack weak late (39–40 %), most paths below their open bot. Waiting for
the path concept; core numbers frozen until then or until a playtest.
