# Backend architecture

Design draft from 2026-11-17. Nothing here is built. It turns the decided requirements ([requirements.md](requirements.md), areas BE, DEV, ACC, RUN) and the flows in [client-server.md](client-server.md) into a structure that issues can be cut from. Everything marked "open" at the end still needs a decision.

Decided before this document: TypeScript, serverless on AWS Lambda, DynamoDB, AWS CDK, region Frankfurt, secrets in the Parameter Store, three environments (local, test, production), the whole system runs locally.

## At a glance

```mermaid
flowchart LR
  APP["App"] -- HTTPS --> API["HTTP API"]
  RC["RevenueCat"] -- webhook --> API
  API --> L1["config"]
  API --> L2["session"]
  API --> L3["game"]
  API --> L4["webhook"]
  SCH["Schedule"] --> L5["jobs"]
  L2 --> ID["Apple / Google<br/>identity check"]
  L3 --> T1[("players")]
  L3 --> T2[("backpacks")]
  L3 --> T3[("actions")]
  L3 --> RCAPI["RevenueCat API"]
  L4 --> T1
  L5 --> T1
  L5 --> T3
  L1 --> PS["Parameter Store"]
  L2 --> T1
```

Five Lambdas behind one HTTP API, three DynamoDB tables, settings and secrets in the Parameter Store. The same handler code runs locally behind a small HTTP server.

## Where the code lives

| Path            | Content                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | the deterministic core, unchanged in its role                                                                                                                         |
| `packages/api`  | new: the contract between app and backend. Request and response shapes as schemas, error codes, paths. Client and backend both import it, so they cannot drift apart. |
| `apps/backend`  | new: the backend                                                                                                                                                      |
| `apps/client`   | the app; gets a small API client that uses `packages/api` and replaces today's local profile and `GhostOpponents`                                                     |
| `apps/web`      | new: the website                                                                                                                                                      |
| `infra`         | new: the cloud setup as CDK code                                                                                                                                      |

Inside `apps/backend`:

| Folder         | Content                                                                                                                   | May import                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `src/handlers` | one entry per Lambda; reads the request, calls the domain, writes the answer                                              | everything below                             |
| `src/http`     | router, schema check of every request, token check, error answers, request log                                            | `packages/api`                               |
| `src/domain`   | the rules of the backend: session, run, matching, booking, shop, refunds, account. Pure TypeScript.                       | `packages/core`, `packages/api`, `src/ports` |
| `src/ports`    | interfaces to the outside: player store, backpack pool, action store, identity check, RevenueCat, settings, clock, random | nothing                                      |
| `src/adapters` | the real implementations: DynamoDB, RevenueCat API, Apple and Google, Parameter Store                                     | AWS and other libraries                      |
| `src/fakes`    | implementations in memory for tests and for local use where a real service is not available                               | nothing outside                              |
| `local`        | the local HTTP server and the script that creates local tables                                                            | everything                                   |
| `test`         | unit tests of the domain, interface tests against the local server                                                        | everything                                   |

The one rule that keeps this testable: **`src/domain` never imports an AWS library, never reads the clock and never rolls a random number itself.** Time and randomness come through ports, as in the core. So every rule of the backend can be tested without a database and without a network.

## Lambdas

Few Lambdas grouped by what they need, not one per request. That keeps deployments simple and cold starts rare.

| Lambda    | Requests                                                                       | Loads the core | Why its own                                                                      |
| --------- | ------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------- |
| `config`  | `GET /config`                                                                  | no             | must answer even when everything else is broken or in maintenance; tiny and fast |
| `session` | `POST /session`                                                                | no             | the only one that talks to Apple and Google                                      |
| `game`    | profile, runs, fight, finish, buying with Credits, account export and deletion | yes            | everything a signed-in player does                                               |
| `webhook` | `POST /hooks/revenuecat`                                                       | no             | called by RevenueCat, not by players; own secret, own limits                     |
| `jobs`    | none (timed)                                                                   | yes            | season change, clean-up, later the replay analysis                               |

Each Lambda gets only the rights it needs: `config` reads settings and nothing else, `webhook` may write to `players` but not read backpacks, and so on.

Inside a Lambda a small router maps path and method to a function. The local server uses the same router, so there is exactly one place where a path is defined.

### Every request goes through the same steps

1. Parse and check against the schema from `packages/api` (fields, types, size). Anything else is rejected before any code of ours runs on it.
2. Check the session token (not for `config`, `session`, `webhook`). The player id comes from the token.
3. Check maintenance and versions.
4. Run the domain function.
5. Answer with a body from `packages/api`, or with a fixed error code.
6. Write one log line (see "Logs and numbers").

## Sign-in and session token

- **Identity check.** The app hands in what Game Center or Play Games gave it. For Game Center the backend checks Apple's signature over player id, app id, timestamp and salt with Apple's public key. For Play Games the backend exchanges the server auth code at Google for the player id. Both need a Capacitor plugin in the app; which one is open. The exact calls have to be checked against the current Apple and Google documentation when building.
- **Player id.** A random id made by the backend at first sign-in. The store identity is stored only as the key of a lookup entry and appears in no log and in no answer.
- **Token.** A signed token with player id, platform, issue time and expiry. The signing key lives in the Parameter Store as a secure string. Two keys are accepted at once (current and previous), so a key can be changed without signing everybody out.
- **Lifetime.** Short, proposal: 1 hour. There is no refresh token: when the token has expired, the app signs in silently again, which costs the player nothing.
- **Where it is checked.** Inside the handler, in `src/http`, not in a separate authorizer Lambda. That is one call less per request and works the same locally.
- **Local and browser tests.** A development identity ("player 1", "player 2") replaces Game Center and Play Games. The backend accepts it only when a setting says so, and that setting does not exist in test and production.
- **Code.** Token: `apps/backend/src/http/token.ts` (`v1.<claims>.<signature>`, HMAC-SHA256, claims: player id, platform, issue time, expiry, key id). Identity checks: `apps/backend/src/adapters/store-identity.ts`; they need the settings `gameCenter.bundleIds` and `playGames.clientId`/`clientSecret` (an OAuth client of type "web", Play Console credential "Game server"). The Play Games steps were checked against developer.android.com on 2026-11-18. Apple's page could not be read automatically then: the Game Center steps follow the known procedure (player id + bundle id + timestamp as 64-bit big-endian + salt, RSA SHA-256, certificate from apple.com) and must be checked against Apple's documentation before launch.

## Data

Three tables, cut by one question: **what has to be restored together?**

| Table       | Holds                                                                                                                         | Restore to a point in time        | Deleted on its own    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------- |
| `players`   | everything about a player that must stay consistent: profile, ownership, the open run and its rounds, handled purchase events | yes                               | no                    |
| `backpacks` | the opponent pool: bot backpacks and collected player backpacks                                                               | yes, but independent of `players` | entries age out       |
| `actions`   | the recorded shop actions of every round                                                                                      | no                                | yes, after a set time |

A restore of `players` does not need the other two to be restored, because nothing in `players` points at an entry in them that could be missing: a round stores the opponent backpack it fought, not a reference to it.

All tables are billed per request (no capacity to plan at launch) and have deletion protection in production.

### Table `players`

One partition per player. One query for that partition loads everything the game needs for a request.

| Partition key             | Sort key             | Content                                                                                                                                                          |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P#<playerId>`            | `PROFILE`            | name, Galaxies, hero XP, season state, equipped things, run count, refund count, a version number, created at                                                    |
| `P#<playerId>`            | `OWN#<thing>`        | one entry per owned thing (cosmetic, hero, premium pass of a season) with its origin and date                                                                    |
| `P#<playerId>`            | `RUN`                | the open run: run id, hero, round, lives, wins, the backpack after the last round, the shop seed of the current round, the opponents already met                 |
| `P#<playerId>`            | `ROUND#<runId>#<nn>` | one entry per fought round: the committed backpack, the opponent backpack with name and patch, the fight seed, the result, and the complete answer that was sent |
| `P#<playerId>`            | `DONE#<runId>`       | the booked end of a run with the complete answer that was sent                                                                                                   |
| `P#<playerId>`            | `EVT#<eventId>`      | a handled RevenueCat event, so that a repeated report is not booked twice                                                                                        |
| `ID#<platform>#<storeId>` | `PLAYER`             | the lookup from store identity to player id                                                                                                                      |

Notes:

- **The Credits balance is not here.** It lives at RevenueCat only ([store.md](store.md)). The profile the app gets has no Credits field from us; the app reads the balance from RevenueCat.
- **Ownership entries are the truth for what a player owns.** The profile sent to the app is put together from `PROFILE` and the `OWN#` entries. A refund removes exactly the entries of that origin.
- **Repeatable answers.** `ROUND#` and `DONE#` store the answer that was sent. A repeated request finds the entry and returns the same answer without computing anything.
- **Writes that belong together are one transaction.** A fight writes the round entry (only if it does not exist yet) and moves the open run forward (only if it is still at that round). Finishing a run updates the profile (only if its version number is unchanged), writes `DONE#` and removes `RUN`. Two requests at the same time cannot both win.
- **Old rounds.** `ROUND#` and `DONE#` entries carry an expiry 30 days after they are written (proposal), and DynamoDB removes them on its own (`expiresAt`, as in the other tables); the backpacks live on in the pool. The recorded actions expire after 180 days (proposal for RUN-14).

**No move to another device.** At launch the server checks a backpack for plausibility only and does not replay the shop phase. So it does not know how much gold is left, which items lie loose and which offers are pinned. The app keeps these on the device. Continuing a run on another device or after a reinstall is not in scope for version 1 (decided 2026-11-17): if the app has no local copy of the open run, it reports that (`POST /runs/finish` with reason `no_local_copy`) and the server ends that run and books it with the standing it knows (built in M2, logged as `run_finished` with reason `abandoned`). The fight request stays as it is in [client-server.md](client-server.md).

### Table `backpacks`

| Partition key                            | Sort key             | Content                                                                        |
| ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `<origin>#<dataMajor>#R<round>#L<lives>` | `G<league>#<random>` | the backpack, name, league patch, player id (players only), data version, date |

- The partition is the bucket of the matching rules: round and run standing (with a fixed round the lives left say everything about the standing). There are 42 buckets per origin and data version.
- `origin` is `bot` or `player`. In phase 1 the matching reads only `bot` partitions, while player backpacks are already collected in theirs.
- **Random pick inside a league:** the sort key starts with the league and then a random value. The search rolls a random value and reads the next few entries after it inside the wanted league. That gives a random opponent with one small read, without loading the bucket. The steps of the matching rules ([matchmaking.md](matchmaking.md)) are further reads with a wider league range or a neighbouring bucket.
- A second index by player id finds all backpacks of a player, for "never your own backpack" checks in bulk and for account deletion.
- Bot backpacks are written by a command (DEV-06), not by a deployment. The same command fills local and test with a small set.

### Table `actions`

| Partition key | Sort key | Content                                                                                                                 |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `RUN#<runId>` | `R<nn>`  | the action lines of the round, the shop seed, the backpack before and after, simulation version, player id, expiry date |

Written after the fight is committed, outside the transaction: if this write fails, the fight still counts and the failure is logged. Entries expire on their own (how long is open, RUN-14). The later analysis reads this table with a job and replays the runs with the core.

### Restoring

- `players` can be restored to any second of the last 35 days into a new table. The name of the table in use is a setting, so the backend can be pointed at the restored table without a new deployment.
- **What a restore does not bring back:** the Credits balance and the purchases live at RevenueCat and keep their current state. After a restore, a player can have fewer things than they paid for. So every purchase, every Credits booking and every refund is also written as its own log line with the RevenueCat reference. A reconcile command reads those lines from the restore point on and books the missing ownership again. This command is part of the restore test before launch (BE-12).
- **Deleted accounts must stay deleted.** A restore would bring them back. The ids of deleted accounts are therefore kept in a small list outside `players`, and the reconcile command deletes them again.
- `backpacks` is restored only if the pool itself was damaged. Bot backpacks can also simply be generated again.
- `actions` is not restored.

## The fight request, step by step

This is the heart of the backend, so here is the order inside `game`:

1. Load the player's partition from `players`.
2. If a `ROUND#` entry for this run and round exists, return its stored answer. Done.
3. Check: is there an open run, is it at this round, does the simulation version match.
4. Check the backpack for plausibility with the core (CORE-05).
5. Find an opponent in `backpacks` (never the player's own, none met before in this run).
6. Roll the fight seed and the shop seed of the next round through the random port.
7. Compute the fight with the core and work out lives and wins (a draw costs a life, as in the app). The server does not merge: gold, loose items and pins live on the device.
8. Write in one transaction: the `ROUND#` entry and the moved-on `RUN`. If the transaction fails because another request was faster, start again at step 1, which then ends at step 2.
9. After the transaction: put the player's backpack into the pool, write the actions (kept 180 days, proposal for RUN-14). A failure here is logged; the fight still counts.
10. Send the answer.

The backpack is "committed" by step 8: from then on the round has exactly one backpack and one opponent, whatever is sent afterwards.

## Versions

- **Simulation version** (CORE-03): one id made from the core and the data. The backend holds exactly one simulation build. A run request with another version gets `update_required`.
- **Open runs after a version change** (RUN-13), proposal: a run is not tied to the version it started with. Every fight is computed once, by the server, at the time of the request; the app only has to have the same version at that moment. So after an update an open run simply continues. Only when the data's major version changed (an item was removed or reshaped) the stored backpack may no longer be valid; then the run is ended and booked as it stands.
- **Rolling out a new version.** App and backend change version at different times: the store needs hours or days to deliver an update, the backend changes in a minute. Proposal: during a rollout the `game` Lambda carries two simulation builds, the previous and the new one, and uses the one the request names. When enough players have updated, the minimum version in the settings is raised and the old build is removed with the next deployment. This needs the build to keep the previous simulation build; the simpler alternative is a short maintenance window at every version change.
- **Data in the app**: the app ships the game data and the pictures (decided 2026-11-17). A balance change or a new item is an app release. The server carries the same data build for its checks and fights.

## Settings and secrets

Everything that differs between environments or must change without a deployment is a parameter under `/backpack-space/<environment>/`:

| Parameter                                           | Kind                                                     | Read by                  |
| --------------------------------------------------- | -------------------------------------------------------- | ------------------------ |
| `maintenance`                                       | on or off, with an optional text key                     | all                      |
| `min-app-version`                                   | version                                                  | `config`, `game`         |
| `season`                                            | current season and its dates, if not taken from the data | `config`, `game`, `jobs` |
| `players-table`, `backpacks-table`, `actions-table` | names                                                    | those that use them      |
| `matching-phase`                                    | 1, 2 or 3                                                | `game`                   |
| `token-keys`                                        | secure string                                            | `session`, `game`        |
| `revenuecat-api-key`                                | secure string                                            | `game`, `webhook`        |
| `revenuecat-webhook-secret`                         | secure string                                            | `webhook`                |
| `dev-identity`                                      | exists only locally                                      | `session`                |

A Lambda reads its parameters at start and again at most once a minute, so a change such as the maintenance switch takes effect within a minute without a deployment. Standard parameters cost nothing.

## Local setup

| Piece               | Local                                                                                     | Cloud                   |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------------------- |
| HTTP                | a small Node server in `apps/backend/local` that calls the router                         | HTTP API and Lambda     |
| Handlers and domain | the same code                                                                             | the same code           |
| Database            | DynamoDB Local in a container, tables created by a script                                 | DynamoDB                |
| Table definitions   | one file in `apps/backend` that both the local script and the CDK code read               | the same file           |
| Settings            | a local file that is not committed, with an example file beside it                        | Parameter Store         |
| Sign-in             | development identity                                                                      | Game Center, Play Games |
| RevenueCat          | a fake in memory behind the same port, or RevenueCat's test store (DEV-04, to be checked) | RevenueCat              |
| Timed jobs          | a command that runs a job once                                                            | schedule                |

Commands: `npm run db` starts the container and creates the tables (`db:stop` stops it, `db:reset` also removes the data), `npm run backend` starts the local server, `npm run dev` starts database, backend and client together; `npm run seed` fills the opponent pool with bot backpacks and replaces the bot backpacks that were there (5 per bucket; `-- --launch` for the launch set of 50 per bucket, `-- --dry` only counts; generator in `apps/backend/src/seed/bot-pool.ts`). The table definitions are in `apps/backend/src/tables.ts`, the container in `apps/backend/local/compose.yaml`, the settings in `apps/backend/local/settings.json` (copy `settings.example.json`; without it the example is used). The client learns the address of the backend from a build setting.

Interface tests start the local server against DynamoDB Local and call it over HTTP, exactly as the app does. The same tests can be pointed at the test environment after a deployment.

## Cloud setup and rollout

- **Stacks.** One CDK app with one stack per environment, built from the same code with different settings. Proposal: test and production in the same AWS account with different name prefixes, to keep it simple and cheap; two separate accounts are cleaner and can be introduced later without changing the code.
- **HTTP API without a firewall in front at launch.** The HTTP API has its own request limits per route. A web firewall (AWS WAF) needs CloudFront in front of the API and has a fixed monthly cost. Proposal: start without it and add it when the logs show abuse. This differs from the first sketch in the review and is listed as open.
- **Request limits** (BE-06): limits per route at the HTTP API; limits per player come mostly from the rules themselves (one open run, one fight per round, an answer per round is computed once). The webhook route accepts only requests with the secret.
- **Rollout** (BE-13): a merge to the main branch runs the checks and then deploys to test. Production is deployed by a manual step that names the commit. GitHub signs in to AWS with a short-lived role, not with stored keys.
- **Order of a rollout:** tables and settings first, then the Lambdas. A change of a table or of a stored shape must be readable by the old and the new code, because both run for a moment.

## Logs and numbers

- **One line per request**, as JSON: time, request id (also sent back as `x-request-id`), route, player id, status, error code, duration, app version, simulation version. No names, no store identities, no backpacks, not the path of an unknown route. Event lines carry the same request id. Code: `apps/backend/src/http/router.ts` (request line), `apps/backend/src/domain/log.ts` (events and their fields).
- **One line per event that counts**: `run_started`, `fight`, `run_finished`, `purchase`, `credits_spent`, `credits_earned`, `refund`, `account_deleted`, `plausibility_rejected`, `result_mismatch`. These lines are the source of the usage numbers (BE-10) and of the reconcile command after a restore.
- **Alarms** (BE-11): error rate and response time of the API, failed Lambda runs, rejected webhooks, throttled database requests, and a cost alarm.
- Logs are kept for a set time (proposal: 90 days for request lines; the event lines needed for reconciling at least as long as the restore window).

## Account deletion and export

- **Export** returns the player's partition from `players` as a file, plus their entries in `actions`.
- **Deletion** removes the player's partition and lookup entry, deletes the customer at RevenueCat, and writes the id to the list of deleted accounts. The player's backpacks in the pool stay as opponents but lose player id, name and patch (they get a generated name), so nothing in them points to a person any more. Their `actions` entries expire on their own, or are deleted at once (open).
- What has to be kept by law about purchases is held by the stores and RevenueCat, not by us.

## What this means for the app

- `apps/client` gets an API client built on `packages/api`. It replaces `GhostOpponents` behind `OpponentSource` and the local profile in `src/profile.ts`.
- The local save of a run stays as a copy for the shop phase in progress; at start the app asks the server for the open run and trusts the server.
- The app shows the states from the error codes (UX-02).
- The client's season date check (`today()` in `src/profile.ts`) goes away; the date comes from `config`.

## Open

| Point                                                                                                      | Kind                |
| ---------------------------------------------------------------------------------------------------------- | ------------------- |
| What happens to an open run without a local copy (proposal: end it and book the known standing)            | needs designer      |
| Two simulation builds during a rollout, or a maintenance window                                            | technical           |
| Test and production in one AWS account or in two                                                           | technical           |
| Start without a web firewall                                                                               | technical           |
| Token lifetime (proposal 1 hour)                                                                           | technical           |
| How long `ROUND#`, `DONE#` and `actions` entries are kept                                                  | technical           |
| Which Capacitor plugins for Game Center and Play Games sign-in                                             | technical           |
| Whether RevenueCat can list a customer's Credits bookings (would make reconciling after a restore simpler) | technical, to check |
| Whether `actions` should be a table or files in S3, if the analysis turns out to be easier there           | technical           |
