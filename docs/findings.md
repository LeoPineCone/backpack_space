# Findings of the first balance pass (2026-11-15)

Measured with `npm run report:*` at normal accuracy; the full reports are in `docs/reports/`. Three rounds of tuning went in before these numbers. The hero table is from after the last hero tweak (Ysel lost her Overclock per phase, Flora's Toxin became certain, Quill's pets got faster); the other reports were taken just before it.

## Where the draft stands

| Question | Result |
|---|---|
| Heroes | Win share 45–56 %: Flora 45, Quill 49, Rook 52, Ysel 56. Not even by part of the run: Flora is strong early (56 %) and weak in rounds 5–8 (38 %), Quill is weak early (35 %). Worst pairing: Flora against Ysel, 29 %. |
| Fight length | 18 s in round 1, falling to 13–14 s from round 5 on. |
| Supernova | Reached in 8 % of the fights in rounds 1–2 and about 1 % later. The clock barely matters yet. |
| Damage sources | Weapons 64–68 %, Burn about 10 %, Toxin 6–19 % (falling over the run), Spikes up to 15 % late. |
| Items | 178 of 278 priced items are worth between half and one and a half times their price; 17 are clearly too strong, 2 clearly too weak, 81 are unclear at this sample size. |
| Placement | A build laid out by the bot wins 11–16 points more than the same items laid out at random. A six times longer search finds 2–10 points more. |
| Crafting | Bots that never combine win 37 % against 63 % for those that do. 11 combinations per run; 62 % of the runs reach chain step 2, 3 % step 3. |
| Runs | With 4 lives, 10 % of the runs survive all 12 rounds; a run lasts 7.7 rounds and wins 3.9 fights on average. |

## What that means

1. **The classic loop works in the simulation.** Buying well, combining and placing each pay clearly, and no hero or item wins everything.
2. **Fights are too short for the star clock.** With fights of 13 s the Red Giant and Collapse phases are rarely seen, and phase items and half of Ysel's kit are built for them. Raising health once (by about 60 % from round 5) moved the average from 11 s to 13 s only, because the bots answer with more damage. The lever is probably less damage per gold on weapons rather than more health.
3. **4 lives are few for 12 rounds.** At even odds only one run in ten sees round 12, so most players never reach the second special item's payoff or the long chains. Options: more lives, a life back at a milestone, or matchmaking by wins.
4. **Hero recipes are made in almost every run** (the start item's upgrade in 90–100 %, the hero's step-2 item in 40–85 %). The hero pools are small (9 shop items), so every run of a hero walks the same chain. More hero items, or two competing upgrades per start item, would fix that.
5. **The three-step capstones are trophies.** Phoenix 3 %, Worldbreaker 1 %, four others never made by bots. Bots do not plan three steps ahead, so a human will do better, but seven base items for one result is a lot even then.
6. **Spikes and the first weapons are the strongest effects, long cooldown star accessories the weakest.** Cheap weapons give far more per gold in round 3 than anything else (a start weapon adds 18–24 points of win share). Jam and Cryo were clearly too strong and now fade by one stack per second.

## Clearly too strong or too weak (after noise)

See the lines marked `STRONG` and `WEAK` in `docs/reports/items.txt`. Start items of the heroes are on the list by design (they are not bought). The rest are next in line for tuning.

## How to continue

```
npm run report:items -- --write-ratings   # after item changes, so the bots know what is good
npm run report:all                        # everything into out/reports/
npm run play:ghosts                       # fresh opponents for the browser preview
```

The bots take the measured ratings into account, so each tuning step shifts what they buy. Expect to repeat "change, measure items, measure heroes" a few times; one pass takes about five minutes at normal accuracy.

## Limits of these numbers

- Bots combine as soon as they own all inputs and do not plan chains, bag layouts or counters. Chain depth and bag bonuses are lower bounds.
- Item values are measured by giving a typical build of the item's round one extra copy for free. Items that only shine in a dedicated build (pet counts, phase builds) look weaker than they are.
- All opponents are bots of the same kind. A dominant human strategy can still exist.
