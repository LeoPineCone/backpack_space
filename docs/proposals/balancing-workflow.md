# Balancing workflow with optimisers (proposal, 2026-11-16)

Status: **concept only, nothing built.** Asked by Ilja: review the measuring tools we have, pick mathematical
methods and optimisers for our different balancing questions, and design a repeatable flow: take a baseline, then
integrate new items, changed items, a new hero or a new mechanic. Balancing need not be perfect. An optimiser only
proposes; changes are adopted after Ilja's OK; hero rules need his OK.

## 1. Short version

1. The tools we have measure well. What is missing is a **fast inner loop** and a **stable basis**; an
   optimiser on top of today's 1.5-minute report would mostly be slow, not smart.
2. Four measurements made for this concept (section 3) change the plan:
   - A fight costs 0.55 ms, a lobby 1.46 s. **93 % of the time is bots shopping, not fighting.**
   - Fights are almost decided by the two builds; the dice hardly matter. Noise comes from *which builds exist*.
   - Bots never look at damage or effect numbers when they shop. They see them only through
     `data/sim/ratings.json`. So for most item numbers **replaying the stored builds gives the same answer as a
     full paired run** (measured: equal within noise, section 3.3), in about 3 s instead of 50–90 s.
   - Re-measuring the ratings is the largest noise source of the whole pipeline (a hero moves up to ±5 points
     per re-measurement, see `docs/findings.md`).
3. Proposal: three layers.
   - **Replay** (seconds): stored builds fight again with patched numbers. Exact pairing, about ±0.3–1 point.
     On it: a **sensitivity table** (which knob moves which target by how much) and a **least-change solver**
     that proposes the smallest set of number changes that brings all targets into their bands.
   - **Full run** (minutes): bots shop again with re-measured ratings; confirms a proposal on two seeds.
     Ratings become incremental and paired, so they stop shaking the basis.
   - **Black-box search** (an hour in the background, rarely): Bayesian optimisation or CMA-ES over 3–8 knobs,
     only for numbers that change what bots buy (prices, Energy, shop odds, path pull), where replay is not valid.
4. Item strength gets three independent views (add one, remove one, regression over all fights); an item is an
   outlier only when two of them agree. Matchups get a meta analysis (Nash mix over the path-against-path table).
5. Bayesian optimisation is therefore **not** the main tool. It is the right tool for a small class of questions;
   for most of them a sensitivity table plus a small solver is faster, explainable and good enough.

## 2. The tools we have

Accuracy as stated in the balancing skill and `docs/findings.md`; times on 4 cores.

| Tool | Question it answers | Reliability | Weakness | Verdict |
|---|---|---|---|---|
| `report:paths` | win share per hero and path, vs the open bot, path profile | good: block errors (±2 precise, ±4 normal per path), paired `--baseline` (±1), all cores | open-bot rows are the noisiest (one bot per lobby); builds depend on ratings | **keep, it is the reference.** Its lobbies become the stored panel |
| `report:selftest` | is the instrument honest | good | covers paths only | keep; extend to replay and ratings |
| `report:picks` | free picks: gain, best/worst in its offer | design is very good (every option on the same dice) | single core; hero items ±6–9 points at normal; far-star artifacts are placed badly by bots, so they read too weak | keep; parallelise, more moments, placement check |
| `report:items` / `npm run ratings` | gain of a free extra copy vs price | medium: two runs agree with r ≈ 0.84 | single core (4 min); out of context (items for committed builds look weak); its noise is fed back into every bot | keep the idea; make it incremental, paired, parallel |
| `report:heroes` | hero per third of the run, hero vs hero | medium: old ± over single fights (read doubled) | single core; own lobbies, not paired with paths | fold into the panel (same numbers from replay) |
| `report:synergy` | matchups, path vs path, what kit and synergies are worth | medium, old ± | slow, single core | matchup part moves to the panel; "kit off" stays |
| `report:battles` | fight length, Supernova share, damage sources | fine (large samples) | old ± | keep; metrics also come from replay |
| `report:recipes` | chains made, recipe lift | made/depth: fine. **Lift: weak** (holder = bot whose shop went well) | confounded | keep made/depth; replace lift by "remove one" (section 5.4) |
| `report:placement`, `report:runs` | layout worth, run length | fine | – | keep as they are |
| `--baseline` | paired before/after | good | paths only; only for changes that do not need new ratings | generalise (replay) |
| `data/sim/targets.json` | targets as data, ✓/✗ in reports | good | no notion of margin (a value at 48.1 % ± 2 is "OK") | keep; add a margin of 2 standard errors for the optimiser |

Known limits that no tool removes: bots are not players (they buy by ratings, do not plan recipes or layouts);
win shares are relative; the open bot takes the best anchor; paths share general items.

## 3. Measurements made for this concept

All on main (112cd0e), seed 1, ratings as checked in, 4 cores.

### 3.1 Where the time goes

| | time |
|---|---|
| one fight (`simulate`) | 0.55 ms |
| compile one build | 0.11 ms |
| one lobby (16 bots, 12 rounds, 192 fights) | 1.46 s, of which fights about 0.1 s |

Shopping and laying out is 93 % of a lobby. Anything that can reuse builds is 10–20× cheaper.

### 3.2 Dice hardly matter

The same two builds fought 20 times with different dice: mean p·(1−p) = 0.03 (a coin would give 0.25). A matchup
is nearly decided by the builds. So more fights per pair buy nothing; **more different builds** do. Tools that
replay "8 fights per build" should use 8 different opponents with one fight each (most already do).

### 3.3 Replay equals the full paired run

120 lobbies. "Full": new paired `report:paths` run with the path's hero items 25 % stronger (the self-test
boost). "Replay": the *stored* builds of the baseline lobbies fight the same pairings again with the boosted
numbers. Change in points of win share (± one standard error from 10 blocks):

| Boost | Row | Full run | Replay |
|---|---|---|---|
| Venn Hungry jungle | jungle / poison / thorns / Venn all | +12.2 ±0.9 / +6.4 / +6.7 / +8.2 ±0.5 | +10.6 ±0.8 / +6.5 / +6.7 / +7.8 ±0.3 |
| Quill Well-fed pack | feeders / beasts / swarm / Quill all | +16.7 ±1.0 / +11.2 / +11.1 / +12.3 | +16.4 ±1.0 / +10.2 / +10.1 / +11.8 |
| Rook Shield fortress | fortress / overclock / workshop / Rook all | +17.0 ±1.3 / +4.9 / +4.7 / +7.9 | +17.7 ±1.3 / +4.9 / +3.8 / +7.8 |
| Ysel Eclipse | eclipse / burn / ascension / Ysel all | +14.6 ±0.8 / +2.8 / +1.7 / +5.9 | +13.2 ±1.1 / +3.6 / +1.7 / +5.8 |

Other heroes' losses agree too (−1.3 to −5.0 in both). Cost: full 49 s on 4 cores; replay 10 s on **one** core.

Why: `worth()` in `packages/core/src/bots/bot.ts` values an item by price × rating, tags, recipes, path and
Energy bookkeeping. Damage and effect numbers are not read. Until the ratings are measured again, a number change
cannot change a single purchase. Consequences:

- For "replay-safe" knobs (damage, effect `n`, `per`/`max`, chance, speed/crit/health mods, hero effects, hero
  health, status and star-clock rules) replay is not an approximation of today's paired run; it **is** that run.
- Knobs the bots do read change the builds: price, tags, shop `weight`, recipes, Energy cost/gain/refill and
  weapon cooldown (through the Energy bookkeeping), everything in `rules.shop`, gold, specials. For those, replay
  is at best a first guess. The tool can check this itself: rebuild a few lobbies with the patch and compare the
  builds; identical builds mean "replay is exact".
- The second-order effect ("a stronger item is bought more") exists only through new ratings. That step must be
  made reliable (section 5.5), because today it is where the ±5 points come from.

### 3.4 Item strength from the fights we already play

Ridge logistic regression over the 23 040 fights of those 120 lobbies: win ~ items of the attacker − items of
the defender + hero × third of the run + gold value. No extra simulation. Split-half reliability of the item
coefficients (odd vs even lobbies): r = 0.80 for items in > 300 fights, 0.86 for > 1000 fights; correlation with
the measured ratings 0.70. So it is about as stable as `npm run ratings`, measures something different (strength
*in the builds where the item is really used*), and is free with every paths run. It is observational: read it
as a flag, never alone.

## 4. Principles

1. **Pair everything.** Same builds, same opponents, same dice before and after (common random numbers). Unpaired
   comparisons are for confirmation only.
2. **Two fidelities.** Search on replay (seconds), confirm on full runs (minutes), on two seeds. Tune on seed 1,
   confirm on seed 2: a solver that sees ±0.3 points can otherwise fit the quirks of one panel.
3. **Bands, not optima.** Targets are ranges. The objective is "distance to the bands" (zero inside, with a
   margin of 2 standard errors), plus a penalty on how much was changed. No tool chases 50.0 %.
4. **Smallest change wins.** Few knobs, small steps, each with a reason. A proposal that needs twelve changes is
   reported as a design signal instead.
5. **Proposals only.** Tools write a proposal file and a before/after report. Nothing in `data/` changes until
   Ilja says so. Hero rules are never in the default knob list.
6. **One snapshot = one truth.** A baseline is game data + ratings + seeds + stored builds + report values. Numbers
   from different snapshots are not compared.
7. **Bot limits are stated, not hidden.** Every proposal lists which of its conclusions depend on bot behaviour
   (purchases, placement) and which are pure fight facts.

## 5. Building blocks

### 5.1 Baseline snapshot (`npm run baseline`)

Runs: ratings check, 240 path lobbies on seed 1 and 240 on seed 2 (about 1.5 min each), stores under
`out/baseline/<name>/`: hash of `data/`, ratings, the **panel** (every seat's build per round and the pairings),
all report values, target status, and the fight table for the regression. Other reports (heroes, battles,
matchups, recipes made) read the panel instead of playing their own lobbies. `npm run baseline -- --check` tells
whether the current data still matches the snapshot.

### 5.2 Replay (`npm run balance:replay -- --patch file.json`)

A patch is a list of `{ file, id, field, value }` (item numbers, hero numbers, rules). Replay compiles the panel
builds with the patched data and fights the stored pairings again with the stored dice. Output: every fight-level
target (hero, path, late, vs open, spread, duels, fight length, Supernova share, damage mix, path profile) as
paired change with ±, target lights before/after. It runs the self-check from 3.3 and says "exact" or "builds
would change: confirm with a full run". Expected: 240 lobbies in 3–5 s on 4 cores.

### 5.3 Sensitivity table and least-change solver (`balance:sense`, `balance:propose`)

- **Sensitivity.** For each knob in a list (default: all numbers of the items of one hero or path, at ±1 allowed
  step), one replay. Result: a table knob × target in points per step. Shows the strong levers (the Banquet
  Trough case), the dead knobs (Gravity Well Strip above 10: effect 0), and side effects on other heroes.
  40 knobs take about 3 minutes. This is one-at-a-time screening (Morris-style); interactions are picked up in
  the verification step.
- **Solver.** Given the targets that are off, choose changes δ that minimise Σ wᵢ·|δᵢ| subject to every target
  staying or getting inside its band (with margin), each knob inside its allowed range and step grid, at most
  k knobs changed (default 4). First guess from the linear table (a small linear programme), then 2–4 rounds of
  checking the candidate on replay and correcting (trust region / pattern search on the real replay function, so
  the linear model only has to point in the right direction). Weights wᵢ prefer fine levers (section 6) and
  items that are flagged as outliers anyway.
- **Output**: `out/proposals/<name>.md` + `.json`: the changes, predicted and replay-verified effect on every
  target, what could not be reached ("infeasible with these knobs" is a design signal: e.g. a path cannot beat
  the open bot by numbers because it shares its items).

### 5.4 Item strength: three views

| View | How | Good at | Blind spot |
|---|---|---|---|
| Add one (today's `report:items`) | free extra copy for a typical build | price check, new items nobody buys yet | out of context |
| Remove one (new) | panel builds that own the item fight again without it | value where it is really used; synergy items; recipe results (replaces "lift") | says nothing about unused items |
| Regression (new, free) | Bradley–Terry-style logistic model over all panel fights | overview, popularity-adjusted ranking, pairs of items (interaction terms for flagged pairs) | observational |

Shown as one table per item on a common scale (points of win share, and an Elo-like number for reading), with
"owned by" share. **Outlier** = two of three views outside the band for its rarity. Large gap between "remove
one" and "add one" = synergy item (fine) or trap item (strong only in a build bots cannot make).

### 5.5 Ratings that do not shake the basis

- **Incremental:** after an item change, re-measure only the changed items and the items linked to them (same
  recipe, stars/filters that match), with the existing `--only`. Everything else keeps its rating.
- **Paired:** re-measure on the same builds, opponents and dice as the stored measurement, so a rating moves only
  when the item changed.
- **Damped and averaged:** new rating = mean of two seeds; step at most half-way from the old one.
- **Parallel** like the paths run (4 min → about 1 min), full re-measurement only for a new baseline.
- Self-test: re-rating unchanged data must leave every hero within ±1 point.

### 5.6 Free picks

Keep the counterfactual design. Add: all cores; **sequential sampling** for hero items (keep adding moments until
the ± of each gain is below 3 points or a cap is reached, instead of a fixed 24); for far-star artifacts a
"careful placement" variant (more arranger moves, pick placed first) to separate "weak item" from "bot places it
badly". Pick gains are replay-safe only for the fights; the rest of the run involves shopping, so tuning picks
uses the solver's knobs but verifies with `report:picks`.

### 5.7 Matchups and meta

From the panel, all builds of round 8 and 12 fight a sample of all others: a 12 × 12 path-against-path table
(plus open bots) with ±, at replay cost. On it:
- duel targets as today (35–65 %);
- **meta share**: the mixed Nash equilibrium of the zero-sum table (fictitious play, a few lines, no library).
  A path with share 0 is dominated: nobody would play it in a meta that has settled. A hero whose share is > 40 %
  dominates. Proposed targets (for Ilja to confirm): every hero 15–35 %, at least 2 paths per hero above 3 %;
- a rock-paper-scissors index (how far the table is from "one order of strength") as a reading aid, no target.

### 5.8 Black-box search for knobs that change the builds

For prices, Energy numbers, shop odds, gold curve, path pull: each evaluation is a full run (patched copy of
`data/`, incremental ratings, 120–240 lobbies, same seeds every time). Two modes:

- **Sweep** (one knob, 5–7 values): a dose–response curve with ± for every target. For design questions; the
  human reads the curve and decides. About 10 minutes.
- **Search** (3–8 knobs, 40–80 evaluations, 1–2 h in the background): Bayesian optimisation with a noisy Gaussian
  process, or CMA-ES when there are more than ~8 knobs or the surface is rough. Objective = squared distance to
  the bands + change penalty; decimals allowed where section 6 says so. Result is again only a proposal,
  confirmed on seed 2.

Bayesian optimisation suits exactly this: few knobs, each evaluation minutes, noisy. It does not suit 40 item
numbers at once; that is the solver's job on replay.

## 6. Decimals: which levers are fine, which are coarse

Ilja allows decimals where they help, not for health, damage or stacks.

| Lever | Today | Proposal |
|---|---|---|
| Cooldown | decimals already (tick 0.1 s) | preferred lever, steps of 0.1 s |
| Percent values (speed, crit, chance, slow) | whole percent | preferred lever, steps of 1 |
| Energy: cost per attack, Energy gained, refill per second | whole numbers 2–7 (one step = 15–50 %) | **allow one decimal** (battle code already computes with fractions; `describe.ts` must print "2.5") |
| Shop `weight` | decimal | availability lever, not strength |
| Damage (min–max) | whole | stays whole; half steps via the range (5–7 → 5–8) |
| Stacks, Shield/heal amounts, health | whole | stay whole; solver rounds and re-checks the rounded value |
| Price | whole gold | stays whole; changes purchases, so full run |

The solver searches continuous values only for the first three rows and otherwise moves on the allowed grid.

## 7. Which method for which question

| Question | Instrument | Method | Fidelity |
|---|---|---|---|
| Hero win share (overall, per third) | panel + replay | sensitivity + least-change solver | replay, confirm full |
| Path strength, path vs open bot, spread | panel + replay | solver on path items; "infeasible" → design | replay, confirm full |
| How strongly a path pulls the build | paths profile (commit, distinctness) | sweep of `shop.anchorPathWeight`, hero-offer share, bots' path liking | full |
| Free picks (artifacts, hero items) | `report:picks` | solver proposes, picks report verifies; sequential sampling | mixed |
| Item outliers | three views (5.4) | regression / Bradley–Terry, remove-one, add-one | replay |
| Matchups | 12 × 12 table | duel bands, Nash meta share | replay |
| Fight length, Supernova | battles metrics from replay | solver on rules knobs (health curve, star clock) | replay |
| Economy, Energy, shop odds | full runs | sweep, then Bayesian optimisation / CMA-ES | full |

## 8. The flows

**A. Baseline** (after a merge that touches `data/`, about 5 min): `npm run baseline`. Read the index: which
targets are off, which items are outliers, meta shares. This is the reference for everything below.

**B. Changed item(s)** (minutes):
1. Patch file with the change. `balance:replay` → paired effect on all targets.
2. If builds would change (price, tags, Energy): incremental ratings + full paired run instead.
3. If a target leaves its band: `balance:propose` with the item's own numbers as knobs.
4. Confirm on seed 2, write `docs/findings.md`, PR with before/after, Ilja's OK.

**C. New item(s)**:
1. Design with the item-design skill (budget formula for the first numbers). `validate`.
2. Add-one test for the new items only (`--only`), incremental ratings so bots buy them.
3. New panel (bots must own the item before it can be replayed), then remove-one and regression views.
4. `balance:propose` with the new items' numbers as knobs, targets: item inside its rarity band, hero and path
   bands unchanged. Confirm on seed 2.

**D. New hero** (an afternoon, mostly waiting):
1. Concept, paths, items as in the balancing skill. First numbers from the budget formula.
2. Ratings for the new pool; baseline with the hero in the lobbies. All shares shift (they are relative): the
   old heroes are judged by their **matchups among each other**, which should not have moved.
3. Coarse: solver with hero-wide knobs of the new hero only (its item numbers; hero rule values only if Ilja
   opened them) until the hero is in 48–52 % overall and per third.
4. Fine: paths (spread, late), picks of the new hero, outliers, matchup table and meta share.
5. Touch old heroes only when a matchup is outside 35–65 %. Confirm on seed 2, findings, PR.

**E. New mechanic** (a new status, a new rule like Energy):
1. Schema + battle change with tests; bots must understand it (bookkeeping like Energy), else every number below
   measures a bot blind spot. Extend the self-test with one check for the mechanic.
2. The 1–3 global numbers of the mechanic: sweep first (curves for fight length, Supernova, hero bands), choose a
   region with Ilja, then a search over them plus the 3–5 most affected item numbers if needed.
3. New baseline, then flow B/C for the items that use it.

**F. Health check** (before a playtest or release): baseline on two fresh seeds, self-tests, list of everything
off, with the bot-dependence note per finding.

## 9. The open design question: how strongly should a path pull?

Numbers cannot answer it, but they can show the trade. Proposed sweep (full fidelity, 5 values each):
`shop.anchorPathWeight` 1–4, hero-offer share 30–50 %, and the bots' path liking (today a constant in `bot.ts`;
would move to data under `data/sim/`). Per value: path commit, distinctness, path vs open bot, hero bands, and a
**variety** number (how different two runs of the same path are; too much pull makes every run the same). Ilja
picks the point on the curve; the targets `pathCommit` / `pathDistinct` are then set to what that point delivers.

## 10. Libraries

| Need | Option | Note |
|---|---|---|
| Replay, sensitivity, remove-one, meta share, regression | **plain TypeScript, no dependency** | small code; ridge logistic regression and fictitious play are ~40 lines each |
| Linear programme for the first solver guess | `javascript-lp-solver` (npm, dev dependency) or own coordinate search | either is fine at this size |
| Bayesian optimisation / CMA-ES | **Optuna** (Python: GP sampler for noisy BO, CMA-ES sampler, ask-and-tell interface) | recommended; mature. Lives in `tools/optimizer/` as an optional dev tool that calls our CLI with a patch and reads JSON. Alternatives: BoTorch/Ax (stronger noisy BO, heavier), Nevergrad, pycma |
| Same in TypeScript | own small CMA-ES | no Python needed, but no good noisy BO exists for JS |
| Bradley–Terry | `choix` (Python) | not needed; our own regression covers it |

Recommendation: stages 1–2 below have no new runtime dependency and no Python. Python + Optuna enters only with
stage 3 and stays outside `packages/core` and the game.

## 11. Limits

- Everything is as good as the bots. Replay removes dice and shop noise, not bot blindness. A second bot variant
  (ratings off; careful placement) as a robustness check: a verdict that flips between bot variants is marked
  "bot-dependent" and left for the playtest.
- Replay judges number changes on yesterday's builds. Large changes (> ~25 %) or anything that changes purchases
  need the full run; the tool says so itself.
- A solver can satisfy all targets and still produce a dull game. Targets for feel (path distinctness, variety,
  fight length) keep it honest, but item concepts stay design work.
- Conflicting targets (a path must be ≥ +2 over an open bot that takes the best anchor) show up as
  "infeasible"; that is a finding for the design, not a failure of the tool.

## 12. Stages (each ends usable; build only after Ilja's OK)

| Stage | Content | Effort |
|---|---|---|
| 1 | Baseline snapshot with panel, replay with self-check, paired metrics for all fight-level targets, self-test for replay | small–medium |
| 2 | Sensitivity table, least-change solver, proposal files; incremental + paired + parallel ratings | medium |
| 3 | Item strength in three views; matchup table and meta share; picks improvements | medium |
| 4 | Sweep and black-box search (Optuna), path-pull sweep | medium |
| 5 | Update the balancing skill with the new flows; first real pass (paths that are off today, weak artifacts) | small |

## 13. Questions for Ilja

1. Build order as above (replay and solver first, Bayesian search last)?
2. Python + Optuna as an optional tool for stage 4, or TypeScript only?
3. Decimals for Energy cost, Energy gain and refill (one decimal place): OK?
4. Meta-share targets (hero 15–35 %, two live paths per hero): useful as a target or only as information?
