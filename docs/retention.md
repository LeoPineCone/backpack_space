# Player retention and economy

Concept draft from 2026-11-16. Step 1 (the structure) is built, see [What is built](#what-is-built).

Players keep coming back because every run feeds three kinds of progress: hero levels, a permanent planet track and the season pass. On top of that, leagues give each run a ranked meaning.

## Principles

- No item unlocks. Every item is in the pool from the start.
- Meta progress gives cosmetics, not power. The only exception is new heroes.
- Freemium: the game is free; skins, backgrounds and the premium pass are sold.

## Opponents

Battles are asynchronous against saved backpacks of real players. While the database is empty or thin, pre-built configurations are used. How an opponent is chosen: [matchmaking.md](matchmaking.md).

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

Decided: 10 leagues. Each league reached is a floor; you cannot drop below it (points inside a league can be lost). At the start of a new season you drop to the highest league of the next lower league group (decided 2026-11-17, see [matchmaking.md](matchmaking.md)); in the lowest group you stay where you are. This replaces the earlier rule "2 leagues down"; the core implements it in `seasonStartLeague`.

Ideas (not decided):

- Points by wins in the run, e.g. plus from 7 wins upwards, minus for few wins.
- The equipped patch is also visible on the opponent's backpack in battle.
- League names, draft only (to be sharpened): Dust, Asteroid, Comet, Moon, Planet, Gas Giant, Star, Nova, Pulsar, Quasar.

## Shop (monetization)

- Skins: for Credits. Only the premium pass and Credit packs cost real money (decided 2026-11-17, see [store.md](store.md)).
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

## What is built

Step 1 (2026-11-16): the structure, with placeholder numbers. Nothing here is balanced yet.

- **Rules** in the core, `packages/core/src/meta.ts`, pure and without clock reads: `bookRun` (hero XP, Galaxies, league points and everything they unlock), `heroLevel`, `passLevel`, `leagueOf` / `addLeaguePoints` (league floor), `enterSeason` (patch for the ended season, down to the highest league of the next lower group, new pass), `seasonAt` (season of a date the caller passes in), `unlockPremium`, `equip`. Tests: `test/meta.test.ts`.
- **Numbers** in `data/meta.json`, checked by `npm run validate`: Galaxies per win and per life left (1 and 1, as decided), hero XP per round and per win, the XP table of 20 hero levels and the levels that give a hero cosmetic, the planet track (6 planets plus some Credits), 10 leagues (100 points each, points by wins, league groups for the season reset), the cosmetics, season 1 with 30 pass levels.
- **Client** (`apps/client`): the profile is kept on the device (`src/profile.ts`). The run end shows Galaxies (wins + lives), hero XP and level, league points and what was unlocked. The hero screen shows league, Galaxies, Credits, the hero's level and the equipped background. One popup with five tabs (hero levels, planets, season pass, leagues, profile) behind the league badge, the level, the Galaxies and the pass button; the "i" button explains the symbols. On start the client checks whether a new season has begun.
- **Opponents** come through `OpponentSource` (`apps/client/src/opponents.ts`). For now: the stored bot builds; a server with saved player backpacks replaces it without touching the screens.

Assumptions of step 1 (open for change):

- Rewards are handed out automatically when a step is reached; there is no claim button.
- Heroes that no season brings are owned from the start (today all 4). A season hero comes with the premium pass at level 1.
- Hero level rewards are placeholders (`<hero>_lv<level>`), until it is decided which cosmetics go there.
- League points depend on wins only: minus up to 5 wins, 0 at 6, plus from 7 wins upwards.
- League patch ids are `patch_s<season>_<league>`. Every reached league counts as the floor, so the league at the end of a season is the highest reached.
- Free Credits come from the free pass and the planet track.
- Season 1 started on 2026-11-01 and has no season hero.

Not built yet (step 2 and later): daily and weekly quests (they need restricted runs in the core), the shop for skins, heroes and Credits, buying the premium pass, real payments, accounts and a server, real art for planets, patches and skins.
