# Path distinctness measured by play style: Rook and Ysel differ, Quill and Venn do not (2026-11-16, nothing changed in the game)

Question (Ilja): "the paths of a hero deal their damage too alike" looks like design; extend the measurement. `pathDistinct` only compares the damage mix (weapon / pet / Burn / …), so two weapon paths count as the same even when one is fast and one is slow. New number **play style** (`pathStyle`, `styleDistance` in `src/sim/paths.ts`): six differences of two paths, each scaled so that 1 is a step a player notices, and the largest one counts: damage mix (0.35 as before), attacks per second and damage per attack (× 1.5), healed + shielded per fight (a quarter of the hero's health), share of damage from phase 3 on (15 points), share of the best item (10 points). Shown in `report:paths` (per pair, with the dimension), `baseline`, `balance:replay`, `balance:sweep` (per hero: the two paths most alike). Proposed target `pathStyle` ≥ 1. Baseline, 2 × 240 lobbies, seed 1 / seed 2:

| Hero | Pair | Play style | Largest difference |
|---|---|---|---|
| Rook | Overclocked guns / Shield fortress | 2.28 / 2.38 | protection (tempo 1.8) |
| Rook | Overclocked guns / Workshop | 1.14 / 1.37 | protection |
| Rook | Shield fortress / Workshop | 1.14 / 1.01 | protection |
| Ysel | Late ascension / Eclipse | 2.57 / 2.17 | late damage (tempo 1.6, protection 1.3) |
| Ysel | Burning corona / Eclipse | 2.10 / 1.76 | late damage |
| Ysel | Burning corona / Late ascension | 0.79 / 0.81 | tempo |
| Venn | Thorn wall / Hungry jungle | 0.86 / 1.02 | tempo |
| Venn | Poison garden / Thorn wall | 0.43 / 0.92 | damage per attack / tempo |
| Venn | Poison garden / Hungry jungle | 0.53 / 0.44 | best item / protection |
| Quill | Swarm / Well-fed pack | 0.65 / 0.73 | damage per attack / tempo |
| Quill | Big beasts / Well-fed pack | 0.57 / 0.57 | damage per attack / tempo |
| Quill | Big beasts / Swarm | 0.24 / 0.16 | none |

Reading: 5 of 12 pairs are clearly different on both seeds (all of Rook, Eclipse against the other two Ysel paths), although their damage mix is almost the same (0.04–0.25 of 0.35). So the old number was too strict for Rook and Ysel. It was right for Quill and Venn: Big beasts and Swarm play the same in every dimension (same attacks per second, same damage per attack, same share of the best pet), i.e. the bots end up with the same pets whatever the anchor says. Venn's three paths differ a little in tempo only; Poison garden / Thorn wall moves between seeds (0.43 / 0.92), so read both. This is a design question (which pets and plants a path owns, and what its anchor asks for), not a number question. `pathDistinct` stays for now; if `pathStyle` is accepted it can replace it.

# Three paths after the payoff pass: numbers are used up (2026-11-16, nothing changed)

Question (Ilja): tune the numbers of the new items for Shield fortress, Well-fed pack and Late ascension, where the most committed bots still lose. Baseline after the payoff pass, 2 × 240 lobbies. **No number was adopted.**

- `balance:propose --knobs path:<hero>/<path> --kinds …,open,pays` (one search per path): only small steps on side items; "going deeper pays" for Shield fortress +3.5 on the search seed, +0.5 on the check seed. Well-fed pack: one step (Glutton Toad cooldown).
- Larger converter steps by hand (Breach Ram per 8 Shield max 10, Siege Ram per 8 max 24, Ram Plate max 8; Glutton Toad 5 damage and cooldown 1.7, Trough Boar max 14; Dawn Needle per Power max 8, Zenith Lance max 16, Flare Catcher 4 Shield per Power), full run: Shield fortress +1.0 / +1.6, Well-fed pack +1.2 / +0.8, Late ascension +3.2 / +2.0 (late 41 → 44 %); Venn falls to 46 %, targets off 34 → 38.
- Only the pet and Power weapon steps, full run: Well-fed pack +1.8 / +1.4, Late ascension +1.9 / +1.1, Venn 47 %, targets off 34 → 39.
- "Going deeper pays" did not move beyond its noise in any of them (Well-fed pack +3.5 ±2.6 / +2.3 ±2.7; Shield fortress −2.1 / +4.6, the seeds disagree).

Reading: with all heroes at 48–52 % a step that lifts one path by 1–2 points pushes about as many numbers over a band edge as it brings in. The three paths are inside their win-share bands now; what is left (the deepest third of Shield fortress loses 7–8 points, Well-fed pack and Late ascension 3–6 with ±3) is not a number question. Candidates if it still shows in a playtest: fewer pure sources in these paths (turn one or two into items that also attack), or bots that stop buying sources once the build has enough.

# Path payoff built: converters, bodies, two rule changes (2026-11-16)

Question (Ilja, "all good proposals, go on"): build `docs/proposals/path-payoff.md`. Measured on 2 × 240 lobbies, seeds 1 / 2, with the new number **"going deeper pays"** (`pathPays`: win share of the third of a path's bots with the most of their build on the path, minus the third with the least; in `report:paths`, `baseline`, `balance:replay`, `balance:sweep`).

Built:
- **Shield fortress:** two ram weapons (Breach Ram common, Siege Ram rare: damage per own Shield); Ram Plate and Bastion Frame ram on every hit taken instead of by chance. Measured before: 1056 Shield gained per late fight and nothing that used it.
- **Well-fed pack:** two pets that strike when a starred food is used (Glutton Toad common, Trough Boar rare: damage per Power).
- **Late ascension:** two weapons that use Power twice (Dawn Needle common, Zenith Lance rare); Flare Catcher gives Shield per Power.
- **Overclocked guns, rule:** Overclock also refills Energy 3 % faster per stack (`rules.status.overclock.energyPct`). Measured before: 7.3 weapons of which 2 waited for Energy all the time (next worst path 0.6).
- **Hungry jungle, rule:** hero mod `overheal` (percent of healing above full health that becomes Shield): Terrarium Heart 50 %, Sap Tap 25 %. Mantraps and Hydra Bloom count pets in the backpack instead of enemy Toxin.
- Numbers by the tools (search per hero, core picked by hand, two full runs): Compost Bin Regen 1 → 2, Plague Blossom Jam 1 → 2, World Seed and Living Armor start Spikes 2 → 1, Strangler Fig Cryo 2 → 5, Master Blueprint damage 2 → 1, Plasma Welder 6–8 → 5–7, Nanite Swarm ram 1 → 2, Herd Heart Power 1 → 3, Glutton Toad 2 → 3, Nova Crown Cryo 2 → 1, Canticle and Solstice Engine Power per phase 1 → 2.
- First full ratings run with per-item dice on two seeds (`data/sim/ratings-meta.json` now exists, `ratings --only` works).

| | before (main) | after, seed 1 / 2 |
|---|---|---|
| Heroes | Venn 47, Rook 52, Quill 50, Ysel 50 | Venn 48 / 49, Rook 51 / 51, Quill 51 / 49, Ysel 50 / 50 |
| Overclocked guns, all / late | 47 / 38 | 48 / 48 and 51 / 48 |
| Shield fortress | 46 / 46 | 50 / 53 and 49 / 53 |
| Workshop | 57 / 64 | 52 / 58 and 49 / 55 |
| Hungry jungle | 41 / 35 | 44 / 44 and 45 / 44 |
| Well-fed pack | 42 / 38 | 48 / 44 and 43 / 38 |
| Late ascension | 45 / 37 | 47 / 41 and 46 / 40 |
| Largest gap between a hero's paths | 10–13 | 3–7 and 1–9 |
| Worst path against its open bot | −13 | −5 and −11 (Well-fed pack) |
| Target checks off (seed 1) | 33 of 108 (without the new number) | 34 of 120 (22 without the new number) |

Going deeper pays (seed 1 / 2, ±3): Hungry jungle +7 / +5 and Poison garden +6 / +1 now pay, Thorn wall +1 / +1, Workshop 0 / −2. Still costing: Shield fortress −7 / −8, Well-fed pack −3 / −6, Late ascension −3 / −6, Overclocked guns −8 / −2.

Still open:
- Shield fortress, Well-fed pack and Late ascension are now even with the other paths on average, but their most committed bots still lose. Next step there is more converter (numbers of the new items by `balance:propose --knobs item:…`) or fewer pure sources in the path.
- Well-fed pack differs between the seeds (48 / 43 %): not settled.
- Thorn wall late 60 / 55 %, Workshop late 58 / 55 %, Late ascension late 41 / 40 %.
- Every path is still at or below its open bot (−1 to −5 on seed 1). With bots that buy by rating this target may be too strict; "going deeper pays" is the sharper question.
- Path pull sweep not repeated yet with the new items.

# Proposal: make the weak paths pay (2026-11-16, not applied)

Question (Ilja, after the path-pull sweeps): let the tools propose numbers that make the weak paths pay. `balance:propose --knobs hero:<id> --kinds …,open --max-knobs 6` for each hero (7–10 min each, search on seed 1, check on seed 2), then full runs (bots shop again). **Nothing in `data/` changed; the core numbers stay frozen until Ilja decides.**

All 16 proposed changes together are not worth taking: targets off 33 → 34, Quill rises to 54 %, Ysel falls to 44 % in rounds 1–4 (Sun Shard Burn 2 → 1), Venn falls in rounds 5–8.

**Core of six changes that holds on both seeds** (full run, 2 × 240 lobbies; targets off on seed 1: 33 → 26, 10 brought on target, 3 pushed off):

| Item | Number | Now | Proposed | Path it serves |
|---|---|---|---|---|
| Strangler Fig | Cryo on hit | 2 | 5 | Venn Hungry jungle |
| Herd Heart | Power per starred use | 1 | 2 | Quill Well-fed pack |
| Canticle | Power per phase | 1 | 2 | Ysel Late ascension |
| Solstice Engine | Power per phase | 1 | 2 | Ysel Late ascension |
| Ram Plate | damage when attacked | 1 | 2 | Rook Shield fortress |
| Master Blueprint | damage on use | 2 | 1 | Rook Workshop (down) |

Change seed 1 / seed 2, paired: Hungry jungle +4.5 / +2.8 (41 → 45 %), late +9.2 / +6.4 (35 → 44 %); Well-fed pack +4.4 / +2.8 (42 → 47 %); Late ascension +2.1 / +1.8 (45 → 47 %), late +4.6 / +4.2 (37 → 42 %); Workshop −3.8 / −3.9 (57 → 53 %), late −6.0 / −5.3 (64 → 58 %); Venn overall 47 → 49 %, Rook 52 → 50 %, all heroes inside 48–52 %; gap between a hero's paths: Venn 10 → 7, Rook 11 → 8, Quill 13 → 8, Ysel 8 → 5.
Pushed off: Rook Overclocked guns 47 → 45 % (late 38 → 35 %), Thorn wall late 56 → 58 %, Thorn wall against the open bot +2 → +1.

**What numbers do not fix:** every weak path stays below its open bot (Well-fed pack −13 → −7, Shield fortress −11 → −9, Hungry jungle −8 → −6, Late ascension −7 → −5; Overclocked guns −10 unchanged). Small number steps close a third to a half of the gap. The rest is design: path items must reward being together (as Herd Heart does: its one step gave the largest gain), or the open-bot target is too strict for bots that buy by rating.

Patch: `out/proposals/pay-core.json` (`{"item":"strangler_fig","set":{"effects.0.n":5}}`, `herd_heart effects.0.n 2`, `canticle effects.0.n 2`, `solstice_engine effects.0.n 2`, `ram_plate effects.1.n 2`, `master_blueprint effects.0.n 1`). If adopted: numbers into `data/items/hero_*.json`, `npm run ratings -- --only <ids>`, `npm run catalog`, `npm run baseline`.

# How strongly should a path pull? Three sweeps (2026-11-16)

Question (Ilja, open since the path anchors): how strongly should a path pull the build? New tool `npm run balance:sweep` (one number at several values, every value a full run on the baseline's lobbies, bots shop again; about 3 min per value). No game number changed. Baseline of main, 2 × 240 lobbies, mean of seeds 1 and 2; * = at least two paired standard errors on both seeds.

| Knob | Values | Build on the path | Path against open bot (average) | Other |
|---|---|---|---|---|
| Bots' path liking (bots only; now 2) | 1 / 1.5 / 2 / 3 / 4 | 29 * / 40 * / 47 / 55 * / 60 * % | +1.5 * / −0.1 * / −4.2 / −7.8 * / −11.7 * | largest gap between the paths of a hero 2.7 / 9.0 / 12.7 / 15.7 / 20.6 |
| Shop lean to the anchor's path (`shop.anchorPathWeight`, now 1.5) | 1 / 1.5 / 2 / 3 / 4 | 46 / 47 / 48 / 50 / 50 % | −3.5 / −4.2 / −3.9 / −3.7 / −4.5 | heroes and paths unchanged |
| Hero's own items in the shop (`shop.heroOfferPct`, now 30) | 20 / 30 / 40 / 50 | 46 / 47 / 48 / 49 % | −3.5 / −4.2 / −3.3 / −3.3 | hero items in the build 35 / 47 / 57 / 66 %; Quill 44 / 50 / 56 / 61 %, Rook 55 / 52 / 49 / 46 %, Venn 49 / 48 / 46 / 44 % |

What this says:
- **The shop lean does almost nothing** between 1 and 4 (it only touches the hero's own items that carry a path). It is safe wherever it stands and is not the lever for this question.
- **More hero offers do not pull to a path.** They fill the build with the hero's items, make runs more alike (items two runs do not share: 88 / 86 / 83 / 80 %) and shift the heroes hard, because Quill's own items are stronger than the general ones and Rook's and Venn's are weaker. That gap is a balancing finding of its own.
- **What decides is how much the player (here: the bot) wants the path, and today wanting it more loses.** Every step of path liking puts more of the build on the path and makes the path bots lose more against the hero's open bot, most for Rook Overclocked guns and Shield fortress (−25 / −24 at liking 4), Quill Well-fed pack (−22), Hungry jungle and Late ascension (−15). Only Thorn wall, Burning corona, Swarm and Poison garden stay near the open bot. A path's items together are not stronger than the best general buys, so the open-bot target (≥ +2) cannot be reached by more pull: the paths need payoff (their items must reward being together), not pull.
- **Paths do not make runs the same.** Two runs of the same path share as few items as two runs without a path (86 % not shared) at every value; two paths of one hero differ a little more with more liking (86 → 91 %). The fear "too much pull, every run the same" does not show up in this range.
- The damage mix of the closest two paths of a hero stays the same (0.01) whatever the pull: distinctness is a matter of what the items do, not of how many are bought.

Reports: `out/reports/sweep-pathLiking.html`, `sweep-shop-anchorPathWeight.html`, `sweep-shop-heroOfferPct.html`.

Open (design decision): leave both shop numbers as they are; make the weak paths pay through their own items (numbers of path items, first real pass) and then set `pathCommit` to what a path that pays delivers. The bots' path liking stays 2 until then; it is a guess about players, and the win shares of single paths depend on it (see the liking column: Rook guns 54 → 37 %).

# Item strength, matchups and meta, picks (2026-11-16)

Third stage of the balancing tools (`docs/proposals/balancing-workflow.md`). No game number changed. All on the baseline of main (2 × 240 lobbies, seeds 1 and 2).

**Item strength in three views (`npm run report:strength`, 1 min).** Add one = the rating; remove one = builds that own the item fight again without it; regression = logistic model over all 92 160 baseline fights. The regression repeats between the two seeds with r = 0.95; remove one and regression agree with r = 0.77, each with add one only 0.52–0.54, so they do see something else. Two views agree on STRONG for 23 items: Holo Decoy, Scrubber Unit, Stasis Field, Titan Core, Glacier Cannon, Star Falcon, Sun Eagle, Celestial Chimera, Juggernaut, Plasma Welder, Gravity Well, Thornvine, Moon Melon, Briar Fortress, Strangler Fig, Ironbark Golem, Living Armor, Jungle Tyrant, Sun Shard, Ember Censer, Corona Staff, Ice Ferret, Cryo Sprayer. WEAK: Ancient Monolith. "Needs its build" (weak as a free extra, strong where used): Solar Panel, Plague Vault. 53 items are owned by under 2 % of the bots that could have them; weak items mostly hide there, because bots do not buy what rates low.

**Matchups and meta (`npm run report:meta`, 45 s).** Hero against hero 43–56 % (target 35–65 %), no hero beats all others: Rook beats Quill 56 % and Ysel 55 %, Ysel beats Venn 55 %. 37 % of the path table is rock-paper-scissors, the rest is plain strength. Meta share (new target 10–45 % per hero, agreed with Ilja as a blunder catcher): Venn 23, Rook 36, Quill 14, Ysel 26 % (seed 1 / seed 2 alone: Rook 32 / 38, Quill 19 / 12). Per path: Workshop 28 %, Burning corona 18 %, Thorn wall 16 %; Hungry jungle, Well-fed pack and Late ascension 1–2 % (hardly played), Overclocked guns 3 %.

**Free picks (`npm run report:picks`, now 1 min on all cores).** Hero items with three times the moments: ±3–5 points instead of ±6–9, all twelve inside their targets (gain 0.75–1.32 × median, best in its offer 40–62 %). General artifacts: Plague Vault +10.8 to Ancient Monolith +5.2 are fine; Wormhole Generator +1.7 and Dyson Fragment +0.7 are off (0.2 and 0.1 × median). With `--careful` (bots search their layout six times longer) they stay there: +2.4 and −0.8. So they are not only laid out badly, they are weak for the builds the bots make.

# Balancing tools: baseline, replay, proposals (2026-11-16)

Question (Ilja): which measuring tools are good, which methods can balance the different questions, and a repeatable flow for a baseline and for new or changed items, heroes and mechanics. Design and decisions: `docs/proposals/balancing-workflow.md`; how to use it: `.claude/skills/balancing/SKILL.md`. No game number changed in this pass.

Measured first (main, seed 1):
- A fight costs 0.55 ms, a lobby 1.46 s: 93 % of the time is bots shopping. The same two builds with other dice almost always give the same winner (p·(1−p) = 0.03): noise is which builds exist, not the dice.
- Bots never read damage or effect numbers when they shop. Stored builds that fight again with patched numbers ("replay") gave the same change as a full paired run for four path boosts of 25 % (for example Venn Hungry jungle +10.6 ±0.8 against +12.2 ±0.9, Rook Shield fortress +17.7 ±1.3 against +17.0 ±1.3), in 10 s on one core instead of 49 s on four.
- Bots do read cooldown (layout, Energy bookkeeping): one cooldown step made every bot of the hero drift to another build, without taking the item more or less often; replay +1.4 ±0.5 against full run +2.0 ±0.5.

Built: `npm run baseline` (2 × 240 lobbies stored with every build and fight, 3 min, 33 MB per seed in `out/`), `balance:replay` (patch file, paired change of every fight-level target on both seeds, self-check, `--full`), `balance:sense` (one line per number: about 1 s each on 60 lobbies, 4 s on 240), `balance:propose` (searches on seed 1, checks on seed 2, writes a patch, changes nothing). `npm run ratings` now runs on all cores (quick 20 s), every item has its own dice, and `--only a,b` re-measures just those items like the stored run: unchanged items get exactly the same rating again.

Baseline of main as it is (240 lobbies per seed, seeds 1 / 2): heroes Venn 47 / 48, Rook 52 / 52, Quill 50 / 49, Ysel 50 / 48 %; 33 of 108 target checks off on seed 1, mostly paths below their open bot, path spread, path distinctness, and the known paths (Workshop strong, Hungry jungle, Well-fed pack, Late ascension weak).

First try of the search, all 136 numbers of Venn's items as knobs (8.5 min; **not applied**, the core numbers are frozen): Strangler Fig Cryo on hit 2 → 5, World Seed Spikes 2 → 1, Plague Blossom Toxin 3 → 2, Queen Spore Toxin 2 → 1. Hungry jungle +3.5 ±0.3 (check seed +2.3 ±0.8), late rounds +8.2 ±0.9 (check +5.5 ±1.4), Thorn wall −1.5, Rook Workshop late −2.3 (check −1.4). It shows the tool separating one path from its hero, which hand tuning did not manage (see below), but 14 targets stay off with Venn's numbers alone, and a Cryo of 5 per hit needs a design look first. On the smaller quick baseline one late-round gain was +5.5 on the search seed and +0.6 on the check seed: only effects on both seeds count.

Open: the stored ratings were measured before the per-item dice; the first full `npm run ratings -- --seeds 1,2` will shift the heroes once and should start the first real pass. Stages 3–5 of the proposal (item strength in three views, matchup table with meta share, picks improvements, sweeps for numbers the bots read).

# Path anchors and free picks built (2026-11-16)

Question (Ilja): paths of one hero play alike; free picks must have no must-take and no useless item. Design: `docs/proposals/hero-paths.md`.

Built: `path` on every hero item, one anchor per path among the round-4 hero items (9 reworked), 5 new path items, shop leans ×1.5 to an owned anchor's path, bots without a fixed path commit with their anchor (committed bots value path items ×2, was ×1.5, and take their own anchor when shown), melee/ranged filters, 10 general artifacts reworked as puzzle pieces with far stars. New measures: path profile in report:paths, report:picks. Three tuning passes; numbers below after the third (ratings measured again each time).

**General artifacts (report:picks normal, seed 1; gain = points of win share over the rest of the run):**

| | before | after |
|---|---|---|
| strongest | Time Dilator +24, best in 80 % of its offers | Galactic Cookbook +8, best in 42 % |
| weakest | Star Forge / Plague Vault +2 | Dyson Fragment 0, Wormhole Generator +1, Star Forge +3 |
| best in its offer | 18–80 % | 19–44 % ✓ (≤ 55 %) |
| worst in its offer | 5–48 % | 22–52 % ✓ |

No general artifact dominates any more. Still weak: Dyson Fragment, Wormhole Generator, Star Forge (the far-star pieces: the bots place them poorly, players will likely do better). Ysel gains little from most of them (37 % of her offers without a good option).

**Hero items (round 4):** before −4 to +29 points, after +3 to +25. With 24 moments per hero the ± is 6–9 points, so single values move a lot between runs (Eternal Dawn +16 in one run, +4 in the next with almost no change). Measure them at precise before tuning them further.

**Paths (report:paths precise, seeds 1 and 2):** every hero overall 47–52 %. Each path now shows its mechanic in the profile (Rook fortress: Shield ram 17–18 %; workshop: count damage 11 %; Quill swarm: count damage 11 %; Venn: Toxin / Spikes / pets lead in the three paths; Ysel eclipse: cold damage 12 %), but no hero reaches the distinctness target (two paths ≥ 0.35 apart; Venn best with 0.11). Cause: bots still build only 28–65 % of their item cost from path items; the rest is general items that every path buys. Weak paths: Venn Hungry jungle 41 %, Quill Well-fed pack 42–44 %, Ysel Late ascension 43–45 %; strong: Rook Workshop 56–57 %. Most paths stay below their hero's open bot (the open bot takes the best anchor).

Open: how strongly a path should pull the build (more hero offers, a stronger anchor lean, items that count path items) is a design question for Ilja; the three weak artifacts.

# Measuring tool checked (2026-11-16)

Question (Ilja): optimising only pays if the measuring tool is reliable. Results:
- **Noise was understated.** The ± in report:paths was taken over single fights; fights of one bot (and bots of one lobby) are not independent. The same report on another seed moved a path by up to 5 points. Now the ± comes from blocks of lobbies; `npm run report:selftest` compares two independent runs (root mean square of z 1.1 at quick, 1.4 at normal: honest, at most slightly optimistic). Rule of thumb for one path: ±2 points at precise, ±4 at normal.
- **Paired comparison.** `--baseline` compares with an earlier run on the same lobbies; a change is then measured to about ±1 point at precise. Example: Gravity Well's Strip 14 → 10 changed no fight at all (enemies rarely hold more than 10 buff stacks), which only a paired run shows for sure.
- **The tool sees real changes.** Self-test: the hero items of one path 25 % stronger → that path rises by 8 standard errors (normal). But the other paths of the same hero rise as much or more: paths share most of their hero items, so number changes move the whole hero, not one path against the open bot.
- **Bot ratings** measured again (average of seeds 1 and 2, normal). Two seeds agree with correlation 0.84; the old ratings agreed about as well, so they had drifted little.
- Lobbies run on all processor cores (same result, 2–4× faster).

Paths at precise accuracy, seed 1, new ratings (wins all rounds / rounds 9–12 / vs open bot):

| Hero (overall) | Path 1 | Path 2 | Path 3 | open |
|---|---|---|---|---|
| Venn 48 % | Poison garden 51 / 48 / +3 | Thorn wall 49 / 50 / +2 | Hungry jungle 43 / 39 / −5 | 48 |
| Rook 52 % | Overclocked guns 50 / 45 / −3 | Shield fortress 49 / 51 / −4 | Workshop 55 / 61 / +2 | 53 |
| Quill 52 % | Big beasts 52 / 46 / −1 | Swarm 55 / 49 / +3 | Well-fed pack 48 / 40 / −4 | 52 |
| Ysel 50 % | Burning corona 50 / 55 / −3 | Late ascension 49 / 50 / −4 | Eclipse 47 / 53 / −6 | 53 |

All heroes are within 48–52 %. Still off: Workshop too strong late, Hungry jungle and Well-fed pack weak late, most paths below the open bot. One more number round (Gravity Well, Venn pet cooldowns, Banquet Trough Power) was measured paired and dropped: no effect, or the whole hero moved instead of the path. Paths need items that only pay off for a committed build (see the hero-paths proposal).

# Item sizes follow the thing (2026-11-15)

Decision (Ilja): weapons and pets are larger than fruit and snacks; weapons cover 2 cells or more, one cell is rare. Four weapons and seven pets grew to 2 cells, ten foods shrank to 1 (list in `.claude/skills/item-design/SKILL.md` history / PR #14). Item ratings measured again, full reports in `docs/reports/` (normal accuracy, seed 1).

| Heroes overall (Venn, Rook, Quill, Ysel) | seed 1 | seed 2 |
|---|---|---|
| Before the size change | 50 / 44 / 50 / 56 % | – |
| Sizes changed, ratings measured again, hero rules unchanged | 57 / 46 / 44 / 54 % | 57 / 40 / 43 / 57 % |
| With the hero rule changes below | 50 / 49 / 48 / 52 % | 51 / 44 / 49 / 55 % |

Smaller food helped Venn, larger weapons and pets cost Rook and Quill backpack room. Hero rules changed to answer that (all in `data/heroes.json`):

- Venn: organic items 20 % faster (before 25 %).
- Rook: mechanical items 34 % faster (before 26 %).
- Quill: unchanged in the end (see below).

## Pets attack without Energy (decided with Ilja, 2026-11-15)

Weapons need Energy, animals do not: all 45 pets that deal damage have `energy` 0 (`validate` checks it). The Energy discount tried for Quill is gone again and her pets are back at 25 % faster. Ratings measured again.

| Heroes overall (Venn, Rook, Quill, Ysel) | seed 1 | seed 2 |
|---|---|---|
| Pets without Energy | 48 / 46 / 50 / 55 % | 50 / 45 / 50 / 53 % |

Quill's late game recovered (46 % in rounds 9–12, before 39–43 %). Still off: Quill is strong in rounds 5–8 (55–59 %), Rook weak there (41–42 %), Ysel strong late (58–60 %); Venn wins only 34 % against Ysel (target at least 35 %). Fight length, longest fight and Supernova share are within their targets.

# Melee, ranged and Energy (2026-11-15)

Decision (Ilja): weapons are melee or ranged; Spikes hurt both for now. Every attack costs Energy, which refills at a fixed rate; items can give Energy. Goal: no weapon spam, builds interlock more. Full reports in `docs/reports/` (normal accuracy, seed 1, ratings measured again).

## What changed

- Every weapon has `range` (66 melee, 59 ranged, read from the item and its picture brief) and `energy` (cost per attack, about 1 + 1.5 × cooldown, 2–7). Rules: `energy` max 20, start 20, refill 12 per second. A ready weapon without the Energy waits; a miss costs Energy too.
- New effect parts: `do: energy`, `mod.energyRegen` (hero), `mod.energy` (cost of starred weapons). 29 items give Energy or make weapons cheaper (list in docs/concept.md); Rook, Quill and Venn have some in their own pools, Ysel none (her damage hardly needs Energy).
- Bots count Energy: another weapon is worth less once the weapons need more Energy than comes in, Energy items are worth more then.
- First measurement with refill 5–10: bots kept 7–8 weapons late, those waited 40–85 % of the time, fights ran 28–32 s and Rook and Quill (weapon heroes) fell to 33–37 %. Refill 12 and two data changes brought it back: Rook's and Quill's own weapons cost 1 less (Quill's rare pets excepted), and hero health is lower late, because weapons deal less damage over a fight now. Health per round is now even steps (decided with Ilja): 100, 150, 200, 250, then +100 per round up to 1100 (before 100, 145, 195, 255, 400 … 1220). The shop shows the hero's health for the coming fight (round base plus items) and says the round's base at the start of each round.

## Measured

| | Before (main) | After |
|---|---|---|
| Weapons in a backpack, round 12 | 7.7 | 6.5 |
| Weapon time spent waiting for Energy, round 4 / 8 / 12 | – | 1 / 9 / 14 % (a quarter of the round-12 backpacks wait more than 25 %) |
| Fight length, Supernova share | 19–23 s, 5–20 % | 20–23 s, 11–16 % |
| Heroes overall (Venn, Rook, Quill, Ysel) | 49 / 45 / 51 / 54 % | 50 / 44 / 51 / 56 % |
| Hero against hero, all stages | Ysel beats Venn 61 %, rest 44–57 % | Ysel beats Venn 64 %, Venn beats Rook 58 %, Rook beats Quill 58 %, rest 42–54 % |

Energy hits weapon heroes (Rook with his speed bonuses, Quill's pet herd) and helps heroes that win with Burn and Toxin (Ysel, Venn), as expected: damage that does not cost Energy becomes worth more. Ysel ends slightly above 50 % against each other hero (51–52 % against Rook and Quill is within the noise) and is strong late (64 % in rounds 9–12); Rook stays a little weak (44 %, early game 44 %, as before). Each new rating measurement moves a hero by up to ±5 points, so single numbers are rough.

## Open

- Spikes only against melee (and something against ranged) once the simple start has been played.
- Ysel late and Rook early, if they hold up in playtests. Hero rules unchanged (they need Ilja's okay).
- Recipe report: Dynamo and Banquet Trough (both got Energy) now show as too strong; Energy numbers per item are a first guess.

# Hero synergies and matchups (2026-11-15)

Question from the design: equal win shares matter less than heroes whose rules and items visibly interlock, builds that grow together round by round, and matchups that look like rock-paper-scissors rather than one hero beating everybody. New report `npm run report:synergy` (full output in `docs/reports/synergy.txt`) measures three things: hero against hero (mirror included) at rounds 4, 8 and 12; path against path (12 paths, rounds 8 and 12); and per hero and round how many items are linked, how much the hero's own rules are worth (same fights with the hero rules off) and how much the item-to-item effects are worth (same fights with them off).

## Before

- **Rook beat every hero** (58 % on average, 61 % against Quill, 58 % against Ysel). His Workshop path won 68 % against the other heroes' paths and beat every single one of them.
- **Ysel's own rule did not reach her items.** Power per star phase adds to weapon hits, but none of her items read Power, and her kit was worth only +5 to +6 points from round 8 on (other heroes +19 to +30). Her linked share stayed flat (68 % → 64 %) while the others grew.
- Weak paths: Quill's Well-fed pack 37 %, Venn's Hungry jungle 42 % against other heroes.

## What changed (item values and synergies only)

- **Ysel: Power feeds Burn and Shield.** Ember Censer adds Burn per 2 Power, Sacred Flame's phase Burn is 2 + 1 per Power, Hymn Scroll and Litany give Shield per Power (flat part lowered). The hymn now runs through the build: Power → Burn → Solar Dagger and Twin Suns, or Power → Shield in the Eclipse path.
- **Venn: mantraps feed on poisoned prey.** Venus Mantrap, Giant Mantrap and Jungle Tyrant heal less flat and more per Toxin on the enemy, which ties Hungry jungle to the Toxin core.
- **Quill: a fed herd hits harder.** Banquet Trough gains Power on use, Kibble Sack with a 40 % chance; Power adds to every pet hit.
- **Rook: Workshop toned down.** Assembly Core +2 damage / +20 % speed to crafted stars (was +3 / +30 %), Master Blueprint +15 % / +1 (was +20 % / +2).
- **Rook: merging the start no longer makes him weaker.** Plasma Welder (Welding Arm + Scrap Metal) had 3–5 damage, less than the Welding Arm alone (5–7, raised in the third pass), and lost Scrap Metal's Shield. Now 6–8. Rook in rounds 1–4: 38 % → 47 %.

## After

| | Before | After |
|---|---|---|
| Dominance | Rook beats all three (55–61 %) | Rook still ahead of all three, but narrowly against Venn (53 %, 60 % against Quill, 57 % against Ysel) |
| Other matchups | – | Quill beats Ysel 56 %, Ysel beats Venn 56 %, the rest 47–51 % |
| Hero average against the others | Venn 47, Rook 58, Quill 48, Ysel 46 % | Venn 46, Rook 57, Quill 50, Ysel 49 % |
| Paths against other heroes | 37–68 % | 41–60 % (Workshop 60, Poison garden and Hungry jungle 41) |
| Linked items, round 2 → 12 | Venn 40→74, Rook 46→81, Quill 61→73, Ysel 68→64 % | Venn 44→80, Rook 48→85, Quill 64→81, Ysel 72→75 % |
| Synergy worth, round 12 | Venn +18, Rook +25, Quill +33, Ysel +21 | Venn +23, Rook +27, Quill +23, Ysel +23 |

Every hero's build now grows together over the run, and the item-to-item effects are worth 23–27 points at the end for all four. Lobby win shares (report:heroes): Venn 46, Rook 49, Quill 54, Ysel 49 % overall. Without the Plasma Welder fix nobody beat all others (Rook 50/58/53 %); the fix brings Rook's early game up and tips him slightly ahead again, which the design accepts (a hero may be a bit stronger).

## Still open (needs a design decision)

- **Ysel's own rule stays small late:** kit worth +14 early, +5 from round 8 on. Variants of the rule, measured (not applied, a hero rule change needs a decision):

  | Ysel's rule | Ysel overall | kit worth round 2 → 12 | against Venn / Rook / Quill |
  |---|---|---|---|
  | now: 1 Power per phase | 49 % | +14 → +5 | 56 / 44 / 47 % |
  | + 1 Power at fight start | 54 % (49 % on seed 2) | +24 → +9 | 62 / 49 / 51 % |
  | + 2 Power at fight start | 59 % | +30 → +11 | 67 / 53 / 55 % |
  | 2 Power per phase | 58 % | +28 → +10 | 66 / 52 / 54 % |
  | + Power per 2–3 accessories | 62–68 % | +30–40 → +15–17 | 73–81 / 56–61 / 58–62 % |
  | + 2 Power when Collapse begins (and +1 at Red Giant) | 49–51 % | +16–18 → +5–6 | no change |

  **Decided with Ilja (2026-11-15): +1 Power at fight start**, now in `data/heroes.json`. Measured with it: Ysel 54 % in lobby fights (55 / 49 / 58 % by third), kit worth +24 → +9; against Venn / Rook / Quill 62 / 49 / 51 %. Rook no longer beats Ysel but is still at or above 52 % against everyone; Venn is now the weakest (44 %) with 37 % against Ysel.

  Power is flat damage on every weapon hit, so any extra Power lifts the early game most; Power late in the fight changes nothing because most fights end before Collapse (24 s). The only variant near the target is +1 Power at fight start, and even that mostly helps early.
- Rook mirror fights land at 45–46 % for the attacker, the other mirrors at 49–51 %: Rook's Shield-on-hit start may favour the defender slightly.

## Venn (after Ysel's change)

With Ysel's start Power, Venn was the weakest hero: 44 % in lobby fights, 39 % in rounds 5–8, Thorn wall 41 %, 37 % against Ysel. Changed (items only):

- **Poisoned thorns:** Thornvine (25 %), Living Armor and Ironbark Golem (30 %) and Briar Fortress (40 %) inflict 1 Toxin when Venn is hit. Thorn wall now feeds the same Toxin as the rest of the garden, and the Toxin readers (Carnivorous Orchid, Hydra Bloom, the mantraps) profit from it.
- **Faster meals:** Moon Melon cooldown 3.5 → 2.8 s, Nectar Flask 4.5 → 3.8 s, so Venn's own rule (every meal spreads Toxin) fires more often.

Result: Venn 49 % in lobby fights (52 / 47 / 49 % by third), all three paths carry (Poison garden 48, Thorn wall 49, Hungry jungle 46 %). No hero beats all others any more: Venn 49 % against Rook, 55 % against Quill. Venn against Ysel stays at 39 %: Ysel's phase cleansing (Hymn Scroll, Litany, Comet Rosary) removes Toxin, a counter that fits the rock-paper-scissors picture and is inside the duel target (35–65 %).

# Findings of the third balance pass (2026-11-15)

Measured with `npm run report:all` at normal accuracy; full reports in `docs/reports/`. Goals of this pass: bots merge by the player's rules, set and measure the star clock, and check that no hero and no recipe chain dominates. Targets are now data (`data/sim/targets.json`) and the reports print an OK / OFF line per target.

## What changed

- **Bots merge like players.** Before, a bot combined the moment it owned all inputs, one fight earlier than a player can. Now it lays the inputs of every recipe it owns next to each other (part of the layout score), fights with the separate items and merges after the fight (`botMerge`). It never locks. 1.9 times per run an owned recipe does not fit together before the fight (mostly 3-input recipes).
- **Rook lost the most from that:** his start (Welding Arm + Scrap Metal) now fights round 1 unmerged; he won 7 % of round 1 and 38 % overall. Re-tuned: Welding Arm cooldown 2.0 → 1.6, damage 4–5 → 5–7, Shield per hit 1 → 3; his speed bonus for crafted items 18 → 25 %, for mechanical items 20 → 26 %; gold per merge 2 → 3.
- **Recipe results that won far more often than the same hero without them** were weakened: Arc Forge (cooldown 1.2 → 1.4), Plague Blossom (Toxin 4 → 3), Storm Driver (damage 16–20 → 14–17), Gravity Well (strip 24 → 18, Shield 10 → 8), Ghost Shroud (Jam 7/3 → 5/2), Total Eclipse (Jam 4 → 3, Shield 17 → 11), Living Armor (Shield 50 → 40, Regen 3 → 2).
- **Reports:** `report:battles` shows in which star phase fights end and how long the Supernova lasts, per hero too; `report:recipes` has a new section "Does a recipe dominate?".

## Where the draft stands

| Question | Target | Result |
|---|---|---|
| Fight length | 18–25 s average, longest ≤ 45 s | 19–23 s, longest 40–45 s. OK |
| Where fights end | – | Calm 1 %, Flare 30–38 %, Red Giant 34–43 %, Collapse 14–17 %, Supernova 5–20 % |
| Supernova reached | 5–20 % of the fights | 17–20 % in rounds 1–4, 5–10 % later. At the edge |
| Supernova length | 9 in 10 over within 10 s | 5–10 s, average 3–6 s. OK |
| Heroes overall | 45–55 % | Flora 52, Rook 51, Quill 51, Ysel 44 |
| Heroes per third of the run | 45–55 % | OFF: Flora strong early (61 %), Quill strong in rounds 5–8 (60 %), Ysel weak in rounds 5–8 (39 %), Rook strong late (59 %) |
| Hero against hero | 35–65 % | 39–64 %. OK |
| Paths | several per hero | Flora 3 of 3 carry, Rook 2, Quill 2, Ysel 3 |
| Crafting | – | 10.2 merges per run; never combining wins 46 % against 54 % |
| Runs | – | 11 % survive all 12 rounds, 7.6 rounds on average |

## Does a recipe chain dominate?

No single chain. The most made results (not counting the start item upgrades, which every run of a hero is meant to make) are Plague Blossom (Flora, 58–65 %), Arc Forge (Rook, 57 %), Canticle (Ysel) and Guard Hound (Quill, about 50 %). After weakening, Plague Blossom wins only 10 points more than Flora without it; Arc Forge still 9–15 points.

The "lift" measure (win share while holding a result, against the same hero in the same round without it) is honest about one thing only: which results stand out. Its top list changes from sample to sample (Total Eclipse, Ghost Shroud and Living Armor came up in all three samples and were weakened twice), and a holder is also a bot whose shop went well. Read a lift above about 15 points in two samples as "too strong", not a single one.

## The star clock in numbers

Kept as it was, now measured and written into `docs/concept.md`: Calm, Flare, Red Giant, Collapse 8 s each, Supernova from 32 s with 3 % of maximum health per second plus 1.5 points each second (30 % after 5 s, 66 % after 8 s). The hero ahead when it begins wins about 9 in 10 of those fights. Ysel, who takes half, reaches it in only 6 % of her fights (others 10–16 %) but wins 66 % of those; her Supernova resistance hardly ever matters. Quill wins only a third of her Supernova fights.

## Still open

- **Hero curves** (see table). The heroes are being redesigned, so these were not tuned further.
- **Ysel and the Supernova:** her identity says "long fights", her builds end fights early. A question for the hero redesign.
- **Early rounds reach the Supernova more often** (17–20 %) than late ones (5–10 %). Decided with Ilja (2026-11-15): it stays that way.

# Second balance pass (2026-11-15, earlier the same day)

Measured with `npm run report:*` at normal accuracy; the full reports are in `docs/reports/`. This pass had three goals: longer fights, more hero items, and an answer to "does a hero win in one way or in several?".

### What changed

- **Longer fights.** All healing, Shield and bonus health on items went up by 40 %, hero health by 10–20 %, and 24 general sustain items were added (healing, cleansing, Shield, Regen; 16 in the shop, 8 crafted).
- **Bigger hero pools.** Every hero got 9 more shop items and 6 more crafted items (35 items per hero now, 384 in total, 151 recipes). They are built as a second and third path, and every start weapon now has two competing upgrades.
- **Paths.** Each hero lists three designed paths in `data/heroes.json`. Balancing bots commit to one of them (three of four bots; the fourth plays open). The new report `npm run report:paths` compares them.
- **Hero kits re-tuned** for the longer fights: Rook's mechanical items are faster, Quill's pets heal her when they act and add health, Flora's organic bonus and Ysel's late-phase speed bonuses are smaller.
- **Shop rebuilt** (after the pass, decided with Ilja): 6 offers instead of 5, at most one bag per roll, a weight per item, more offers of the types the backpack already holds, and offers can be pinned for later (any number). See "The shop" in `docs/concept.md`.
- **A runaway effect removed.** Three Flora items gained Spikes every time she was attacked. In longer fights that stacked without limit and made up half of Flora's damage in every path. They now gain Spikes at the start or per star phase.

### Where the draft stands

| Question | Result | Before |
|---|---|---|
| Fight length | 23–24 s in rounds 1–4, 20–21 s from round 5 on (80 % of the fights between 11 and 39 s). | 18 s, falling to 13–14 s |
| Supernova | Reached in 19–23 % of the fights in rounds 1–4, 9–12 % later. The Red Giant phase (from 16 s) is now seen in most fights. | 8 %, then 1 % |
| Heroes | Win share 47–54 %: Ysel 47, Flora 50, Rook 50, Quill 54. Hero against hero between 41 and 60 %. By part of the run: Quill is strong in rounds 5–8 (63 %), Ysel is weak there (43 %). Measured again after the bench became loose items with a limit of 6 (was 4): no change beyond the usual noise. | 45–56 % |
| Damage sources | Weapons 56–64 %, Toxin 11–17 %, Burn 8–13 %, Spikes 2–10 %, direct 3–7 %. | Weapons 64–68 % |
| Items | 225 of 362 priced items are worth between half and one and a half times their price; 33 are clearly too strong, 2 clearly too weak, 102 are unclear at this sample size. | 178 of 278 |
| Placement | A build laid out by the bot wins 8–13 points more than the same items laid out at random. | 11–16 |
| Crafting | Bots that never combine win 45 % against 61 %. 11.3 combinations per run; 49 % of the runs reach chain step 2, 2 % step 3. | 37 / 63 % |
| Runs | With 4 lives, 11 % of the runs survive all 12 rounds; a run lasts 7.6 rounds and wins 3.8 fights on average. | 10 % |

### One way to win or several?

Short answer: every hero has three paths that win about equally often, but the paths of a hero still do damage in the same way. They differ in defence, tempo and items, less in how the enemy dies.

| Hero | Win share of the paths | How they differ in the fight (rounds 9–12) |
|---|---|---|
| Flora | Poison garden 53 %, Thorn wall 53 %, Hungry jungle 50 % | The most mixed damage of all heroes: Toxin 44–48 %, weapons 24–32 %, Spikes 13–24 %. The paths shift the mix by about 10 points, not more. |
| Rook | Workshop 51 %, Overclocked guns 47 %, Shield fortress 40 % | Always 72–75 % weapon damage. The difference is defence: the fortress blocks or heals 110 % of Rook's health per fight (25 s fights), the guns 45 % (19 s). |
| Quill | Swarm 56 %, Big beasts 54 %, Well-fed pack 46 % | Always 80–83 % weapon damage through pets. The bots hardly follow the paths (18–34 % of the build's cost is path items), so this is the weakest evidence. Well-fed pack drops to 41 % late. |
| Ysel | Eclipse 45 %, Late ascension 43 %, Burning corona 42 % | Weapons plus Burn in every path (Burn 30–43 %). Eclipse is the defensive one, Late ascension the fastest (17 s). |

What this means:

1. **No path is a trap and none is the only choice.** Within a hero the paths are 3–11 points apart; only Quill's Well-fed pack and Rook's fortress are clearly behind the hero's best.
2. **Mechanically the heroes are still narrow.** Rook and Quill win by weapon damage whatever they build. A real second way to win needs a second damage channel in the pool (for example Rook: direct damage from Overclock stacks as a main source; Quill: pets that poison or burn) or a win condition that is not damage (outlasting into the Supernova with a resistant build).
3. **Winning through the Supernova is not a plan yet.** Only 9–12 % of the late fights reach it, and the hero ahead at that moment wins 83–97 % of them anyway.
4. **Hero against hero is closer than before** (41–60 %, before 29–65 %).

### Did the new shop help?

A little. With 6 offers the bots reroll less (0.1–0.7 times per round instead of 0.3–1.0) and still fill the backpack (45 bag cells in round 12). The share of path items in the final builds did not move beyond noise (for example Rook 63 / 52 / 59 %, Quill 26 / 18 / 34 %): the bots commit weakly, and Quill's three paths all consist of pets, so "more of what you own" cannot tell them apart. Whether a human can build a path on purpose is a question for the browser preview, not for these bots.

### Still open

- **Hero curves.** Quill is too strong and Ysel too weak in rounds 5–8. The balance moves by several points whenever the item ratings are measured again, because the bots then buy differently. Expect a few more "change, measure items, measure heroes" rounds.
- **33 items are clearly too strong**, many of them the start weapons and their first upgrades (by design the best buys early) and several new crafted hero items (Thorn Pod, Twin Suns, Guard Hound, Living Armor, Plague Blossom). See `STRONG` in `docs/reports/items.txt`.
- **4 lives are few for 12 rounds.** Only 11 % of the runs see round 12.
- **The three-step capstones are trophies.** Bots make them in about 2 % of the runs.

### How to continue

```
npm run report:items -- --write-ratings   # after item changes, so the bots know what is good
npm run report:heroes                     # are the heroes even
npm run report:paths                      # does every path of a hero win
npm run report:all                        # everything into out/reports/
npm run play:ghosts                       # fresh opponents for the browser preview
```

One pass takes about six minutes at normal accuracy.

### Limits of these numbers

- Bots combine as soon as they own all inputs and do not plan chains, bag layouts or counters. Chain depth and bag bonuses are lower bounds.
- A bot "commits" to a path by valuing its items 50 % higher. It does not plan the path's recipes or layout, so a human will play a path more purely than the bots do.
- Item values are measured by giving a typical build of the item's round one extra copy for free. Items that only shine in a dedicated build (pet counts, phase builds) look weaker than they are.
- All opponents are bots of the same kind. A dominant human strategy can still exist.
