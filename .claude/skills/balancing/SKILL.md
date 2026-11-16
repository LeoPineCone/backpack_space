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
| `npm run balance:sweep -- --knob rule:shop.heroOfferPct --values 20,40,50` | one number at several values, every value a full run on the baseline's lobbies (bots shop again): how much of a build is on its path, variety between runs, path against open bot, hero and path win shares, as tables and curves. Knobs: `rule:<path>`, `item:<id>:<path>`, `hero:<id>:<path>`, `bot:pathLiking`, `bot:pathStrict` | ~3 min per value |
| `npm run report:paths` | win share per hero and per path, vs the hero's open bot; targets marked ✓/✗ | quick 10 s, normal 30 s, precise ~1.5 min |
| `npm run report:strength` | item outliers by three views (add one, remove one, regression); needs the baseline, no bot shops | ~1 min |
| `npm run report:meta` | path against path (12 × 12), hero against hero, rock-paper-scissors share, meta share per hero (target) and path; needs the baseline | ~45 s |
| `npm run report:picks` | free picks after rounds 2 and 6: gain per item and hero, choice test (best/worst in its offer), offers with no good option; `--careful`: bots search their layout much longer | normal ~1 min, `--careful` ~2 min |
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

## Playtest by hand: what the numbers cannot see

`npm run playtest` (see README) lets you play a run yourself as text. Use it after a redesign of a hero or path, not for number tuning: one run is an anecdote about balance, but a reliable witness for feel.

- Pick a goal before the run ("Big beasts") and play towards it like a player would; give up the goal only when it costs lives, and note that moment.
- Write a `note` each round on what the shop offered for the goal, which choice was hard, what felt unfair or dead. The report keeps actions, build, fight and notes per round.
- What to look for: rounds in which the goal had nothing to buy, free picks that fit no build, merges nobody wanted, fights that could not be won whatever was bought, room problems of big items.
- Turn a finding into a measurement before changing a number (how often is a beast offered in rounds 1–4, win rate of swarm builds against Spikes), then follow the tuning pass.
- Cost: about 15–20 tool calls per run. Two runs per redesigned hero are enough.

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

- 2026-11-16: pulling paths apart (findings.md). Making path items depend on the path (count swarm pets, need
  Toxin) changed nothing while bots only saw an item's general value. Two bot models were tried: **strict** (other
  paths' hero items at half; splits builds clearly, but lowers every path that lived on borrowed items by 3–9
  points and reads too much into the paths: designer's call, off by default, `bot:pathStrict` in the sweep) and
  **fit** (default: an item that counts or needs a type or status is worth 0.6–1.4× by what the build has). Play
  style depends on the model; report it with the model named. Before a path redesign, list what each path's bots
  end with (item frequency per path): the same top items in all three paths is the finding.
- 2026-11-16: a hero rule can decide a path question. Quill heals on every pet attack, so small fast pets are
  the best buy for every Quill build and Big beasts keeps filling up with them. Check the hero rule against the
  path idea first.

- 2026-11-16: when every hero is at 48–52 % and most paths are in their bands, single number steps stop paying:
  three tries on three paths each lifted the path by 1–3 points and left more targets off than before (34 → 38 /
  39), because many values sit near a band edge. Stop there; count "targets off" only as a rough guide (± about 5
  between two full runs of patches that do little). `pathPays` moves less than its noise (±3) for number steps.

- 2026-11-16: path payoff (findings.md). A path needs a **source** (makes its resource), a **converter** (turns the
  resource into damage or survival, scaling) and a **body** (weapons or pets). Paths made only of sources lose
  more the deeper a bot goes; check `pathPays` ("going deeper pays", ±3 points per seed at normal: read both
  seeds). Before tuning a weak path, look for the trap first: count what its bots build and measure the resource
  (Overclocked guns: 2 of 7 weapons waited for Energy; Shield fortress: 1056 Shield per fight with nothing using
  it). Structural fixes moved those paths by 5–10 points, number steps by 2–5.
- 2026-11-16: a nerf of a hero's cheap everyday item is a hero lever: Plasma Welder 6–8 → 4–6 moved Rook by
  −7.5 points, 5–7 by about −3. Take one step and measure.

- 2026-11-16: proposals per hero with `--kinds …,open` (findings.md, not applied). Merging the proposals of all
  heroes was worse than the baseline (33 → 34 targets off): each search only knows its own hero's knobs and uses
  nerfs of early items that hurt a third of the run. Pick the changes that lift a weak path or lower a strong one,
  drop the rest, and measure the merged patch with `--full` before showing it. Number steps closed a third to a
  half of a path's gap to its open bot, never all of it.

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

- 2026-11-16, first two playtest runs (Quill beasts 9 wins, Quill swarm 5 wins, reports in docs/findings.md): both paths only start at round 5. Before that the goal has little to buy (swarm: counting items like Glow Swarm are weak with 2–3 swarm pets; beasts: few offers, Pack Lizard alone is a tax) and the player falls back on small general pets and feeders. Many small hits are hard-countered by Spikes (1226 Spikes damage in one fight) and by early Shield gain (96 attacks, 3 damage). Not yet measured over many runs.

- 2026-11-16: moving a free pick moves the health curve. The health jump sat right after the hero item; with the
  item two rounds earlier fights in the next two rounds were 5 s shorter. Health is the lever for fight length per
  round (bots do not read it: replay is exact) and it shifts heroes (more health: Rook down, Ysel up). After any
  change to `rules.specials` run `report:picks` too: it reads the rounds from the rules.
- 2026-11-16: `report:picks` was not run after the path payoff and path split passes, and the hero items drifted
  far apart (Herd Heart 2–2.6 × median, three counting anchors at 0.3). Run it after every pass that touches a
  hero item or what it counts.

- 2026-11-16: hero items are compared inside their hero (`report:picks`, "× median of its hero"). An anchor that
  only counts (crafted items, swarm pets, Cryo) is worth a quarter of the others as a pick in round 3: give it a
  flat base effect and let the counting come on top. An anchor that hands out Power per activation is the opposite
  (always taken). Iterate at normal (1 min, ±4–5), confirm at precise (4 min, ±2–3).
- 2026-11-16: a path that lives on its anchor falls with it (Well-fed pack 47 → 38 % when Herd Heart went from 3
  Power to 1). The payoff belongs into the path's shop items. `balance:sense` showed the converters as dead numbers:
  a star trigger reaches one or two items, a backpack trigger (`shipUse`) scales with the build. That one change
  moved the path by +8 and its late rounds by +16, other paths by +1.

## Still open (2026-11-16)
Free picks are after rounds 2 and 6 since 2026-11-16 (health curve 100, 150, 300, 350, then +100). Heroes 49–51 % on
both seeds, all paths in band on seed 1, 36 of 124 targets off. Hero items are equal inside each hero since the pass of 2026-11-16 (Nova Crown slightly weak). Open: late rounds of Overclocked guns, Well-fed pack,
Late ascension (41–47), Eclipse and Thorn wall (55–58).


After the path payoff pass (findings.md, top): all heroes 48–52 %, 11 of 12 paths 46–54 %. Still off: Shield
fortress, Well-fed pack and Late ascension cost when a bot goes deep (`pathPays` −3 to −8); Thorn wall and
Workshop strong late (55–60 %), Late ascension weak late (40 %); Well-fed pack differs between seeds (48 / 43 %);
paths −6 to +2 against their open bot. After the path split of Quill and Venn (fit bots): heroes 47–52 % on both
seeds, all paths in band on seed 1; off: Thorn wall late 57 / 58, Late ascension late 39 / 43, Shield fortress 44 on
seed 2. Play style (`pathStyle`, target ≥ 1 proposed): Quill 0.45–0.9, Venn 0.5–0.9, Shield fortress / Workshop 0.6,
Burning corona / Late ascension 0.65–0.85; with strict bots Venn reaches 0.85–1.3.
General artifacts Dyson
Fragment, Wormhole Generator (and Ancient Monolith) are weak. The path-pull sweep has not been repeated with the
new items.
Path pull (sweeps done): the shop numbers are not the lever; the weak paths need payoff from their own items.
Not built yet (see `docs/proposals/balancing-workflow.md`): search for numbers the bots read, and the first
real pass.
