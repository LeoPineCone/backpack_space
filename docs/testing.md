# Testing

This document says how tests are written and run in this repo. It implements QA-01 to QA-08 in [requirements.md](requirements.md). If the two disagree, requirements.md wins and this file is fixed.

## Rules

1. **Code and tests come together** (QA-01). A change that adds or changes behaviour contains the tests for it in the same pull request. A bug fix contains a test that failed before the fix.
2. **Every pull request is checked automatically** (QA-02): `npm run validate`, `npm run typecheck`, the linter and `npm test`. A pull request is merged only when all are green.
3. **No test is skipped or weakened to get green.** A test that is wrong is fixed or removed in the pull request that explains why.
4. **Tests are deterministic.** No `Math.random`, no clock, no network, no test that depends on another test's leftovers. Randomness comes from `Rng` with a fixed seed; time is passed in or faked.
5. **Tests are English** like everything else: names, comments, messages.
6. **Test the behaviour, not the numbers of the balance.** Game values live in `data/*.json` and change often. A test must not break because an item got 1 more damage. Tests that pin exact balance numbers are limited to the reference fights (see below).

## Levels

| Level | What it tests | Runs where | Tool | Requirement |
| --- | --- | --- | --- | --- |
| 1. Unit | Functions and modules of the core, the backend handlers and the client logic that has no screen | Node, no network, no container | Vitest | QA-04 |
| 2. Interface | The backend through HTTP, with the real handlers, against the local database in a container | Node plus the local database | Vitest | QA-04, DEV-01 to DEV-03 |
| 3. Browser run | The client as a player uses it: start, one whole round, end of a run, one purchase. At most 4 runs. | Chromium and WebKit, against the local backend | Playwright | QA-05 |
| 4. Reference fights | The same fixed fights give the same result in Node, Chromium and WebKit | Node, Chromium, WebKit | Vitest and Playwright | QA-06 |
| 5. Phone checklist | What a browser cannot show: sign-in, purchase, safe area, speed, start without network | By hand on a real phone, before every release | Written list | QA-07 |

Most tests are level 1. A new test goes to the lowest level that can show the behaviour. A level 2 test is justified only when the wiring is the point: routing, input checks, session token, database access. A level 3 run is added only when a flow cannot be shown lower, and only after the limit of 4 is checked.

## Where tests live

| Code | Tests | Notes |
| --- | --- | --- |
| `packages/core`, `src/`, `data/` | `test/*.test.ts` (existing place) | Level 1. One file per subject (`run.test.ts`, `shop.test.ts`). |
| `packages/<name>` for a new package (backend, website) | `packages/<name>/test/` | Level 1. Inside the package, so it can be run alone. |
| Backend interface tests | `packages/backend/test/api/*.api.test.ts` | Level 2. Need the local backend and database (see below). |
| Browser runs | `e2e/*.e2e.ts` | Level 3 and 4. A Playwright config at the repo root. |
| Reference fights | `data/sim/reference-fights.json` (fixed seeds, builds and expected results) plus one test file that reads it | Level 4. One list, run in all three engines. |
| Phone checklist | `docs/release-checklist.md` | Level 5. Written when QA-07 is built. |
| Helpers used by several tests | `test/helpers/` | Builders for a run, a build, a fixed `Rng`. No logic of the game in a helper. |

File names: `<subject>.test.ts` for unit, `<subject>.api.test.ts` for interface, `<flow>.e2e.ts` for browser runs. Test names say the behaviour in a sentence: `it("refuses a purchase when gold is short")`, not `it("test buy 2")`.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Level 1 only. Fast, needs nothing running. This is what a developer runs all the time. |
| `npm run test:api` | Level 2. Starts the local database and backend, runs the interface tests, stops them. Exists from M1. |
| `npm run test:e2e` | Level 3 and 4 in Chromium and WebKit (Playwright, `playwright.config.ts`). Today: the reference fights (`e2e/reference-fights.e2e.ts`); client runs come in M2. Needs the browsers once: `npx playwright install chromium webkit`. |
| `npm run sim:reference` | Regenerates `data/sim/reference-fights.json` on purpose, after a change that alters fight results. |
| `npm run check` | `validate`, `typecheck`, lint, `npm test`. The same as the automatic pull request check. |

The test run on the pull request runs all levels that exist at that time. A level that needs a container or a browser runs in its own step, so a failure says which level broke.

## What a pull request must contain

At least:

- Tests for every new or changed behaviour, at the lowest fitting level.
- For a bug fix: a test that fails without the fix.
- For a new backend route: a level 1 test of the handler, a level 2 test of the route (success, refused input, missing or bad session token), and the input schema (BE-05).
- For a data change (items, heroes, recipes, rules): `npm run validate` passes. If the change alters a reference fight, the reference list is updated in the same pull request and the description says why.
- For a new screen or player action: it is in [ux.md](ux.md) first. A browser run is added only if it is one of the flows in QA-05.
- The result of `npm run check` is green. The description says which levels were run if more than `npm test` was needed.

A pull request without tests says in its description why none are needed (for example: documentation only, data text only). The reviewer decides if that holds.

## Rules per area

**Core.** Tests call the core as the client and the server do and never read private state. Anything random takes a seeded `Rng`. A test must also fail if the core starts to use a Node API; `npm run typecheck` already guarantees this for `packages/core/src/`.

**Backend.** A handler is tested without HTTP at level 1 with a fake for the database and for Apple, Google and RevenueCat. Level 2 uses the real handlers behind the local HTTP server (DEV-02) and the local database (DEV-03). The development identity (DEV-05) signs the test players in. Every test creates its own players and does not read the data of another test, so tests can run in any order. The local database is emptied or isolated per test file.

**Client.** Logic without a screen (state, formatting, mapping of server answers) is tested at level 1. Screens are covered only by the browser runs. The client never decides a rule, so there is no test of a rule in the client: the rule is tested in the core.

**Money.** Everything that moves Credits or checks a purchase (STORE requirements) has level 1 tests for each branch, including refund and a repeated message from the store.

## Reference fights (QA-06)

`data/sim/reference-fights.json` holds a small set of fights: build, seed, simulation version and the expected result (winner, rounds, remaining life). The set covers each hero, each effect kind at least once, a merge, and the longest fight. It is run in Node (`npm test`) and in Chromium and WebKit (`npm run test:e2e`). Any difference fails the build. When a data or core change alters a result on purpose, the list is regenerated with a command and the simulation version changes with it (CORE-03).

## Browser runs (QA-05)

Four runs at most, all against the local backend with the development identity:

1. Start of the app to the start screen.
2. One whole round: shop, placing, fight, result.
3. End of a run.
4. One purchase with the stand-in for the store (DEV-04).

Runs never wait for a fixed time; they wait for a visible state. They never depend on the balance: the fight outcome is set by a fixed seed from the backend's test mode, or the run accepts both outcomes. A run that fails twice for no code reason is a bug in the test and is fixed first, not retried forever. The browser runs are not proof for native parts (QA-07).

## Phone checklist (QA-07)

Before every release the checklist in `docs/release-checklist.md` is run by hand on a real phone. It contains at least: sign-in, a purchase and a refund with the real store test account, the safe area on the phone, speed on a weak phone, and the start of the app without network. The release is only made when every line is ticked or has a written reason.

## Dependencies and tools

- Test runner: Vitest (existing). Browser runs: Playwright, with Chromium and WebKit.
- Linter and formatter: ESLint and Prettier, one setup for all packages (QA-03).
- `npm audit` for serious findings runs in the pull request check (QA-08): `npm audit --omit=dev --audit-level=high`, as its own step. It covers what ships (app, later the backend). Findings in dev tools are checked by hand with `npm audit` and listed here with the reason they are accepted.

### Known findings in dev tools (state of 2026-11-18)

| Package | Advisory | Why accepted |
| --- | --- | --- |
| `picomatch` (all versions, through `vite`, `vitest`, `tinyglobby`, `typescript-eslint`) | GHSA-fc5q-39xc-vjpf, ReDoS through repeated extglobs | No fixed version exists. Only dev tools use it, and they match glob patterns written in this repo, never input from players or the network. Nothing of it ships in the app. Check again when a fix is released. |

Updated on 2026-11-18: `zod` 3 → 4 (GHSA-mrhx-c7xc-m3w5), `vitest` 2 → 5 (critical `tinypool` advisory), `vite` 6 → 8.
- A test tool is a dev dependency only. Nothing of it ships in the app.
