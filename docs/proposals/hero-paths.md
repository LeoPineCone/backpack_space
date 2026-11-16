# Proposal: paths that play differently, anchored by the hero item

Status: **proposal, 2026-11-16, nothing built yet.** Game data and code are unchanged. Every point marked **needs OK** changes a rule, the schema or a hero and waits for Ilja.

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

The hero item after round 4 becomes the **anchor** of the path: you are shown three, one per path, and the one you take decides how your build wins. Before round 4 a few cheap **feeder** items in the shop point towards each path; after round 4 the shop leans to the chosen path and **support** items make the anchor stronger. The general artifact after round 8 can **crown** the path.

Each path gets **one main damage source or rhythm** that the other two paths of the same hero do not share. Everything below uses effects the schema already has (`per: buff/debuff/ship`, `starUse`, `to: stars`), unless marked otherwise.

## Rule and structure changes

| # | Change | Kind |
|---|---|---|
| R1 | After round 4, show **all three** signature artifacts (one per path) instead of two of three. | rule (`rules.specials[0].show` 2 → 3), **needs OK** |
| R2 | Every hero item gets an explicit `path` field (`"poison"`, … or none for core items such as start items). Bots and reports use it instead of guessing from `focus`. `focus` stays only as a fallback for general shop items. | schema, **needs OK** |
| R3 | **The shop follows the anchor:** after you take an anchor, two of three hero-pool offers come from its path (`shop.anchorPathPct`, e.g. 65). | shop rule, **needs OK** |
| R4 | Bots no longer pick a path at random at the start. Before round 4 they lean lightly to what they own; at round 4 they take the anchor that fits their build best and commit to that path. `report:paths` keeps forcing one path per bot. | bot logic |
| R5 | Optional crown: after round 8 one of the three general artifacts shown is one that suits the anchor's path (a `suits` list per general artifact, e.g. `zoo_beacon` → swarm/beasts, `titan_core` → fortress/thorns). | rule, optional, **needs OK** |

Hero passives, rules of the fight, style and the hero designs do not change.

## Per hero

Names of new items are working names and go through the glossary and item-design skill when built. Numbers are first guesses; balancing sets them.

### Rook – today all weapons

| Path | Main source / rhythm | Anchor (round 4) | Feeders before round 4 | Support after round 4 |
|---|---|---|---|---|
| **Overclocked guns** | many fast weapon hits; damage grows with Overclock | `perpetual_engine` **reworked**: loses its Shield; whenever a starred weapon fires, 1 extra damage per 2 Overclock (cap) | `bolt_thrower`, `capacitor_bank`, `turbo_fan`, `circuit_board` | `tesla_coil`, `rail_driver`, `dynamo`, `logic_core` |
| **Shield fortress** | **Shield ram:** slow, heavy hits that scale with own Shield | `nanite_swarm` **reworked** into a ram: every 3 s deal 1 damage per 4 Shield (cap ~25); keeps the phase Shield | `spare_parts`, `toolbox`, `conveyor_belt` | `shield_emitter`, `bastion_frame`, `bulwark_array`, **new** rare "ram plate" (armor: on attacked, deal damage per 6 Shield, chance) |
| **Workshop** | steady pings that grow with every crafted item; strips enemy Shield | `master_blueprint` **reworked**: every 2 s deal 1 damage per crafted item (cap 8) and strip a little; keeps a smaller crafted speed bonus | `grav_clamp`, `magnet_crane`, plus the general recipe parts Rook already buys | `salvage_rig`, `gravity_well`, `assembly_core`, **new** epic "drone bay" (mechanical pet that hits harder per crafted item) |

Result: guns win by weapons, fortress by its ram, workshop by crafted-count damage. Today's Rook weapons that also give Shield (`welding_arm`, `plasma_welder`, `arc_forge`, `rivet_cannon`) stay core items without a path.

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

Plus picture briefs (`data/item-art.json`), German texts and glossary terms for every new or changed item.

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
3. Anchors per hero, Rook and Quill first, then Venn and Ysel; R1 and R3 with them.
4. New feeder/support items, picture briefs, translations, catalog.
5. Measure, balance, optional crown (R5).

## Open questions for Ilja

1. R1: show all three hero items after round 4 instead of two?
2. R2/R3: explicit `path` per hero item, and the shop leaning to the chosen path afterwards?
3. R5: should the round-8 special lean to the path, or stay fully random?
4. The new main sources: Shield ram (Rook fortress), crafted-count damage (Rook workshop), feeding Power (Quill well-fed), cold damage (Ysel eclipse). Do these fit the heroes?
