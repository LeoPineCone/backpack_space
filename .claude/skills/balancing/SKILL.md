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
| `npm run baseline` | the reference: 240 lobbies on each of two seeds, stored with every build and fight (`out/baseline/main/`); all fight-level targets with ✓/✗ | ~4 min |
| `npm run balance:replay -- --patch p.json` | what a number change does to every fight-level target, paired on the baseline's lobbies; `--full` plays the lobbies again | 5–20 s; `--full` ~4 min |
| `npm run balance:sense -- --knobs hero:venn` | which number moves which target by how much (one step each); dead numbers, strong levers, side effects | ~1 s per knob |
| `npm run balance:propose -- --knobs hero:venn` | proposes the fewest, smallest number changes that bring the targets into their bands; writes a patch, changes nothing | 3–10 min |
| `npm run balance:sweep -- --knob rule:shop.heroOfferPct --values 20,40,50` | one number at several values, every value a full run on the baseline's lobbies (bots shop again): how much of a build is on its path, variety between runs, path against open bot, hero and path win shares, as tables and curves. Knobs: `rule:<path>`, `item:<id>:<path>`, `hero:<id>:<path>`, `bot:pathLiking` | ~3 min per value |
| `npm run report:paths` | win share per hero and per path, vs the hero's open bot; targets marked ✓/✗ | quick 10 s, normal 30 s, precise ~1.5 min |
| `npm run report:strength` | item outliers by three views (add one, remove one, regression); needs the baseline, no bot shops | ~1 min |
| `npm run report:meta` | path against path (12 × 12), hero against hero, rock-paper-scissors share, meta share per hero (target) and path; needs the baseline | ~45 s |
| `npm run report:picks` | free picks after rounds 4 and 8: gain per item and hero, choice test (best/worst in its offer), offers with no good option; `--careful`: bots search their layout much longer | normal ~1 min, `--careful` ~2 min |
| `npm run report:heroes` | hero win share per third of the run, hero against hero | single core, not timed yet |
| `npm run report:battles` | fight length, Supernova share, damage sources | single core, not timed yet |
| `npm run report:items` | gain per item vs its price (STRONG / WEAK), never-bought items | normal ~1.5 min |
| `npm run report:recipes` | which chains get made, does one recipe dominate | single core, not timed yet |
| `npm run report:synergy` | matchups, path against path, interlocking | single core, not timed yet |
| `npm run report:runs`, `report:placement` | run length, gold/backpack growth; what layout is worth | |
| `npm run report:selftest` | is the measuring tool itself reliable (see below) | normal ~1.5 min |
| `npm run ratings` | measures every item again, writes `data/sim/ratings.json` (+ `ratings-meta.json`: how it was measured) | normal ~1.5 min |
| `npm run ratings -- --only a,b` | measures only these items again, exactly like the stored run; all other ratings stay as they are | seconds |
| `npm run report:all` | everything into `out/reports/` | ~15 min: run in background |

Flags: `--quick | --precise`, `--seed S`, `--sims N`, `--out file`, `--jobs N` (paths, selftest, baseline, items
use all cores by default; the result does not depend on it), `--baseline file.json` (paths). Every run writes
`out/reports/<id>.html` + `.json`; `out/reports/index.html` lists every target that is OFF.

Targets are data: `data/sim/targets.json`. The paths targets (agreed 2026-11-16): hero overall 48–52 %,
every path 46–54 %, rounds 9–12 44–56 %, every path ≥ +2 pts over the hero's open bot, best-to-weakest path
≤ 6 pts. Path profile: main mechanic ≥ 40 % of the damage, every two paths of a hero differ ≥ 0.35 (1 − cosine
of the damage mix), path items ≥ 50 % of the build. Free picks (wide on purpose): gain 0.6–1.6 × median (hero
items 0.7–1.4), best or worst in its offer ≤ 55 % (hero items ≤ 65 %), no general artifact below 0.4 × median
for any hero, ≤ 10 % of offers without a good option. Older targets: fights 18–25 s, Supernova reached 5–20 %, hero 45–55 % per third, duel 35–65 %,
recipe lift ≤ 12 pts, no recipe in > 60 % of a hero's runs. Meta share (agreed 2026-11-16): every hero 10–45 % of
a settled meta (fair 25 %); wide on purpose, it only catches blunders. Per path it is information.

## The fast loop: baseline, replay, proposal

**What makes it work (measured 2026-11-16):** bots choose items by price, rating, tags, recipes and Energy
bookkeeping. They never read damage or effect numbers. So after a change to such a number the bots would play the
same builds; only the fights differ. `balance:replay` therefore keeps the baseline's builds and pairings and only
fights again (same dice) the fights that involve a patched item. For damage, effect numbers, caps, chances and
bonuses that is **exactly** the result of a full paired run, in seconds instead of minutes (checked: four path
boosts of 25 %, replay and full run equal within noise). A fight costs 0.5 ms; shopping is 93 % of a lobby.

- **Patch file** (never edit `data/` to try something):
  `{ "name": "…", "changes": [ { "item": "venus_mantrap", "set": { "cooldown": 2.0, "damage": [7, 9], "effects.0.n": 3 } } ] }`.
  Also `{ "hero": "rook", "set": {…} }` and `{ "rules": true, "set": { "energy.regen": 12.5 } }`. Keys are paths into
  the JSON object; the patched data goes through the same schema as the real data.
- **Numbers the bots do read:** `cooldown` and Energy (layout and Energy bookkeeping), price, tags, shop weight,
  recipes, everything in `rules.shop`, gold, hero start. With those the bots drift to other builds. The replay
  runs a self-check (plays 8 lobbies again with the patch) and says "exact", "estimate, confirm with --full" or
  "use --full". Measured for a cooldown change: every bot of the hero ends with a slightly different build, but
  replay and full run still agree within noise (+1.4 vs +2.0 ±0.5).
- **`balance:sense`** before tuning: one line per number. "dead" = no fight changed its winner (saturated or
  irrelevant: do not tune it). Small whole numbers move in big steps (1 → 2 is +100 %); cooldown, percent values
  and Energy (halves allowed) are the fine levers.
- **`balance:propose`** searches on seed 1 and reports the same patch on seed 2, which it never saw. **Trust only
  what both seeds show.** A gain on seed 1 that is missing on seed 2 is the search fitting that panel's quirks
  (seen: Hungry jungle late +5.5 on seed 1, +0.6 on seed 2). Defaults: at most 4 numbers, at most 3 steps each,
  targets counted: hero, third, path, late, spread, duel, secs, nova (`--kinds`). "vs open bot" is left out on
  purpose: numbers cannot fix it (see lessons); add `--kinds …,open` only to show that.
  "Still off with these knobs" is a design signal, not a reason to raise `--max-knobs` until it disappears.
- Hero rules are only knobs with `herorule:<id>` **and** `--allow-hero-rules`, i.e. with the designer's OK.
- The baseline is stale as soon as `data/` or the ratings change (`npm run baseline -- --check`); the tools warn.
- The second-order effect ("a stronger item is bought more often") only appears after the ratings of the changed
  items are measured again and the lobbies are played again: `npm run ratings -- --only <ids>`, then
  `npm run baseline` (or `balance:replay --full --ratings <file>` to try it first).

## Items and matchups from the baseline

- **`report:strength`** puts three views of an item side by side. *Add one* (the rating: a typical build gets a
  free copy) misses items that need a committed build. *Remove one* (builds that own it fight again without it)
  says what it is worth where it is used, and nothing about items no bot uses. *Regression* (logistic model over
  all baseline fights) shows what goes together with winning; it repeats well between seeds (r = 0.95) but is
  observational. Remove-one and regression are judged against the item's class (start item, rarity, crafted
  step, hero or general): z beyond ±2 is unusual. **STRONG / WEAK = two views agree.** "needs its build" = weak as
  a free extra, strong where used: fine by design, do not buff it. Weak items seldom show as WEAK, because bots do
  not buy them: look at "rarely owned" and at `report:items`.
- **`report:meta`**: the 12 × 12 table has ±2 points per cell at normal. Meta share = how often a path would be
  played once players adapt (smoothed equilibrium: one point of win share more against the mix = chosen about
  22 % more often). Between two seeds a hero's share moves by about ±4 points, a path's by more: read paths as
  "played / hardly played", not as numbers. The recipe "lift" in report:recipes is confounded (a holder is a bot
  whose shop went well); prefer remove-one for "is this recipe result too strong".
- **`report:picks --careful`** lets every bot search its layout much longer after the pick. An artifact that gains
  clearly there is laid out badly by the normal bots; one that stays weak is weak.

## How exact is a number?

- **±N** in report:paths is one standard error from blocks of lobbies. Fights of one bot (and bots of one
  lobby) are not independent; an error over single fights looks 2–3× too small. Other reports still print the
  error over single fights (`share()` in common.ts): read their ± as at least doubled.
- Rule of thumb for **one path**: ±2 points at precise, ±4 at normal. One hero overall: about half that.
  Open bots are the noisiest rows (one bot per lobby).
- **A gap smaller than 2× its ± can be chance.** Do not tune on it.
- **Two independent runs** (different seeds): their difference has error √(se₁² + se₂²).
- **Paired before/after** is far more exact (~±1 point at precise): same seed and lobby count, compare with
  `--baseline`. Both runs play the same lobbies, so only your change differs. `balance:replay` is the same
  comparison on the stored baseline (±0.3–1 point for a hero or path, printed per row).
- The **absolute** value keeps its ±1–2 points however exact the change is: a hero at 48 % ±2 that a patch lifts
  by +1.0 ±0.3 is "about 49", not "safely inside 48–52". Do not tune values that sit inside the noise of a band edge.
- A run that differs from another person's run with the same command and seed is **not noise**: the simulation
  is deterministic. Compare game data, branch and `data/sim/ratings.json` first.
- `report:selftest` must stay all OK: same lobby same result on 1 or many cores; two seeds differ by about
  their ± (rms z 0.6–1.5); a path made 25 % stronger is found (≥ 3 standard errors). Run it after changing the
  simulation, the bots or the reports.

## What the bots can and cannot tell us

- Bots buy by price, synergies, recipes, path liking (2× for items on their path) and the measured
  **ratings**. Stale ratings mean bots shop by old values: after item changes re-measure **the changed items**
  (`npm run ratings -- --only a,b`: same builds and dice as the stored run, so only those ratings move).
  A full `npm run ratings` gives every item a new sample: two full runs agree only with correlation ~0.84 and a
  hero can move by up to ±5 points from that alone. Do a full run rarely (new hero, many new items, a new
  mechanic), with `--seeds 1,2`, and take a new baseline right after it.
- Bots merge like players (inputs side by side, merge after the fight, no lock) and do not plan like players.
  Real players combine more deliberately: strong paths are likely **stronger** in real play.
- The **open bot** takes the best item of any path. A path below it gives no reason to follow it; that is a
  design signal, not a number problem.
- Win shares are **relative**: making several heroes stronger at once cancels out. Change one thing per step.

## Procedure: a tuning pass

1. **State the question** and the target it is about (targets.json). If a needed target is missing, propose it
   and get the designer's OK before tuning to it.
2. **Fresh basis:** `npm run baseline -- --check`; if stale, `npm run baseline` (after item changes first
   `npm run ratings -- --only <changed ids>`). Read which targets are off on **both** seeds.
3. **Diagnose before changing.** `npm run balance:sense -- --knobs hero:<id>` (or `path:<hero>/<path>`,
   `item:a,b`): which numbers are levers, which are dead, what else moves. For the cause behind a number: which
   items do the bots of that hero/path end with, damage mix, healed+shielded, fight length, thirds of the run.
4. **Let the solver propose, or write the patch yourself:** `npm run balance:propose -- --knobs … --out-name x`
   or a hand-written patch with `npm run balance:replay -- --patch x.json`. Keep a change only if both seeds show
   it (`*`) and no hero or path leaves its band. Prefer few changes with a reason over many small ones.
5. **Confirm with bots that shop again:** `npm run balance:replay -- --patch out/proposals/x.json --full`
   (always when the self-check does not say "exact").
6. **Designer's OK**, then put the numbers into `data/` by hand (item files keep their one-item-per-line
   format), `npm run ratings -- --only <ids>`, `npm run baseline`, and compare with the proposal.
7. **Checks:** `npm run validate && npm run typecheck && npm test`, `npm run catalog`; write `docs/findings.md`;
   open a PR with before/after numbers; ask before merging.

## Procedure: new or changed items

1. Design with the item-design skill; `npm run validate`.
2. `npm run ratings -- --only <new ids>` so the bots value them, then `npm run baseline` (bots must own an item
   before it can be replayed; "not owned" in `balance:sense` means the bots never take it: check price and rating).
3. `npm run report:items -- --only <ids>`: inside the band of its rarity? `npm run balance:sense -- --knobs item:<ids>`.
4. If a hero or path leaves its band: `balance:propose --knobs item:<ids>` (the new items' own numbers first).
5. Confirm with `--full`, designer's OK, findings, PR.

## Procedure: a new hero (or a hero redesign)

1. Concept first (with the designer): theme, own rule, three **paths** with `focus` that picks **different**
   items (see lessons: overlapping focus makes paths indistinguishable), start items, artifacts.
2. Items via the item-design skill: hero shop pool, path items, recipes; picture briefs, German texts.
3. `npm run validate`, then a full `npm run ratings -- --seeds 1,2` (a new hero changes every lobby), then
   `npm run baseline`. Win shares are relative: all old heroes shift. Judge the old heroes by their duels among
   each other, which should not have moved much.
4. Coarse: `balance:propose --knobs hero:<new>` until the hero is at 48–52 % overall and 45–55 % per third.
   Hero rule values only with `herorule:<new> --allow-hero-rules` and the designer's OK.
5. Fine: paths (`--kinds path,late,spread`), `report:picks` for its hero items, `report:recipes`,
   `report:battles`, `report:selftest` once.
6. Touch other heroes only when a duel is outside 35–65 %. Confirm with `--full`, findings, PR.

## Procedure: a new mechanic (a new status, a rule like Energy)

1. Schema + battle change with tests. The bots must understand it (as the Energy bookkeeping in `bot.ts`),
   otherwise every number measures a bot blind spot.
2. Its global numbers are rules: bots usually read them, so measure with full runs. Try 4–6 values of one rule
   with `npm run balance:sweep -- --knob rule:<path> --values …` (paths and heroes per value); for fight length
   and Supernova at the chosen value use a patch with `balance:replay --full`. Choose a region with the designer.
3. Full `npm run ratings -- --seeds 1,2`, `npm run baseline`, then the item procedure for the items that use it.

## Lessons learned (keep adding)

- 2026-11-16: path pull, three sweeps (findings.md). The shop lean (`shop.anchorPathWeight` 1–4) moves almost
  nothing. `shop.heroOfferPct` is a hero-balance lever, not a path lever (Quill 44 → 61 % from 20 to 50). The
  bots' path liking decides how much of a build is on the path (29 → 60 %), and more liking loses against the
  open bot: paths lack payoff, not pull. Path win shares depend on the liking (a guess about players), so read a
  weak path as "weak when a bot forces it", and check `balance:sweep -- --knob bot:pathLiking` before tuning one.

- 2026-11-16: Dyson Fragment and Wormhole Generator stay weak with careful placement (+0.7 / +1.7 points normal,
  −0.8 / +2.4 careful; median artifact +8.5). The earlier guess "bots only place the far stars badly" does not
  hold for the arranger's search; they are weak for the builds bots make. (The arranger's score may still not
  value far stars: that is a bot change, not a number change.)
- 2026-11-16: with three times the moments, hero items measure to ±3–5 points and all twelve are inside their
  targets (0.75–1.32 × median); the earlier outliers were noise from 24 moments.

- 2026-11-16: bots do not read damage or effect numbers, so a replay of stored builds equals a full paired run
  for them. They do read cooldown and Energy (layout, bookkeeping): one cooldown step made all 32 bots of the hero
  end with other builds in 8 lobbies, without taking the item more or less often. Drift is not a systematic shift.
- 2026-11-16: dice hardly matter: the same two builds with other dice give the same winner almost always
  (p·(1−p) = 0.03). Noise is which builds exist. More lobbies help, more fights per pair do not.
- 2026-11-16: the proposal search can fit one seed (a late-round gain of +5.5 was +0.6 on the check seed).
  Only effects that both seeds show are real.

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

Rook Workshop too strong (60 %, late 63–70 %, likely the hero's own crafted speed rule: needs the designer's OK),
Venn Hungry jungle, Quill Well-fed pack and Ysel Late ascension weak, most paths below their open bot, no hero
reaches the path distinctness target. The ratings have not been measured with the new per-item dice yet: the
first `npm run ratings -- --seeds 1,2` writes `data/sim/ratings-meta.json` and will shift the heroes once.
Meta: Rook 36 % (Workshop alone 28 %), Quill 14 %; Hungry jungle, Well-fed pack and Late ascension are hardly
played. General artifacts Dyson Fragment, Wormhole Generator (and Ancient Monolith) are weak.
Path pull (sweeps done): the shop numbers are not the lever; the weak paths need payoff from their own items.
Not built yet (see `docs/proposals/balancing-workflow.md`): search for numbers the bots read, and the first
real pass.
