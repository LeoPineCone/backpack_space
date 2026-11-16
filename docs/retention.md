# Player retention and economy

Concept draft from 2026-11-16. Nothing here is built yet.

Players keep coming back because every run feeds three kinds of progress: hero levels, a permanent planet track and the season pass. On top of that, leagues give each run a ranked meaning.

## Principles

- No item unlocks. Every item is in the pool from the start.
- Meta progress gives cosmetics, not power. The only exception is new heroes.
- Freemium: the game is free; skins, backgrounds and the premium pass are sold.

## Opponents

Battles are asynchronous against saved backpacks of real players. While the database is empty or thin, pre-built configurations are used.

## Currencies

| Currency | Source | Used for |
| --- | --- | --- |
| Galaxies (icon: white, sparkling galaxy) | After each run: wins + remaining lives. Also from daily and weekly quests. | Count for the season pass and the planet track at the same time. |
| Credits | Bought for real money. Also earnable, but slowly. | Skins, heroes from earlier seasons. |
| Hero XP | After each run, for the hero played. | That hero's level path. |

## Progress tracks

| Track | Driven by | Duration | Rewards |
| --- | --- | --- | --- |
| Hero levels | Hero XP | Permanent, per hero | Cosmetics for that hero |
| Planet track | Galaxies | Permanent, across seasons | Menu backgrounds: different planets, lightly animated. Some Credits. |
| Season pass (free) | Galaxies | One season | Cosmetics, some Credits. No new hero. |
| Season pass (premium) | Galaxies | One season | New hero from level 1, skins, grid backgrounds |

Where exactly free Credits come from (free pass, planet track) is an assumption, not yet decided.

**Heroes:** 4 heroes are playable from the start. Each new season adds one more hero. Premium pass owners get it right away; everyone else can buy it for Credits later.

**Planet ideas:** ice planet with drifting floes, gas giant with a storm eye, lava planet with glowing cracks, ringed planet with a turning ring, jungle planet (fits Venn), and at the end the dying sun (a nod to Ysel).

## Daily and weekly quests

Quests are played against static opponents with specific restrictions and reward Galaxies. The deterministic core makes fixed opponents and equal conditions for everyone easy.

Example restrictions (not decided): organic items only, the supernova comes earlier, win with 3 animals in the backpack.

## Leagues

After each run you gain or lose league points and move up through the leagues. At the end of the season you get a patch for the league you reached that season. One patch can be equipped on the profile, where it is shown.

Decided: 10 leagues. Each league reached is a floor; you cannot drop below it (points inside a league can be lost). At the start of a new season you move back 2 leagues.

Ideas (not decided):

- Points by wins in the run, e.g. plus from 7 wins upwards, minus for few wins.
- Opponent backpacks preferably from your own league.
- The equipped patch is also visible on the opponent's backpack in battle.
- League names, draft only (to be sharpened): Dust, Asteroid, Comet, Moon, Planet, Gas Giant, Star, Nova, Pulsar, Quasar.

## Shop (monetization)

- Skins: for real money or Credits.
- Backgrounds and grid backgrounds.
- Premium season pass, once there is enough content for it.
- Credit packs for real money.
- Heroes from earlier seasons: for Credits.

## Open points

- Daily and weekly quests: which ones, how hard, how many per day and week?
- Speed of hero levels, planet track and pass (Galaxies per level)?
- How many free Credits, and what does a hero cost?
- Season length and premium pass price?
- Which cosmetics go on the hero level paths?
- Leagues: points formula, points per league, final league names?
- First minutes of a new player (onboarding, first runs, when leagues and the pass appear).
