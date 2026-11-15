# Item sizes follow the thing (2026-11-15)

Decision (Ilja): weapons and pets are larger than fruit and snacks; weapons cover 2 cells or more, one cell is rare. Four weapons and seven pets grew to 2 cells, ten foods shrank to 1 (list in `.claude/skills/item-design/SKILL.md` history / PR #14). Item ratings measured again, full reports in `docs/reports/` (normal accuracy, seed 1).

| Heroes overall (Venn, Rook, Quill, Ysel) | seed 1 | seed 2 |
|---|---|---|
| Before the size change | 50 / 44 / 50 / 56 % | – |
| Sizes changed, ratings measured again, hero rules unchanged | 57 / 46 / 44 / 54 % | 57 / 40 / 43 / 57 % |
| With the hero rule changes below | 50 / 49 / 48 / 52 % | 51 / 44 / 49 / 55 % |

Smaller food helped Venn, larger weapons and pets cost Rook and Quill backpack room. Hero rules changed to answer that (all in `data/heroes.json`):

- Venn: organic items 20 % faster (before 25 %).
- Rook: mechanical items 34 % faster (before 26 %).
- Quill: unchanged in the end (see below).

## Pets attack without Energy (decided with Ilja, 2026-11-15)

Weapons need Energy, animals do not: all 45 pets that deal damage have `energy` 0 (`validate` checks it). The Energy discount tried for Quill is gone again and her pets are back at 25 % faster. Ratings measured again.

| Heroes overall (Venn, Rook, Quill, Ysel) | seed 1 | seed 2 |
|---|---|---|
| Pets without Energy | 48 / 46 / 50 / 55 % | 50 / 45 / 50 / 53 % |

Quill's late game recovered (46 % in rounds 9–12, before 39–43 %). Still off: Quill is strong in rounds 5–8 (55–59 %), Rook weak there (41–42 %), Ysel strong late (58–60 %); Venn loses to Ysel 34 % at one stage (target 35 %). Fight length, longest fight and Supernova share are within their targets.

# Melee, ranged and Energy (2026-11-15)

Decision (Ilja): weapons are melee or ranged; Spikes hurt both for now. Every attack costs Energy, which refills at a fixed rate; items can give Energy. Goal: no weapon spam, builds interlock more. Full reports in `docs/reports/` (normal accuracy, seed 1, ratings measured again).

## What changed

- Every weapon has `range` (66 melee, 59 ranged, read from the item and its picture brief) and `energy` (cost per attack, about 1 + 1.5 × cooldown, 2–7). Rules: `energy` max 20, start 20, refill 12 per second. A ready weapon without the Energy waits; a miss costs Energy too.
- New effect parts: `do: energy`, `mod.energyRegen` (hero), `mod.energy` (cost of starred weapons). 29 items give Energy or make weapons cheaper (list in docs/concept.md); Rook, Quill and Venn have some in their own pools, Ysel none (her damage hardly needs Energy).
- Bots count Energy: another weapon is worth less once the weapons need more Energy than comes in, Energy items are worth more then.
- First measurement with refill 5–10: bots kept 7–8 weapons late, those waited 40–85 % of the time, fights ran 28–32 s and Rook and Quill (weapon heroes) fell to 33–37 %. Refill 12 and two data changes brought it back: Rook's and Quill's own weapons cost 1 less (Quill's rare pets excepted), and hero health is lower late, because weapons deal less damage over a fight now. Health per round is now even steps (decided with Ilja): 100, 150, 200, 250, then +100 per round up to 1100 (before 100, 145, 195, 255, 400 … 1220). The shop shows the hero's health for the coming fight (round base plus items) and says the round's base at the start of each round.

## Measured

| | Before (main) | After |
|---|---|---|
| Weapons in a backpack, round 12 | 7.7 | 6.5 |
| Weapon time spent waiting for Energy, round 4 / 8 / 12 | – | 1 / 9 / 14 % (a quarter of the round-12 backpacks wait more than 25 %) |
| Fight length, Supernova share | 19–23 s, 5–20 % | 20–23 s, 11–16 % |
| Heroes overall (Venn, Rook, Quill, Ysel) | 49 / 45 / 51 / 54 % | 50 / 44 / 51 / 56 % |
| Hero against hero, all stages | Ysel beats Venn 61 %, rest 44–57 % | Ysel beats Venn 64 %, Venn beats Rook 58 %, Rook beats Quill 58 %, rest 42–54 % |

Energy hits weapon heroes (Rook with his speed bonuses, Quill's pet herd) and helps heroes that win with Burn and Toxin (Ysel, Venn), as expected: damage that does not cost Energy becomes worth more. Ysel ends slightly above 50 % against each other hero (51–52 % against Rook and Quill is within the noise) and is strong late (64 % in rounds 9–12); Rook stays a little weak (44 %, early game 44 %, as before). Each new rating measurement moves a hero by up to ±5 points, so single numbers are rough.

## Open

- Spikes only against melee (and something against ranged) once the simple start has been played.
- Ysel late and Rook early, if they hold up in playtests. Hero rules unchanged (they need Ilja's okay).
- Recipe report: Dynamo and Banquet Trough (both got Energy) now show as too strong; Energy numbers per item are a first guess.

# Hero synergies and matchups (2026-11-15)

Question from the design: equal win shares matter less than heroes whose rules and items visibly interlock, builds that grow together round by round, and matchups that look like rock-paper-scissors rather than one hero beating everybody. New report `npm run report:synergy` (full output in `docs/reports/synergy.txt`) measures three things: hero against hero (mirror included) at rounds 4, 8 and 12; path against path (12 paths, rounds 8 and 12); and per hero and round how many items are linked, how much the hero's own rules are worth (same fights with the hero rules off) and how much the item-to-item effects are worth (same fights with them off).

## Before

- **Rook beat every hero** (58 % on average, 61 % against Quill, 58 % against Ysel). His Workshop path won 68 % against the other heroes' paths and beat every single one of them.
- **Ysel's own rule did not reach her items.** Power per star phase adds to weapon hits, but none of her items read Power, and her kit was worth only +5 to +6 points from round 8 on (other heroes +19 to +30). Her linked share stayed flat (68 % → 64 %) while the others grew.
- Weak paths: Quill's Well-fed pack 37 %, Venn's Hungry jungle 42 % against other heroes.

## What changed (item values and synergies only)

- **Ysel: Power feeds Burn and Shield.** Ember Censer adds Burn per 2 Power, Sacred Flame's phase Burn is 2 + 1 per Power, Hymn Scroll and Litany give Shield per Power (flat part lowered). The hymn now runs through the build: Power → Burn → Solar Dagger and Twin Suns, or Power → Shield in the Eclipse path.
- **Venn: mantraps feed on poisoned prey.** Venus Mantrap, Giant Mantrap and Jungle Tyrant heal less flat and more per Toxin on the enemy, which ties Hungry jungle to the Toxin core.
- **Quill: a fed herd hits harder.** Banquet Trough gains Power on use, Kibble Sack with a 40 % chance; Power adds to every pet hit.
- **Rook: Workshop toned down.** Assembly Core +2 damage / +20 % speed to crafted stars (was +3 / +30 %), Master Blueprint +15 % / +1 (was +20 % / +2).
- **Rook: merging the start no longer makes him weaker.** Plasma Welder (Welding Arm + Scrap Metal) had 3–5 damage, less than the Welding Arm alone (5–7, raised in the third pass), and lost Scrap Metal's Shield. Now 6–8. Rook in rounds 1–4: 38 % → 47 %.

## After

| | Before | After |
|---|---|---|
| Dominance | Rook beats all three (55–61 %) | Rook still ahead of all three, but narrowly against Venn (53 %, 60 % against Quill, 57 % against Ysel) |
| Other matchups | – | Quill beats Ysel 56 %, Ysel beats Venn 56 %, the rest 47–51 % |
| Hero average against the others | Venn 47, Rook 58, Quill 48, Ysel 46 % | Venn 46, Rook 57, Quill 50, Ysel 49 % |
| Paths against other heroes | 37–68 % | 41–60 % (Workshop 60, Poison garden and Hungry jungle 41) |
| Linked items, round 2 → 12 | Venn 40→74, Rook 46→81, Quill 61→73, Ysel 68→64 % | Venn 44→80, Rook 48→85, Quill 64→81, Ysel 72→75 % |
| Synergy worth, round 12 | Venn +18, Rook +25, Quill +33, Ysel +21 | Venn +23, Rook +27, Quill +23, Ysel +23 |

Every hero's build now grows together over the run, and the item-to-item effects are worth 23–27 points at the end for all four. Lobby win shares (report:heroes): Venn 46, Rook 49, Quill 54, Ysel 49 % overall. Without the Plasma Welder fix nobody beat all others (Rook 50/58/53 %); the fix brings Rook's early game up and tips him slightly ahead again, which the design accepts (a hero may be a bit stronger).

## Still open (needs a design decision)

- **Ysel's own rule stays small late:** kit worth +14 early, +5 from round 8 on. Variants of the rule, measured (not applied, a hero rule change needs a decision):

  | Ysel's rule | Ysel overall | kit worth round 2 → 12 | against Venn / Rook / Quill |
  |---|---|---|---|
  | now: 1 Power per phase | 49 % | +14 → +5 | 56 / 44 / 47 % |
  | + 1 Power at fight start | 54 % (49 % on seed 2) | +24 → +9 | 62 / 49 / 51 % |
  | + 2 Power at fight start | 59 % | +30 → +11 | 67 / 53 / 55 % |
  | 2 Power per phase | 58 % | +28 → +10 | 66 / 52 / 54 % |
  | + Power per 2–3 accessories | 62–68 % | +30–40 → +15–17 | 73–81 / 56–61 / 58–62 % |
  | + 2 Power when Collapse begins (and +1 at Red Giant) | 49–51 % | +16–18 → +5–6 | no change |

  **Decided with Ilja (2026-11-15): +1 Power at fight start**, now in `data/heroes.json`. Measured with it: Ysel 54 % in lobby fights (55 / 49 / 58 % by third), kit worth +24 → +9; against Venn / Rook / Quill 62 / 49 / 51 %. Rook no longer beats Ysel but is still at or above 52 % against everyone; Venn is now the weakest (44 %) with 37 % against Ysel.

  Power is flat damage on every weapon hit, so any extra Power lifts the early game most; Power late in the fight changes nothing because most fights end before Collapse (24 s). The only variant near the target is +1 Power at fight start, and even that mostly helps early.
- Rook mirror fights land at 45–46 % for the attacker, the other mirrors at 49–51 %: Rook's Shield-on-hit start may favour the defender slightly.

## Venn (after Ysel's change)

With Ysel's start Power, Venn was the weakest hero: 44 % in lobby fights, 39 % in rounds 5–8, Thorn wall 41 %, 37 % against Ysel. Changed (items only):

- **Poisoned thorns:** Thornvine (25 %), Living Armor and Ironbark Golem (30 %) and Briar Fortress (40 %) inflict 1 Toxin when Venn is hit. Thorn wall now feeds the same Toxin as the rest of the garden, and the Toxin readers (Carnivorous Orchid, Hydra Bloom, the mantraps) profit from it.
- **Faster meals:** Moon Melon cooldown 3.5 → 2.8 s, Nectar Flask 4.5 → 3.8 s, so Venn's own rule (every meal spreads Toxin) fires more often.

Result: Venn 49 % in lobby fights (52 / 47 / 49 % by third), all three paths carry (Poison garden 48, Thorn wall 49, Hungry jungle 46 %). No hero beats all others any more: Venn 49 % against Rook, 55 % against Quill. Venn against Ysel stays at 39 %: Ysel's phase cleansing (Hymn Scroll, Litany, Comet Rosary) removes Toxin, a counter that fits the rock-paper-scissors picture and is inside the duel target (35–65 %).

# Findings of the third balance pass (2026-11-15)

Measured with `npm run report:all` at normal accuracy; full reports in `docs/reports/`. Goals of this pass: bots merge by the player's rules, set and measure the star clock, and check that no hero and no recipe chain dominates. Targets are now data (`data/sim/targets.json`) and the reports print an OK / OFF line per target.

## What changed

- **Bots merge like players.** Before, a bot combined the moment it owned all inputs, one fight earlier than a player can. Now it lays the inputs of every recipe it owns next to each other (part of the layout score), fights with the separate items and merges after the fight (`botMerge`). It never locks. 1.9 times per run an owned recipe does not fit together before the fight (mostly 3-input recipes).
- **Rook lost the most from that:** his start (Welding Arm + Scrap Metal) now fights round 1 unmerged; he won 7 % of round 1 and 38 % overall. Re-tuned: Welding Arm cooldown 2.0 → 1.6, damage 4–5 → 5–7, Shield per hit 1 → 3; his speed bonus for crafted items 18 → 25 %, for mechanical items 20 → 26 %; gold per merge 2 → 3.
- **Recipe results that won far more often than the same hero without them** were weakened: Arc Forge (cooldown 1.2 → 1.4), Plague Blossom (Toxin 4 → 3), Storm Driver (damage 16–20 → 14–17), Gravity Well (strip 24 → 18, Shield 10 → 8), Ghost Shroud (Jam 7/3 → 5/2), Total Eclipse (Jam 4 → 3, Shield 17 → 11), Living Armor (Shield 50 → 40, Regen 3 → 2).
- **Reports:** `report:battles` shows in which star phase fights end and how long the Supernova lasts, per hero too; `report:recipes` has a new section "Does a recipe dominate?".

## Where the draft stands

| Question | Target | Result |
|---|---|---|
| Fight length | 18–25 s average, longest ≤ 45 s | 19–23 s, longest 40–45 s. OK |
| Where fights end | – | Calm 1 %, Flare 30–38 %, Red Giant 34–43 %, Collapse 14–17 %, Supernova 5–20 % |
| Supernova reached | 5–20 % of the fights | 17–20 % in rounds 1–4, 5–10 % later. At the edge |
| Supernova length | 9 in 10 over within 10 s | 5–10 s, average 3–6 s. OK |
| Heroes overall | 45–55 % | Flora 52, Rook 51, Quill 51, Ysel 44 |
| Heroes per third of the run | 45–55 % | OFF: Flora strong early (61 %), Quill strong in rounds 5–8 (60 %), Ysel weak in rounds 5–8 (39 %), Rook strong late (59 %) |
| Hero against hero | 35–65 % | 39–64 %. OK |
| Paths | several per hero | Flora 3 of 3 carry, Rook 2, Quill 2, Ysel 3 |
| Crafting | – | 10.2 merges per run; never combining wins 46 % against 54 % |
| Runs | – | 11 % survive all 12 rounds, 7.6 rounds on average |

## Does a recipe chain dominate?

No single chain. The most made results (not counting the start item upgrades, which every run of a hero is meant to make) are Plague Blossom (Flora, 58–65 %), Arc Forge (Rook, 57 %), Canticle (Ysel) and Guard Hound (Quill, about 50 %). After weakening, Plague Blossom wins only 10 points more than Flora without it; Arc Forge still 9–15 points.

The "lift" measure (win share while holding a result, against the same hero in the same round without it) is honest about one thing only: which results stand out. Its top list changes from sample to sample (Total Eclipse, Ghost Shroud and Living Armor came up in all three samples and were weakened twice), and a holder is also a bot whose shop went well. Read a lift above about 15 points in two samples as "too strong", not a single one.

## The star clock in numbers

Kept as it was, now measured and written into `docs/concept.md`: Calm, Flare, Red Giant, Collapse 8 s each, Supernova from 32 s with 3 % of maximum health per second plus 1.5 points each second (30 % after 5 s, 66 % after 8 s). The hero ahead when it begins wins about 9 in 10 of those fights. Ysel, who takes half, reaches it in only 6 % of her fights (others 10–16 %) but wins 66 % of those; her Supernova resistance hardly ever matters. Quill wins only a third of her Supernova fights.

## Still open

- **Hero curves** (see table). The heroes are being redesigned, so these were not tuned further.
- **Ysel and the Supernova:** her identity says "long fights", her builds end fights early. A question for the hero redesign.
- **Early rounds reach the Supernova more often** (17–20 %) than late ones (5–10 %). Decided with Ilja (2026-11-15): it stays that way.

# Second balance pass (2026-11-15, earlier the same day)

Measured with `npm run report:*` at normal accuracy; the full reports are in `docs/reports/`. This pass had three goals: longer fights, more hero items, and an answer to "does a hero win in one way or in several?".

### What changed

- **Longer fights.** All healing, Shield and bonus health on items went up by 40 %, hero health by 10–20 %, and 24 general sustain items were added (healing, cleansing, Shield, Regen; 16 in the shop, 8 crafted).
- **Bigger hero pools.** Every hero got 9 more shop items and 6 more crafted items (35 items per hero now, 384 in total, 151 recipes). They are built as a second and third path, and every start weapon now has two competing upgrades.
- **Paths.** Each hero lists three designed paths in `data/heroes.json`. Balancing bots commit to one of them (three of four bots; the fourth plays open). The new report `npm run report:paths` compares them.
- **Hero kits re-tuned** for the longer fights: Rook's mechanical items are faster, Quill's pets heal her when they act and add health, Flora's organic bonus and Ysel's late-phase speed bonuses are smaller.
- **Shop rebuilt** (after the pass, decided with Ilja): 6 offers instead of 5, at most one bag per roll, a weight per item, more offers of the types the backpack already holds, and offers can be pinned for later (any number). See "The shop" in `docs/concept.md`.
- **A runaway effect removed.** Three Flora items gained Spikes every time she was attacked. In longer fights that stacked without limit and made up half of Flora's damage in every path. They now gain Spikes at the start or per star phase.

### Where the draft stands

| Question | Result | Before |
|---|---|---|
| Fight length | 23–24 s in rounds 1–4, 20–21 s from round 5 on (80 % of the fights between 11 and 39 s). | 18 s, falling to 13–14 s |
| Supernova | Reached in 19–23 % of the fights in rounds 1–4, 9–12 % later. The Red Giant phase (from 16 s) is now seen in most fights. | 8 %, then 1 % |
| Heroes | Win share 47–54 %: Ysel 47, Flora 50, Rook 50, Quill 54. Hero against hero between 41 and 60 %. By part of the run: Quill is strong in rounds 5–8 (63 %), Ysel is weak there (43 %). Measured again after the bench became loose items with a limit of 6 (was 4): no change beyond the usual noise. | 45–56 % |
| Damage sources | Weapons 56–64 %, Toxin 11–17 %, Burn 8–13 %, Spikes 2–10 %, direct 3–7 %. | Weapons 64–68 % |
| Items | 225 of 362 priced items are worth between half and one and a half times their price; 33 are clearly too strong, 2 clearly too weak, 102 are unclear at this sample size. | 178 of 278 |
| Placement | A build laid out by the bot wins 8–13 points more than the same items laid out at random. | 11–16 |
| Crafting | Bots that never combine win 45 % against 61 %. 11.3 combinations per run; 49 % of the runs reach chain step 2, 2 % step 3. | 37 / 63 % |
| Runs | With 4 lives, 11 % of the runs survive all 12 rounds; a run lasts 7.6 rounds and wins 3.8 fights on average. | 10 % |

### One way to win or several?

Short answer: every hero has three paths that win about equally often, but the paths of a hero still do damage in the same way. They differ in defence, tempo and items, less in how the enemy dies.

| Hero | Win share of the paths | How they differ in the fight (rounds 9–12) |
|---|---|---|
| Flora | Poison garden 53 %, Thorn wall 53 %, Hungry jungle 50 % | The most mixed damage of all heroes: Toxin 44–48 %, weapons 24–32 %, Spikes 13–24 %. The paths shift the mix by about 10 points, not more. |
| Rook | Workshop 51 %, Overclocked guns 47 %, Shield fortress 40 % | Always 72–75 % weapon damage. The difference is defence: the fortress blocks or heals 110 % of Rook's health per fight (25 s fights), the guns 45 % (19 s). |
| Quill | Swarm 56 %, Big beasts 54 %, Well-fed pack 46 % | Always 80–83 % weapon damage through pets. The bots hardly follow the paths (18–34 % of the build's cost is path items), so this is the weakest evidence. Well-fed pack drops to 41 % late. |
| Ysel | Eclipse 45 %, Late ascension 43 %, Burning corona 42 % | Weapons plus Burn in every path (Burn 30–43 %). Eclipse is the defensive one, Late ascension the fastest (17 s). |

What this means:

1. **No path is a trap and none is the only choice.** Within a hero the paths are 3–11 points apart; only Quill's Well-fed pack and Rook's fortress are clearly behind the hero's best.
2. **Mechanically the heroes are still narrow.** Rook and Quill win by weapon damage whatever they build. A real second way to win needs a second damage channel in the pool (for example Rook: direct damage from Overclock stacks as a main source; Quill: pets that poison or burn) or a win condition that is not damage (outlasting into the Supernova with a resistant build).
3. **Winning through the Supernova is not a plan yet.** Only 9–12 % of the late fights reach it, and the hero ahead at that moment wins 83–97 % of them anyway.
4. **Hero against hero is closer than before** (41–60 %, before 29–65 %).

### Did the new shop help?

A little. With 6 offers the bots reroll less (0.1–0.7 times per round instead of 0.3–1.0) and still fill the backpack (45 bag cells in round 12). The share of path items in the final builds did not move beyond noise (for example Rook 63 / 52 / 59 %, Quill 26 / 18 / 34 %): the bots commit weakly, and Quill's three paths all consist of pets, so "more of what you own" cannot tell them apart. Whether a human can build a path on purpose is a question for the browser preview, not for these bots.

### Still open

- **Hero curves.** Quill is too strong and Ysel too weak in rounds 5–8. The balance moves by several points whenever the item ratings are measured again, because the bots then buy differently. Expect a few more "change, measure items, measure heroes" rounds.
- **33 items are clearly too strong**, many of them the start weapons and their first upgrades (by design the best buys early) and several new crafted hero items (Thorn Pod, Twin Suns, Guard Hound, Living Armor, Plague Blossom). See `STRONG` in `docs/reports/items.txt`.
- **4 lives are few for 12 rounds.** Only 11 % of the runs see round 12.
- **The three-step capstones are trophies.** Bots make them in about 2 % of the runs.

### How to continue

```
npm run report:items -- --write-ratings   # after item changes, so the bots know what is good
npm run report:heroes                     # are the heroes even
npm run report:paths                      # does every path of a hero win
npm run report:all                        # everything into out/reports/
npm run play:ghosts                       # fresh opponents for the browser preview
```

One pass takes about six minutes at normal accuracy.

### Limits of these numbers

- Bots combine as soon as they own all inputs and do not plan chains, bag layouts or counters. Chain depth and bag bonuses are lower bounds.
- A bot "commits" to a path by valuing its items 50 % higher. It does not plan the path's recipes or layout, so a human will play a path more purely than the bots do.
- Item values are measured by giving a typical build of the item's round one extra copy for free. Items that only shine in a dedicated build (pet counts, phase builds) look weaker than they are.
- All opponents are bots of the same kind. A dominant human strategy can still exist.
