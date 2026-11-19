# Website

The game's website (WEB-01 to WEB-06): a static site in `apps/web`, built from templates and language files. It advertises the game, holds imprint, privacy policy and terms of use, and the support contact. Built 2026-11-18 (#82 to #84); hosting at AWS comes with the cloud setup (#56).

## Pages

| Address | Page |
|---|---|
| `/` | picks the visitor's language (English otherwise) and forwards |
| `/<lang>/` | landing page: name, tagline, store buttons, how a run goes, the four heroes with their pictures, "fair to play" |
| `/<lang>/support/` | support address; how to delete the account (in the game, or by a request to the support address; the website deletes nothing itself, ACC-08) |
| `/<lang>/imprint/`, `/<lang>/privacy/`, `/<lang>/terms/` | the legal pages; the app opens privacy and terms from its settings (`VITE_WEBSITE_URL`) |

## How it is built

- `npm run web` builds the site into `out/web` and serves it at `http://localhost:5190`; `npm run web:build` is the production build.
- Templates: `apps/web/src/pages.ts`; build: `apps/web/src/build.ts`. Colours come from `data/theme.json` (CSS variables named like the UI jobs), fonts and pictures are copied from the game (`apps/client/src/fonts`, `apps/client/art`). Hero names, titles and focus come from the game's language files, so they never differ from the game.
- **Nothing from other servers** (WEB-06): no web fonts, no scripts, no trackers. A test fails when a page loads anything that is not its own file.
- **Languages** (WEB-05): one file per language in `apps/web/locales/<lang>.json`, English is the source. A new file is a new language; a test fails when a file misses a key.
- **Placeholders:** a text or a fact (`apps/web/site.json`: store links, support address) written as `[[TODO: what is missing]]` shows marked in red on the page. The production build stops while one is left, so a placeholder cannot go live by accident.

## Still open

- The legal texts and the provider (#93, #94), the support address (#93), the store links (#106), the domain (#95).
- Hosting behind a CDN at AWS (#56).
