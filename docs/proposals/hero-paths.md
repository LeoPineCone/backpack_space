# Proposal: paths that play differently, anchored by the hero item

Status: **decided and built 2026-11-16** (Ilja: "ja"). The data follows this document; numbers are first drafts set by measurement (`report:paths`, `report:picks`, results in `docs/findings.md`). Built differently from the first draft: the Swarm anchor is the reworked Ancient Egg (no new artifact), so 9 hero items were reworked and 5 shop items added.

Decided by Ilja (2026-11-16):
- The round-4 pick stays **two of three, at random**, so every run brings its own luck.
- The shop may lean a little towards the chosen path, but must not force players into it.
- The round-8 special does **not** follow the path. The general artifacts should each bring a small mechanic of their own instead, also through star patterns that reach further than the neighbours and through type filters (melee weapon, pet, food).
- The new main sources per path (Shield ram, crafted-count damage, feeding Power, cold damage) fit the heroes.

## The problem

`npm run report:paths` (see `docs/reports/paths.txt`) shows that the four heroes play differently from each other, but the three paths of one hero play alike:

| Hero | What the report shows |
|---|---|
| Rook | all three paths deal 71–77 % of their damage with weapons; they differ only in how much they heal and shield |
| Quill | every path deals 85–88 % "weapon" damage (pets count as weapons), and only 20–40 % of the final build belongs to the path |
| Venn | Toxin is about half the damage in every path; only Thorn wall adds its own accent (Spikes) |
| Ysel | the most varied: Burn or weapons lead, Eclipse is clearly more defensive, but Eclipse has no damage of its own |

## Why it happens (findings from data and code)

1. **The hero item after round 4 does not pick a path.** Two of the three signature artifacts are shown at random, and most are generic or belong to two paths at once: `terrarium_heart` (organic speed + health) and `master_blueprint` (crafted buff) belong to none; `nova_crown` to all three Ysel paths; `perpetual_engine` and `world_seed` to two. Bots pick the artifact by worth, not by path.
2. **Paths have no damage source of their own.** Rook's three paths all have to kill with weapons; nothing in Shield fortress or Workshop turns Shield or crafting into damage. Quill's Well-fed pack and Venn's Hungry jungle have no damage item of their own either.
3. **Path membership is guessed from broad tags.** A path's `focus` matches tags, buffs and actions. Almost every Rook item gives Shield, so `fortress` matches 22 of 34 Rook items; `weapon` in Overclocked guns matches every weapon in the game; three Venn paths all match `heal`/`toxin` side effects. The bot's path liking and the report's "path items" are therefore blurry.
4. **Few path offers in the shop.** 30 % of offers come from the hero pool, 12 of the 32 non-artifact hero items are recipe results (never sold) and two are start items, and the rest is split over three paths: roughly one offer for your path every two rolls. Bots fill up with general items, which is why Quill's builds are only 20–40 % path.
5. **Hero passives push one source everywhere.** Venn's passive (every food activation inflicts Toxin) puts Toxin into every path. This is a hero rule and stays; the proposal works around it.
6. **The report cannot see the difference that exists.** Pet attacks count as "weapon", so a single huge beast and twenty rats look the same. The battle already records damage per item (`SideStats.itemDamage`), the report just does not use it.

## The idea

Each of the three hero items becomes the **anchor** of one path. After round 4 two of the three are shown at random, so the run offers you two paths and you choose one of them (or take the anchor that fits what you already built). Before round 4 a few cheap **feeder** items in the shop point towards each path; after round 4 the shop leans a little to the chosen path and **support** items make the anchor stronger.

Because the anchor of your favourite path may not show up, **every path must also work without its anchor**: the anchor makes the path clearly better and more distinct, but the feeders and support items alone already give it its main source. The anchor is the strongest single push, not a key without which the path is dead.

Each path gets **one main damage source or rhythm** that the other two paths of the same hero do not share. Everything below uses effects the schema already has (`per: buff/debuff/ship`, `starUse`, `to: stars`), unless marked otherwise.

## Rule and structure changes

| # | Change | Kind |
|---|---|---|
| R1 | ~~Show all three hero items after round 4.~~ **Rejected:** stays two of three at random. Each of the three is now the anchor of one path. | decided |
| R2 | Every hero item gets an explicit `path` field (`"poison"`, … or none for core items such as start items). Bots and reports use it instead of guessing from `focus`. `focus` stays only as a fallback for general shop items. The player does not see it as a rule, only the item popup may show the path symbol. | schema (internal) |
| R3 | **The shop leans to the anchor, gently:** after you take an anchor, hero-pool items of its path are offered somewhat more often (`shop.anchorPathWeight`, e.g. ×1.5, the same kind of nudge as `affinityPct`). Other paths and general items still show up as before, so switching or mixing stays possible. | shop rule, direction OK'd, number open |
| R4 | Bots no longer pick a path at random at the start. Before round 4 they lean lightly to what they own; at round 4 they take the better fitting of the two anchors shown and commit to that path. `report:paths` keeps forcing one path per bot and also measures paths played **without** their anchor (anchor not offered). | bot logic |
| R5 | ~~Round-8 special suits the path.~~ **Rejected.** Instead the ten general artifacts get small mechanics of their own (see below). | decided |

Hero passives, rules of the fight, style and the hero designs do not change.

## Per hero

Names of new items are working names and go through the glossary and item-design skill when built. Numbers are first guesses; balancing sets them.

### Rook – today all weapons

| Path | Main source / rhythm | Anchor (round 4) | Feeders before round 4 | Support after round 4 |
|---|---|---|---|---|
| **Overclocked guns** | many fast weapon hits; damage grows with Overclock | `perpetual_engine` **reworked**: loses its Shield; whenever a starred weapon fires, 1 extra damage per 2 Overclock (cap) | `bolt_thrower`, `capacitor_bank`, `turbo_fan`, `circuit_board` | `tesla_coil`, `rail_driver`, `dynamo`, `logic_core` |
| **Shield fortress** | **Shield ram:** slow, heavy hits that scale with own Shield | `nanite_swarm` **reworked** into a ram: every 3 s deal 1 damage per 4 Shield (cap ~25); keeps the phase Shield | `spare_parts`, `toolbox`, `conveyor_belt` | `shield_emitter`, `bastion_frame`, `bulwark_array`, **new** rare "ram plate" (armor: on attacked, deal damage per 6 Shield, chance) |
| **Workshop** | steady pings that grow with every crafted item; strips enemy Shield | `master_blueprint` **reworked**: every 2 s deal 1 damage per crafted item (cap 8) and strip a little; keeps a smaller crafted speed bonus | `grav_clamp`, `magnet_crane`, plus the general recipe parts Rook already buys | `salvage_rig`, `gravity_well`, `assembly_core`, **new** epic "drone bay" (mechanical pet that hits harder per crafted item) |

Result: guns win by weapons, fortress by its ram, workshop by crafted-count damage. Since PR #17 `shield_emitter` already deals a little damage per Shield; it becomes the fortress feeder that carries the ram idea when the anchor is not offered. Today's Rook weapons that also give Shield (`welding_arm`, `plasma_welder`, `arc_forge`, `rivet_cannon`) stay core items without a path.

### Quill – today all "weapon" (pets)

| Path | Main source / rhythm | Anchor | Feeders | Support |
|---|---|---|---|---|
| **Big beasts** | one or two huge pets carry; few pets in total | `elder_tusk` **reworked** into a saddle-like anchor: to the **starred** pet +6 damage, +20 % speed, Shield at start | `pack_lizard`, `war_saddle`, `moon_bear` | `tusked_behemoth`, `thunder_ram`, `armored_bear`, `juggernaut`, `shell_dragon` |
| **Swarm** | many small pets; damage counts pets | **new** artifact "brood mother" (replaces `ancient_egg`, which is generic): every 2 s deal 1 damage per pet (cap 12), pets on its stars faster | `burrow_rat`, `space_pup`, `guard_goose`, `grooming_comb`, `calling_shell` | `rat_pack`, `glow_swarm`, `hive_queen`, `swarm_cloud`, `pack_bond` |
| **Well-fed pack** | **ramp:** feeding grants Power, the pack hits harder the longer the fight lasts | `herd_heart` **reworked**: whenever a starred food activates, gain 1 Power; keeps heal per pet | `treat_pouch`, `kibble_sack`, `feeding_bowl`, `pet_bed` | `banquet_trough`, `cozy_den`, `nursery`, `hatchery`, **new** rare food "marrow treat" (Power to pets on its stars) |

Result: beasts = one big hitter, swarm = many small hits plus pet-count damage, well-fed = slow start and strong late fight. Quill's passive (+health and healing per pet) favours many pets; Big beasts gets its health from the anchor's Shield instead. No change to her passive.

### Venn – today Toxin everywhere

| Path | Main source / rhythm | Anchor | Feeders | Support |
|---|---|---|---|---|
| **Poison garden** | Toxin, many meals | `queen_spore` (stays, maybe stronger) | `seed_pod`, `pollen_cloud`, `blight_bomb` | `carnivorous_orchid`, `plague_blossom`, `spore_mine`, `harvest_crate` |
| **Thorn wall** | **Spikes:** the enemy hurts itself on the bark | `world_seed` **reworked** ("the suit turns to bark"): Spikes every phase, Regen; drops the big heal | `bramble_seed`, `thornvine`, `bark_shield` | `living_armor`, `briar_fortress`, `ironbark_golem`, `thorn_pod` |
| **Hungry jungle** | plant pets hit and heal | `terrarium_heart` **reworked**: pets on its stars +damage and heal on hit | `snap_sprout`, `sap_tap`, `watering_drone` | `venus_mantrap`, `giant_mantrap`, `strangler_fig`, `jungle_tyrant`, `mantrap_pack`, **new** non-food plant accessory (pets on stars faster) |

The jungle's feeders and support are **not food**, so the Toxin from Venn's passive shrinks there by itself. The food heal items (`moon_melon`, `nectar_flask`, `ambrosia`, `sun_blossom`, `healing_moss`) become core (no path). If Toxin still leads in Thorn wall and Jungle after this, the next step would be a small change to Venn's passive, which **needs OK**.

### Ysel – small corrections only

| Path | Main source / rhythm | Anchor | Note |
|---|---|---|---|
| **Burning corona** | Burn | `stellar_lens` (stays) | already distinct |
| **Late ascension** | weapons, late and fast (Power, Overclock) | `eternal_dawn` (stays) | already distinct |
| **Eclipse** | **cold damage:** hits that scale with the enemy's Cryo and Jam; very defensive | `nova_crown` **reworked**: Jam and Cryo every phase, every 2.5 s 1 damage per 2 Cryo on the enemy; keeps the Supernova Shield | feeders `eclipse_veil`, `mirror_of_dusk`; support `eclipse_orb`, `total_eclipse`, `umbral_mantle`, **new** rare "frost bell" (damage per Cryo) |

A parallel thread is tuning Ysel and Rook numbers right now; this proposal only changes structure and would be built on top of that work.

### Count

| | Rook | Quill | Venn | Ysel | Total |
|---|---|---|---|---|---|
| anchors reworked | 3 | 2 | 2 | 1 | 8 |
| anchors new | 0 | 1 (replaces `ancient_egg`) | 0 | 0 | 1 |
| new shop items | 2 | 1 | 1 | 1 | 5 |
| items that only get a `path` | ~20 | ~25 | ~25 | ~25 | all hero items |

Plus 8 of the 10 general artifacts reworked (round 8, see below), picture briefs (`data/item-art.json`), German texts and glossary terms for every new or changed item.

## Round 8: general artifacts as puzzle pieces

Today most of the ten general artifacts are flat numbers (`wormhole_generator` +12 % speed, `star_forge` +2 weapon damage, `quantum_dice` +20 % crit, `zoo_beacon` pets +2 damage). They stay random and path-free, but each one becomes a **puzzle piece** with its own small mechanic (Ilja, 2026-11-16: no boring items):

- **Star patterns that reach further than the neighbours.** Stars may sit two or three cells away, in lines, diagonals or rings. The grid already supports this: a star is any `*` in the shape, empty `.` cells in between are allowed (`grid.ts`). This spreads a build out instead of packing everything around one item, and it makes bag placement part of the puzzle.
- **Type filters on the stars:** "whenever a starred melee weapon activates", "whenever a starred pet activates", "starred food". Pets, food, weapon, armor work today. **Melee / ranged as a filter is new** (R6 below).

Shapes are written as in `data/items` (`#` cell, `*` star, `.` empty). Numbers are first guesses; balancing sets them.

| Artifact | Shape | Mechanic |
|---|---|---|
| **Dyson Fragment** | `*....*` / `..##..` / `..##..` / `*....*` | **collector:** four stars far out on the diagonals. Whenever a starred item activates, gain 3 Shield. |
| **Wormhole Generator** | `*..##..*` | **wormhole:** two stars three cells away on either end. Starred items start the fight fully charged and are 25 % faster; it connects two corners of the backpack. |
| **Time Dilator** | `*` / `.` / `#` / `#` / `.` / `*` | **slow shots:** stars two cells above and below. Whenever a starred **ranged** weapon activates, inflict 1 Cryo; keeps a small Cryo at the start. |
| **Ancient Monolith** | `.*.*.` / `*...*` / `..#..` / `*...*` / `.*.*.` | **last stand:** a ring of eight stars at knight's-move distance. Below half health, every starred item that activates heals 4. Plus some health. |
| **Quantum Dice** | `*.*` / `.#.` / `*.*` | **dice:** four diagonal stars. Whenever a starred item activates: 25 % Power, 25 % Overclock, 25 % 6 Shield, 25 % nothing. |
| **Plague Vault** | `*..*` / `.##.` / `*..*` | **spoiled stores:** whenever a starred food or organic item activates, inflict 1 Toxin; every 2.5 s 1 Radiation. |
| **Titan Core** | `**..**` / `..##..` / `..##..` | **armour plates:** stars two cells off in the top row. Start Shield per starred armor (big); when hit, 20 % chance to gain 1 Spikes, so it grows thornier. |
| **Star Forge** | `*.##.*` | **anvil:** stars two cells away on both sides. Starred **melee** weapons +5 damage, and whenever one activates, gain 1 Power. |
| **Galactic Cookbook** | `***` / `*#*` / `***` | **kitchen:** eight stars all round, only for food. Starred food 25 % faster; whenever one activates, 40 % chance of 1 Overclock. |
| **Zoo Beacon** | `*...*` / `..#..` / `*...*` | **beacon:** four stars two cells off diagonally, only for pets. Starred pets +30 % crit, and whenever one activates, heal 2. |

All of these can be written with today's effects (`starUse` + `tag`, `to: stars`, `per: stars`, `if: hpBelow / chance`), except the melee/ranged filter. Each pattern is different, so two artifacts never want the same spot. The pool could grow later (e.g. to 15) with more patterns, so that round 8 surprises more often.

### Balancing the free picks

Ilja (2026-11-16): not too strict, but no free pick may be so strong that you always take it and it nearly decides the run, and none may be nearly useless.

**Today this is already off.** `report:items` gives every artifact for free at its round and measures the gain in win share (`docs/reports/items.txt`, normal accuracy, ±2–3):

| General artifact (round 9) | Gain | | General artifact (round 9) | Gain |
|---|---|---|---|---|
| Time Dilator | **+27.6** | | Star Forge | +6.0 |
| Titan Core | **+20.0** | | Galactic Cookbook | +5.6 |
| Quantum Dice | +10.5 | | Plague Vault | +5.3 |
| Ancient Monolith | +9.3 | | Zoo Beacon | +4.6 |
| Wormhole Generator | +6.8 | | Dyson Fragment | **+4.3** |

Time Dilator is worth six Dyson Fragments. Among the hero items (round 5) the spread is +8 to +29 (Ancient Egg and Terrarium Heart strong, Herd Heart and Stellar Lens weak).

**New check `report:picks`** (one report for both free picks):

1. **Gain** per artifact as today, plus **per hero**, so a pet artifact that is great for Quill and weak for the others is visible.
2. **Choice test:** take real runs at the moment of the pick and play the rest of the run once with **each** option shown (same seed, same opponents). This answers the real question: "if these three are shown, which one wins?"
   - **best in its offer:** how often the item is the winning choice when it is shown;
   - **worst in its offer:** how often it is the losing choice.
3. **Empty offers:** how often a random offer contains no good option for the hero.

**Targets (wide on purpose, into `data/sim/targets.json`):**

| Measure | Round 8 (3 of 10) | Round 4 (2 of 3) |
|---|---|---|
| gain, compared with the median of its group | 0.6–1.6 × median | 0.7–1.4 × median |
| best in its offer (fair: 33 % / 50 %) | at most 55 % | at most 65 % |
| worst in its offer | at most 55 % | at most 65 % |
| offers with no option above 0.6 × median, per hero | at most 10 % | – |

An item outside a band is marked like the other reports do (✓/✗). Type-filtered artifacts (Zoo Beacon for pets, Cookbook for food) may be stronger for one hero, but must not be below 0.4 × median for any hero, so no offer is wasted. For the round-4 anchors the choice test also tells whether the path decision is real: if one anchor wins 80 % of the time, players are not choosing a path, they are taking the best item.

| # | Change | Kind |
|---|---|---|
| R6 | Star and passive filters may name a weapon range: `tag: "melee"` / `tag: "ranged"` (next to the item types and `crafted`). Small schema + compile change, rules text in `describe.ts`, glossary already has melee/ranged. | schema |

## Measuring it: the path profile

`report:paths` gets a **path profile** per path, built from per-item damage (`SideStats.itemDamage`) and the existing source totals, rounds 9+:

| Measure | What it says |
|---|---|
| **Main source** | damage split by mechanic instead of "weapon": weapon hits, pet hits, Burn, Toxin, Spikes, Shield ram (damage scaled by own Shield), count damage (scaled by items in the backpack), debuff damage (scaled by enemy debuffs) |
| **Carry share** | share of damage from the single best item, and number of items that deal damage (one beast vs. a swarm) |
| **Rhythm** | hits per second, average hit size, share of damage after the second phase (slow ramp vs. fast start) |
| **Path share** | share of the final build's cost with the bot's `path` (R2), and share of damage dealt by those items |

**Target (to enter `data/sim/targets.json`):**
- each path's main source is at least 40 % of its damage and at most 20 % in at least one other path of the same hero;
- the profiles of two paths of the same hero differ by at least 0.35 (1 − cosine similarity of the main-source split);
- path share of the final build at least 50 %;
- the existing win-rate band stays (every path within 6 points of the hero's best).

The report prints one light per hero: "paths distinct" or which pair is too close.

## Order of work (after OK)

1. Report: path profile + targets, measured on today's data (no game change), so the before/after is visible.
2. `path` field on hero items (R2) and bot logic (R4).
3. Anchors per hero, Rook and Quill first, then Venn and Ysel; R3 with them.
4. New feeder/support items, picture briefs, translations, catalog.
5. General artifacts as puzzle pieces (with R6), with `report:picks` built before them so their numbers are set by measurement.
6. Measure (with and without anchor) and balance.

## Open questions for Ilja

None left for the concept. Next step on his go: building it in the order above.
