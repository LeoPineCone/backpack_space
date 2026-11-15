# Findings of the second balance pass (2026-11-15)

Measured with `npm run report:*` at normal accuracy; the full reports are in `docs/reports/`. This pass had three goals: longer fights, more hero items, and an answer to "does a hero win in one way or in several?".

## What changed

- **Longer fights.** All healing, Shield and bonus health on items went up by 40 %, hero health by 10–20 %, and 24 general sustain items were added (healing, cleansing, Shield, Regen; 16 in the shop, 8 crafted).
- **Bigger hero pools.** Every hero got 9 more shop items and 6 more crafted items (35 items per hero now, 384 in total, 151 recipes). They are built as a second and third path, and every start weapon now has two competing upgrades.
- **Paths.** Each hero lists three designed paths in `data/heroes.json`. Balancing bots commit to one of them (three of four bots; the fourth plays open). The new report `npm run report:paths` compares them.
- **Hero kits re-tuned** for the longer fights: Rook's mechanical items are faster, Quill's pets heal her when they act and add health, Flora's organic bonus and Ysel's late-phase speed bonuses are smaller.
- **A runaway effect removed.** Three Flora items gained Spikes every time she was attacked. In longer fights that stacked without limit and made up half of Flora's damage in every path. They now gain Spikes at the start or per star phase.

## Where the draft stands

| Question | Result | Before |
|---|---|---|
| Fight length | 24 s in rounds 1–4, 20–21 s from round 5 on (80 % of the fights between 11 and 40 s). | 18 s, falling to 13–14 s |
| Supernova | Reached in 21–24 % of the fights in rounds 1–4, 6–12 % later. The Red Giant phase (from 16 s) is now seen in most fights. | 8 %, then 1 % |
| Heroes | Win share 43–55 %: Ysel 43, Rook 49, Flora 55, Quill 55. Hero against hero between 41 and 57 %. By part of the run: Flora is strong early (64 %), Quill in rounds 5–8 (65 %), Ysel is weak in rounds 5–8 (35 %). | 45–56 % |
| Damage sources | Weapons 56–62 %, Toxin 11–20 %, Burn 8–13 %, Spikes 2–13 %, direct 2–7 %. | Weapons 64–68 % |
| Items | 230 of 362 priced items are worth between half and one and a half times their price; 27 are clearly too strong, 4 clearly too weak, 101 are unclear at this sample size. | 178 of 278 |
| Placement | A build laid out by the bot wins 8–13 points more than the same items laid out at random. | 11–16 |
| Crafting | Bots that never combine win 38 % against 59 %. 10.7 combinations per run; 49 % of the runs reach chain step 2, 1 % step 3. | 37 / 63 % |
| Runs | With 4 lives, 12 % of the runs survive all 12 rounds; a run lasts 7.6 rounds and wins 3.8 fights on average. | 10 % |

## One way to win or several?

Short answer: every hero has three paths that win about equally often, but the paths of a hero still do damage in the same way. They differ in defence, tempo and items, less in how the enemy dies.

| Hero | Win share of the paths | How they differ in the fight (rounds 9–12) |
|---|---|---|
| Flora | Poison garden 56 %, Thorn wall 55 %, Hungry jungle 53 % | The most mixed damage of all heroes: Toxin 37–47 %, weapons 26–31 %, Spikes 19–28 %. The paths shift the mix by about 10 points, not more. |
| Rook | Workshop 49 %, Overclocked guns 46 %, Shield fortress 42 % | Always 70–80 % weapon damage. The difference is defence: the fortress blocks or heals 95 % of Rook's health per fight (24 s fights), the guns 51 % (20 s). |
| Quill | Swarm 62 %, Big beasts 56 %, Well-fed pack 48 % | Always 75–85 % weapon damage through pets. The bots hardly follow the paths (18–35 % of the build's cost is path items), so this is the weakest evidence. Well-fed pack drops to 37 % late. |
| Ysel | Burning corona 44 %, Late ascension 43 %, Eclipse 44 % | Weapons plus Burn in every path (Burn 26–40 %). Eclipse is the defensive one, Late ascension the fastest (19 s). |

What this means:

1. **No path is a trap and none is the only choice.** Within a hero the paths are 1–14 points apart; only Quill's Well-fed pack and Rook's fortress are clearly behind the hero's best.
2. **Mechanically the heroes are still narrow.** Rook and Quill win by weapon damage whatever they build. A real second way to win needs a second damage channel in the pool (for example Rook: direct damage from Overclock stacks as a main source; Quill: pets that poison or burn) or a win condition that is not damage (outlasting into the Supernova with a resistant build).
3. **Winning through the Supernova is not a plan yet.** Only 6–12 % of the late fights reach it, and the hero ahead at that moment wins 84–97 % of them anyway.
4. **Hero against hero is closer than before** (41–57 %, before 29–65 %).

## Still open

- **Hero curves.** Flora is too strong in rounds 1–4 and Ysel too weak in rounds 5–8. The balance moves by several points whenever the item ratings are measured again, because the bots then buy differently. Expect a few more "change, measure items, measure heroes" rounds.
- **27 items are clearly too strong**, many of them the start weapons and their first upgrades (by design the best buys early) and several new crafted hero items (Thorn Pod, Twin Suns, Guard Hound, Living Armor, Plague Blossom). See `STRONG` in `docs/reports/items.txt`.
- **4 lives are few for 12 rounds.** Only 12 % of the runs see round 12.
- **The three-step capstones are trophies.** Bots make them in about 1 % of the runs.

## How to continue

```
npm run report:items -- --write-ratings   # after item changes, so the bots know what is good
npm run report:heroes                     # are the heroes even
npm run report:paths                      # does every path of a hero win
npm run report:all                        # everything into out/reports/
npm run play:ghosts                       # fresh opponents for the browser preview
```

One pass takes about six minutes at normal accuracy.

## Limits of these numbers

- Bots combine as soon as they own all inputs and do not plan chains, bag layouts or counters. Chain depth and bag bonuses are lower bounds.
- A bot "commits" to a path by valuing its items 50 % higher. It does not plan the path's recipes or layout, so a human will play a path more purely than the bots do.
- Item values are measured by giving a typical build of the item's round one extra copy for free. Items that only shine in a dedicated build (pet counts, phase builds) look weaker than they are.
- All opponents are bots of the same kind. A dominant human strategy can still exist.
