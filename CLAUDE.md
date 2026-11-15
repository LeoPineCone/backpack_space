# Working on this repo

- Repo language is English: code, comments, data, docs, CLI output.
- `packages/core/src/` must stay free of Node APIs (no fs, no process) – the core runs in the client and on the server. Its own tsconfig has no Node/DOM types, so `npm run typecheck` catches violations. Node-only helpers go to `packages/core/node/`.
- A future client only replays what the core computes; it never decides battle outcomes.
- The core is deterministic: no Math.random, no clock reads. Randomness only via `Rng` with a seed.
- Game values belong in `data/*.json`, not in code. Item rules text is generated from the effect data (`describe.ts`), never written by hand.
- Items are maintained directly in `data/items/*.json` (no generator scripts). Every item and bag needs a picture brief in `data/item-art.json` (ends with "Accent: <palette colour>."). A new effect idea that the effect schema cannot express needs a schema + battle change first.
- Game words come from `data/glossary.json` (English for game and code, German for design talk); add a term there before using a new word in the game.
- After changes: `npm run validate && npm run typecheck && npm test`. After item changes also `npm run catalog`.
- No alcohol in the game.
- Not a clone: no names, characters or look of Backpack Brawl or other existing games.
- Tech stack is decided: TypeScript, PixiJS, Capacitor (same as backpack_race). The client lives in `apps/client` (PixiJS, placeholder symbols instead of art); it only shows and replays what the core computes and never decides a rule or a fight. `playground/` is a design tool, not product code.
