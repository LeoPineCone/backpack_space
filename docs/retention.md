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
| Planet track | Galaxies | Permanent, across seasons | Menu backgrounds: 20 planets, lightly animated; more come over time. |
| Season pass (free) | Galaxies | One season | Cosmetics, some Credits. No new hero. |
| Season pass (premium) | Galaxies | One season | New hero from level 1, skins, grid backgrounds |

Free Credits come from the free pass. Whether the planet track gives anything between its planets is open.

**Heroes:** 4 heroes are playable from the start. Each new season adds one more hero. Premium pass owners get it right away; everyone else can buy it for Credits later.

## Season pass

Decided by Ilja on 2026-11-19. The pass has 50 levels and is full after 940 Galaxies earned in the season: levels 2 to 5 cost 10 Galaxies each (a fast start), levels 6 to 50 cost 20 each, about 5 runs a level (`seasons[].pass.firstLevels` and `galaxiesPerLevel`). A run pays about 4 Galaxies at half the fights won.

| Player | Galaxies per week | Level 10 | Level 25 | Level 50 | Level at season end |
| --- | --- | --- | --- | --- | --- |
| Casual (2 runs a day, 4 days a week) | 32 | 4.4 weeks | – | – | 23 |
| Regular (4 runs a day, 6 days) | 96 | 10 days | 4.6 weeks | 9.8 weeks | 50 |
| Heavy (6 runs a day, 7 days) | 168 | 6 days | 2.6 weeks | 5.6 weeks | 50 |

The quest bonus (below) adds a little on top. A regular player fills the pass with 3 weeks to spare.

**Rewards** (season 1, placeholders until the cosmetics exist; Credits amounts follow the prices, STORE-12):

| Lane | Reward | Levels |
| --- | --- | --- |
| Premium | the season hero (season 1 has none) | 1 |
| Premium | a skin for each of the 4 base heroes | 10, 20, 30, 40 |
| Premium | the season hero's skin (season 1: a player picture) | 50 |
| Premium | grid backgrounds and player pictures | 15, 25, 35, 45 |
| Premium | Credits | all other levels from 2 |
| Free | Credits | every second level |
| Free | a grid background | 25 |

Buying the premium pass later in the season hands out the premium rewards of every level already reached. Galaxies past level 50 still move the planet track. Something more after level 50 is wanted, but not Credits; what it is stays open.

## Planet track

Decided by Ilja on 2026-11-19. The planet track counts every Galaxy ever earned and never resets. It has 20 planets; the last one, the Dying Corona, needs 4,400 Galaxies. The gaps grow from 30 to 750 Galaxies: everyone gets a new planet in the first week, later each planet is something special. Cinder is the start background and not on the track.

| Player | Planet 5 | Planet 10 | Planet 15 | Planet 20 |
| --- | --- | --- | --- | --- |
| Casual | 7 weeks | 22 weeks | 57 weeks | 2.6 years |
| Regular | 2.3 weeks | 7.5 weeks | 19 weeks | 46 weeks (3.5 seasons) |
| Heavy | 9 days | 4.3 weeks | 11 weeks | 26 weeks (2 seasons) |

**Order** (`planetTrack`, total Galaxies): Rime 30, Pell 70, Ochre 110, The Drift 160, Thinwind 220, Gemell 280, new place 360, The Scrap Belt (Rook) 460, new place 580, The Garden Station (Venn) 720, new place 880, Herdworld (Quill) 1,060, new place 1,270, Vigil (Ysel) 1,520, five new places 1,820 / 2,170 / 2,580 / 3,060 / 3,650, The Dying Corona 4,400. The heroes' homes sit in the middle, the dying sun is the finale.

- The 9 new places are placeholders (`bg_tbd_1` to `bg_tbd_9`, "Unknown planet") until they are written into `lore/planets.json`; Ilja does not want drafts yet.
- New planets are added over time, at the end of the track, about 750 Galaxies apart (a regular player: about 8 weeks).
- Every planet needs a surface map (`.claude/skills/planet-art/SKILL.md`); until then it shows the placeholder.
- Nothing lies between the planets for now; whether small rewards go there is open.

## Hero levels

Decided by Ilja on 2026-11-19. Each hero has 20 levels plus 3 Elite levels. The first levels come fast, later ones take longer, and the path is meant to last: a heavy player reaches level 20 with their main hero after 2 seasons, not sooner.

**Hero XP per run** (`data/meta.json` → `run.heroXp`):

- 100 XP for each round played. Wins give nothing extra; they go with the rounds anyway.
- 500 XP bonus for a completed run: every round played with a life left (about 7 % of runs when half the fights are won). A quest with fewer rounds is completed after its own last round. A run given up is not completed.
- On average a run gives about 800 XP; the shortest run (4 lost rounds) gives 400 XP, enough for level 2.
- Season hero: whoever holds the premium pass of a season gets 25 % more XP for that season's hero during that season. Otherwise every hero follows the same curve from level 1.

**The curve** (`heroLevels.xp`, total XP for level 2, 3, … 23):

| Level | XP for this level | Total XP | Runs with one hero (800 XP each) |
| --- | --- | --- | --- |
| 2 | 400 | 400 | 0.5 |
| 5 | 800 | 2,400 | 3 |
| 10 | 6,000 | 20,500 | 26 |
| 15 | 25,500 | 104,500 | 131 |
| 20 | 67,000 | 349,000 | 436 |
| 21 (Elite) | 56,000 | 405,000 | +70 Elite runs |
| 22 (Elite) | 68,000 | 473,000 | +85 Elite runs |
| 23 (Elite) | 80,000 | 553,000 | +100 Elite runs |

Time to level 20 with the main hero (assumptions: 2 / 4 / 6 runs a day on 4 / 6 / 7 days a week; 60 / 50 / 40 % of the runs with the main hero; a season is 13 weeks):

| Player | Runs with the main hero per week | Level 5 | Level 10 | Level 15 | Level 20 |
| --- | --- | --- | --- | --- | --- |
| Casual | 4.8 | 4 days | 5 weeks | 6 months | 1.7 years |
| Regular | 12 | 2 days | 2 weeks | 11 weeks | 36 weeks (2.8 seasons) |
| Heavy | 16.8 | 1 day | 11 days | 8 weeks | 26 weeks (2 seasons) |

**Elite levels 21 to 23** (`heroLevels.eliteLevels`): only ranked runs played in the highest league group (Elite) fill them.

- The league counts as it was when the run was played, before its points are booked. A run that brings the player into Elite does not count yet. Since a reached league is a floor, a player stays in Elite until the season ends.
- Quest runs give XP only up to level 20; Elite XP come exclusively from ranked runs in Elite.
- Outside Elite a hero stops at level 20; the XP that would go past are lost, not saved for later (otherwise the first promotion to Elite would give several levels at once).
- Elite levels reached stay forever.
- The Elite levels are flatter than the way to 20: about 2 seasons in Elite for a heavy player (assumption: 60 % of a season in Elite after climbing back from league 3 at the season start).

**Rewards** (`heroLevels.cosmeticAt` and `heroLevels.rewards`):

| Level | Reward |
| --- | --- |
| 3, 6, 10, 15 | a hero cosmetic (placeholder `<hero>_lv<level>`, still to be designed) |
| 20 | a skin, a badge and a frame around the hero (the frame is a draft until the design shows it works) |
| 21, 22, 23 | a badge and a title |

**Titles** are new: one title is worn next to the name on the profile. Titles cannot be bought, only earned, in different situations; the Elite levels are the first source, more come later. The profile card shows the player picture on top, then the title, then the name, with the patch or badge at the side. Where badges are worn is decided later. Title words are placeholders for now ("Venn Elite 1").

## Daily and weekly quests

Every quest is a whole run with one special rule (decided by Ilja 2026-11-18, rules 1 to 7 of the proposal list). Opponents come from the normal pool. A quest run pays Galaxies and hero XP like a normal run, but no league points and no XP for the Elite levels. On top it pays bonus Galaxies: 1 for a daily quest, 5 for a weekly one (decided 2026-11-19, `quests.bonusGalaxies`); for now every booked quest run gets them. Every day 3 daily quests are open and every week (Monday to Sunday, UTC) 1 weekly quest; which ones follows from the date alone, the same for everyone. Each quest can be played once in its day or week.

| Rule | What changes | Daily | Weekly |
| --- | --- | --- | --- |
| Short flight | 6 rounds, 2 lives | yes | – |
| One shot | 1 life for the whole run | – | yes |
| Early nova | every phase of the star clock lasts 4 s, so the supernova comes earlier | yes | yes |
| Gold rain | 5 more gold every round | yes | – |
| No reroll | the shop cannot be rerolled | yes | – |
| Far light | the shop offers the rarities of 3 rounds later | yes | – |
| No gifts | no free picks after rounds 2 and 6 | yes | – |

The numbers and which rules are daily or weekly live in `data/meta.json` → `quests`; the core turns a rule into changed run rules (`packages/core/src/quests.ts`). Still open: when a quest counts as done (just played, or a number of wins).

## Leagues

After each run you gain or lose league points and move up through the leagues. At the end of the season you get a patch for the league you reached that season. One patch can be equipped on the profile, where it is shown.

Decided: a season lasts 3 months (2026-11-18), so a new hero comes four times a year. Decided: 10 leagues. Each league reached is a floor; you cannot drop below it (points inside a league can be lost). At the start of a new season you drop to the highest league of the next lower league group (decided 2026-11-17, see [matchmaking.md](matchmaking.md)); in the lowest group you stay where you are. This replaces the earlier rule "2 leagues down"; the core implements it in `seasonStartLeague`.

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

- Daily and weekly quests: when does one count as done?
- What comes after pass level 50 (not Credits), and whether the planet track has rewards between its planets? (Speed of hero levels, pass and planet track decided 2026-11-19.)
- The 9 new places of the planet track.
- How many free Credits, and what does a hero cost?
- Premium pass price? (Season length decided 2026-11-18: 3 months.)
- Which cosmetics go on hero levels 3, 6, 10 and 15, and what the badges, frames and titles look like and say? Where badges are worn?
- Leagues: points formula, points per league, final league names?
- First minutes of a new player (onboarding, first runs, when leagues and the pass appear).

## What is built

Step 1 (2026-11-16): the structure, with placeholder numbers. Nothing here is balanced yet.

- **Rules** in the core, `packages/core/src/meta.ts`, pure and without clock reads: `bookRun` (hero XP, Galaxies, league points and everything they unlock), `heroLevel`, `passLevel`, `leagueOf` / `addLeaguePoints` (league floor), `enterSeason` (patch for the ended season, down to the highest league of the next lower group, new pass), `seasonAt` (season of a date the caller passes in), `unlockPremium`, `equip`. Tests: `test/meta.test.ts`.
- **Numbers** in `data/meta.json`, checked by `npm run validate`: Galaxies per win and per life left (1 and 1, as decided), hero XP per round played and the completion bonus, the XP table of 20 hero levels plus 3 Elite levels and the levels that give hero cosmetics, the planet track (20 planets), 10 leagues (100 points each, points by wins, league groups for the season reset), the cosmetics, season 1 with 50 pass levels.
- **Client** (`apps/client`): the profile is kept on the device (`src/profile.ts`). The run end shows Galaxies (wins + lives), hero XP and level, league points and what was unlocked. The hero screen shows league, Galaxies, Credits, the hero's level and the equipped background. One popup with five tabs (hero levels, planets, season pass, leagues, profile) behind the league badge, the level, the Galaxies and the pass button; the "i" button explains the symbols. On start the client checks whether a new season has begun.
- **Opponents** come through `OpponentSource` (`apps/client/src/opponents.ts`). For now: the stored bot builds; a server with saved player backpacks replaces it without touching the screens.

Assumptions of step 1 (open for change):

- Rewards are handed out automatically when a step is reached; there is no claim button.
- Heroes that no season brings are owned from the start (today all 4). A season hero comes with the premium pass at level 1.
- Hero level rewards at levels 3, 6, 10 and 15 are placeholders (`<hero>_lv<level>`), until it is decided which cosmetics go there. Levels 20 to 23 give `<hero>_lv<level>_<kind>` (skin, badge, frame, title).
- League points depend on wins only: minus up to 5 wins, 0 at 6, plus from 7 wins upwards.
- League patch ids are `patch_s<season>_<league>`. Every reached league counts as the floor, so the league at the end of a season is the highest reached.
- Free Credits come from the free pass.
- Season 1 started on 2026-11-01 and has no season hero.

Not built yet (step 2 and later): quest rewards beyond a normal run, the shop for skins, heroes and Credits, buying the premium pass, real payments, accounts and a server, real art for planets, patches and skins.
