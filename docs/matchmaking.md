# Matchmaking

Concept only (decided 2026-11-17). Nothing here is built except the seam in the client, `OpponentSource` with `pick` and `submit` (`apps/client/src/opponents.ts`). The requests between app and backend are drawn in [client-server.md](client-server.md).

Before every fight the app sends the player's backpack to the backend and gets a fitting opponent backpack back. At launch every opponent is a pre-built bot backpack. Player backpacks are collected from day one but are handed out as opponents only later.

## Decisions

- The request is made right before the fight, after the shop phase.
- Matching goes by round, then by run standing, then by league.
- A backpack score is postponed.
- Data version and app version are stored separately.
- The game only starts with a network connection. League points are booked by the server only.
- The server hands out the shop seed of every round, checks the backpack for plausibility, and computes the fight right when matching. This replaces the earlier decision to recompute every fight when the run is booked.
- The app sends the shop actions of every round from the start. The server stores them; a full replay is a later stage.
- At launch there are 50 bot backpacks per round and run standing, built by invented bot players that have their own league. In the first weeks players fight bots only.
- Player backpacks are stored without a cap for now.
- The 10 leagues form 4 league groups; the season reset follows the groups (see below).

## One round

There is exactly one request per round, when the player taps "Fight".

1. The player finishes the shop phase and taps "Fight".
2. The app sends the backpack and the shop actions of the round to the backend.
3. The backend checks the backpack for plausibility and commits it. The committed backpack is also a possible opponent for others.
4. The backend looks for a fitting opponent, picks the random seed of the fight and computes the fight right away.
5. The app gets the opponent backpack, name, league patch, seed, the result and the shop seed of the next round.
6. The app computes the same fight with the core and plays it back.
7. After the last round the app reports the end of the run. The backend books league points, hero XP and Galaxies from the standing it already knows.

If the connection drops in the middle of a run, the run stays paused on the device and the request is repeated. A run can be continued later.

## Stored backpack

Every backpack sent in is stored as a snapshot of one round.

| Field | Content | Used for |
| --- | --- | --- |
| Backpack | hero, bags, items with position and rotation | the fight itself |
| Round | 1 to 12 | fixed matching criterion |
| Run standing | wins and lives left before this fight | matching criterion |
| League | league and league points of the player | matching criterion |
| Data version | major.minor of the game data | validity |
| App version | version of the app | debugging, analysis |
| Origin | bot or player, player id, run id | fixed rules, analysis |
| Display | name and equipped league patch | shown in the fight |
| Time | date of the snapshot | ageing |
| Score | empty for now | later |

The run standing is small: with 4 lives there are at most 4 standings per round (4, 3, 2 or 1 lives left). Round 1 has one standing, round 2 two, round 3 three, so 12 rounds give 42 buckets.

## Matching rules

The search runs in steps. Each step relaxes one criterion until an opponent is found.

| Step | Round | Run standing | League |
| --- | --- | --- | --- |
| 1 | same | same | same |
| 2 | same | same | plus/minus 1 |
| 3 | same | plus/minus 1 life | plus/minus 1 |
| 4 | same | plus/minus 1 life | any |
| 5 | same | any | any |

The round is never relaxed. Inside a step the pick is random, so that not everyone meets the same opponent.

Rules that always hold:

- Never a backpack of the player themselves.
- No opponent twice in the same run.
- Only backpacks that are valid under the player's data version.
- The first 2 to 3 runs of a new player go against deliberately easier bot backpacks.

## Bot backpacks

At launch there are 50 bot backpacks per round and run standing. They belong to invented bot players that look like real players: with a name, a league, a patch and the backpacks of their runs.

- **Amount:** 42 buckets times 50 gives 2,100 backpacks.
- **Bot players:** every bot player has a name, a league group, an equipped patch and a skill level. One run of a bot player yields up to 12 backpacks, one per round.
- **Generation:** the existing balancing bots play the runs of the bot players. More runs are played than needed, then 50 backpacks are chosen per bucket.
- **Variety:** all 4 heroes and all paths of each hero are present. Bot players of different skill also fill the buckets with few lives.
- **Storage:** the bot backpacks live in the backend, not in the app. They can be replaced without an app update.
- **Upkeep:** they are checked after every data change. After a major change they are generated again.
- **Built (M2):** `npm run seed` (`apps/backend/src/seed/bot-pool.ts`). Number of bot players (decided 2026-11-18): 50 per league group (200), half of the lowest group plays a little weaker (lays out with less effort); plus 16 easy bots. Runs that rarely happen (all wins late in a run) are short of builds; such a bucket borrows builds of the same round from the nearest standing (about 7 % of the launch set). The launch set takes about a minute to generate.
- **Easy tier:** the first `matching.easyRuns` runs of a player (3, in `data/meta.json`) meet bots that buy and lay out at random (decided 2026-11-18; `easy` partitions, a fifth of the normal amount per bucket), with the normal bots as fallback.

## League groups

The 10 leagues are put into 4 groups. League 1 is the highest here (in `data/meta.json` the list starts with the lowest league).

| Group | Leagues | After the season you drop to |
| --- | --- | --- |
| Elite | 1, 2 | league 3 |
| Pro | 3, 4, 5 | league 6 |
| Intermediate | 6, 7, 8 | league 9 |
| Amateur | 9, 10 | no drop, you stay in your league |

At the start of a season you drop to the highest league of the next lower group. Examples: from league 1 to league 3, from league 6 to league 9. This replaces the earlier rule "2 leagues down". The core and `data/meta.json` still implement the earlier rule.

Bot players are assigned to a group, not to a single league. For bots, "league plus/minus 1" in the matching rules therefore means "same group". The groups are `leagues.groups` in `data/meta.json` (sizes from the lowest group up); `leagueGroup` in the core reads them.

The matching itself is built in `apps/backend/src/domain/matching.ts` (M2): the steps above, the rules that always hold, and the phase setting `matchingPhase` (1 = bots only, 3 = players first; phase 2 waits for its threshold).

## Versions

Every backpack carries two versions: the data version decides whether it can be matched, the app version is for analysis only. The data version is `dataVersion` in `data/rules.json`; the core decides with `canMatch(stored, own)` (same major). `test/dataversion.test.ts` fails when an item, shape or recipe of the current major is gone without a new major (`npm run data:major` records a new one).

| Change | Data version | Old backpacks |
| --- | --- | --- |
| Numbers and texts (damage, prices, descriptions) | minor goes up | stay matchable |
| Item removed, shape changed, rule changed | major goes up | no longer matchable |
| App update without a data change | stays | stay matchable |

The fight is always computed with the data of the current player, so a stored backpack only has to be valid under that data. After a minor change an old backpack can be a little stronger or weaker than when it was stored. That is accepted, because old snapshots are replaced by new ones over time.

## Fairness and online only

League points come from the server only and cannot be forged on the device.

- The backend picks opponent and seed and computes the fight inside the same request. The app computes the same fight to show it. The core is deterministic, so the result has to match.
- The server's result is booked. If the app differs, the server wins.
- The backend commits the backpack before it picks the opponent, so a backpack cannot be fitted to the opponent.
- The backend hands out the shop seed of every round and checks every backpack for plausibility. The shop actions are stored from the start, so that runs can be replayed later to find cheated backpacks (see [client-server.md](client-server.md)).
- The game does not start without a network connection. At launch there is no offline mode and the app ships no bot backpacks.
- Sign-in runs silently through Game Center or Google Play Games, as decided in [ux.md](ux.md).

Measured on 2026-11-17 with the stored bot builds (`playground/ghosts.json`): one fight takes 0.5 to 0.8 milliseconds to compute, a whole run about 10 milliseconds. 100,000 runs a day cost about 17 minutes of one processor core.

## Phases

| Phase | Opponents | Move to the next phase |
| --- | --- | --- |
| 1. Launch | bot backpacks only | after the first weeks, once the collected numbers are evaluated |
| 2. Mixed | player backpacks in buckets that are full enough, bots otherwise | when all important buckets stay full |
| 3. Players first | player backpacks, bots only as fallback | stays |

In phase 1 player backpacks are stored but not handed out. That shows how many backpacks per bucket really come in. The threshold from which a bucket counts as full is set with those numbers; 20 per bucket is too few.

Player backpacks are stored without a cap for now. Measured: a backpack is 0.4 to 1.6 KB as JSON, about 1.3 KB on average with metadata. A whole run takes about 15 KB.

| Runs per day | Storage per day | Storage per year |
| --- | --- | --- |
| 1,000 | 15 MB | 5.5 GB |
| 10,000 | 150 MB | 55 GB |
| 100,000 | 1.5 GB | 550 GB |

Compressed it is about a third of that. A cap only becomes necessary when the numbers move towards the last row.

## Postponed

- **Backpack score.** Idea: win rate against fixed reference backpacks of the same round. The field is reserved in the stored backpack.
- **Loading the opponent in the background.** During the shop phase the backend could already prepare candidates, so that there is no wait before the fight. To be added if the request takes noticeably long.
- **Full replay of the shop actions.** Switched on if the analysis of the stored actions shows outliers.

## Open questions

- The group-based season reset still has to be built (core `enterSeason`, `data/meta.json`, glossary text of "League").
