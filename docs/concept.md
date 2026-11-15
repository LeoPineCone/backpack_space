# Backpack Space – concept

Status: first draft, 2026-11-15. Decisions by Ilja are marked **decided**; everything marked *assumption* was chosen to get a playable, measurable draft and is open for change.

## The game in one paragraph

A mobile auto-battler in the classic backpack genre, set in space. You pick a hero, buy items in a shop and pack them into a backpack. Where an item lies matters: stars on items point at neighbours and create synergies, bags give bonuses to what is inside, and neighbouring items can be combined into better ones along recipe chains. Then your backpack fights another player's backpack on its own. A run lasts 12 rounds with 4 lives.

## Run

- **Decided:** 12 rounds per run, 4 lives. A lost fight costs a life; the run ends when the lives are gone or after round 12.
- **Decided:** a finished run pays a reward of rounds played + lives left (at most 12 + 4 = 16) in a unit outside the run. Its name and what it buys are open.
- Each round: shop and packing, then one fight against the stored build of another player from the same round (async PvP; in the tools: bot builds).
- Gold per round and hero health per round are tables in `data/rules.json` (`goldPerRound`, `heroHp`). **Health in even steps (decided 2026-11-15):** 100, 150, 200, 250, then +100 per round up to 1100. The shop shows the hero's health for the coming fight (heart with a plus: round base plus items) and names the round's base when the round starts, so the growth is never hidden.
- **Decided:** free special items after round 4 and round 8.
  - After round 4: a **signature artifact** of the hero. *Assumption:* each hero has three, two are shown, you take one.
  - After round 8: a **general artifact**. *Assumption:* three of a pool of ten are shown, you take one.

## Backpack and bags

- **Decided:** the grid (9×7, *assumption*) is only the maximum area. Items can only lie on cells covered by a **bag**. Bags are bought in the shop and placed like items; every hero starts with a few bags.
- Start: a 3×3 Field Pack plus one 2×2 hero bag with a small bonus for the hero's theme (13 cells).
- Plain bags cost about 1 gold per cell. Themed bags (Cooler Bag, Holster, Tool Roll, Pet Carrier, …) give a bonus to matching items inside.
- A bag can be moved with everything in it. A bag in the backpack can only be sold empty.
- **Decided:** there is no bench. Whatever is bought without placing it, or taken out of the backpack, drops below the backpack and lies there loose. Loose items and bags do nothing in the fight and stay between rounds; they can be picked up and placed, or sold. Taking a bag out drops the items in it too.
- Loose limit (`shop.looseLimit`, 6, *assumption*): once that many pieces lie loose, nothing more can be bought without placing it. The limit only stops buying: free artifacts, recipe results and pieces taken out of the backpack always drop, and the fight can always be started.

## Items

- **Decided:** types/properties: weapon, armor, accessory, pet, food, mechanical, organic. An item has one or more of them; synergies refer to them ("starred food", "your pets", "mechanical items in this bag").
- **Decided:** rarities with prices: common, rare, epic, legendary. The shop shows rarer items in later rounds (`shop.rarityOdds`). Artifacts are never sold.
- Every item has a shape of cells and optionally **stars**: cells next to it that it points at. Effects can count, buff or react to the items on its stars.
- **Sizes follow the thing (decided 2026-11-15):** weapons and pets are larger than fruit and snacks. Weapons cover 2 cells or more; one cell only for daggers, fangs, small throwables and a hero's starting weapon. Pets go by body size; a single fruit, snack or drink covers 1 cell, a meal 2. Not a strict rule. Details, prices and the number budget for a first draft: `.claude/skills/item-design/SKILL.md`.
- Items act through a small set of building blocks (see "Effect language"), so the rules text is always generated from the data.
- **Parts that fit (assumption, own mechanic):** 12 % of the shop offers are drawn from the parts that complete or continue a recipe with something you already own (`shop.recipeOfferPct`). With close to 400 items a specific part would otherwise show up too rarely for chains to be a plan; this way owning half a recipe pulls the other half in.
- **The shop (decided 2026-11-15):** 6 offers per roll, a reroll costs 1 gold. What shows up (all numbers in `rules.shop`):
  - Rarity by round (`rarityOdds`); 30 % of the offers come from the hero's pool (`heroOfferPct`); 22 % are bags, but at most one bag per roll (`bagOfferPct`, `maxBags`); 10 % are on sale at half price.
  - **Results of recipes are never sold**, whatever their rarity. Epic and legendary items in the shop are only those that no recipe makes.
  - **Weight per item** (`weight` on the item, default 1): parts of several recipes show up more often (1.25–1.5), items without any recipe less often (0.8).
  - **The shop follows your backpack** (`affinityPct`): an item is offered up to twice as often when your items share one of its types. With a backpack full of pets, pets show up more.
  - **Pin for later (decided):** any number of offers can be pinned; pinned offers stay through rerolls and into the next round.
- Each hero has an own pool: two start items, shop items only that hero is offered (30 % of the offers), own recipes and three signature artifacts.

### Merging (recipes)

- **Merging is automatic (decided):** when the inputs of a recipe lie next to each other (sharing an edge, as one connected group), they merge **after the fight** of that round, as players know it from the genre. The fight itself is still fought with the separate items. Merging is final.
- **Lock (decided):** the player can lock an item; a locked item does not merge. *Assumption:* the lock is lost when the item leaves the backpack.
- *Assumptions:* every item merges at most once per round (a result can merge again after the next fight); when several recipes compete for the same item, the first in the recipe list wins; the result lands where the inputs were, or among the loose items if it does not fit; nothing merges after the last fight of a run.
- **Limit (assumption):** a chain has at most 3 steps above a base item (base → step 1 → step 2 → step 3), enforced by `npm run validate`. The longest chains use 5–7 base items.
- Most recipes take 2 items. Recipes with 3 inputs exist but are rare (8 of 151).
- A crafted item costs the sum of its inputs and is stronger and usually smaller than them together, so chains also save space.
- Crafted items carry the derived property "crafted"; some effects refer to it (Rook's whole kit).

## Fight

- Both heroes have health (by round). Items act on their own cooldowns. Weapons hit for damage; everything else heals, shields, buffs or debuffs.
- **Buffs** (on yourself): Shield (absorbs damage), Regen (heals every 2 s), Overclock (all your items faster), Power (+1 weapon damage per stack), Spikes (weapon hits against you hurt the attacker).
- **Debuffs** (on the enemy): Burn (damage every second, fades by 1 each time, stopped by Shield), Toxin (damage every 2 s, never fades, ignores Shield), Cryo (items slower, fades), Jam (weapons miss, fades), Radiation (less healing and less Shield gained).
- All numbers are in `data/rules.json` → `status`.

### Melee, ranged and Energy (decided 2026-11-15)

- **Every weapon is melee or ranged** (`range` on the item). Melee hits up close (blades, maces, claws, bites), ranged shoots (guns, cannons, bows, breath, thrown things). *For now Spikes hurt both alike* (decided as the simple start); the split makes later rules possible, e.g. Spikes only against melee and a counter against ranged.
- **Every attack costs Energy** (`energy` on the item, 1–7). Energy refills at a fixed rate up to a maximum, the bar starts full (`rules.energy`: max 20, start 20, refill 12 per second). A weapon that is ready but lacks the Energy waits until there is enough; nothing else is lost. A missed attack (Jam) costs Energy too.
- Costs follow the cooldown (about 1 + 1.5 × cooldown), so one weapon draws about 2 Energy per second whether fast or slow; fast weapons pay a little more per second. The refill carries about six weapons; Rook's and Quill's own weapons (except Quill's rare pets) cost 1 less, because their heroes make them faster. Quill's hero rule takes 1 more Energy off every pet attack. Faster attacks (Overclock, speed bonuses) use more Energy per second, so speed and Energy items work together.
- **Why:** a backpack full of weapons no longer wins by itself. Past six or so weapons, more weapons mostly wait; Energy items, slower heavy weapons or the other damage kinds (Burn, Toxin, direct damage) pay off instead.
- **Energy items:** effects can give Energy (`do: energy`, e.g. Protein Bar, Nova Cola, Solar Panel, Glow Beetle, Feeding Bowl), raise the refill (`mod.energyRegen` on the hero, e.g. Energy Gel, Power Cell, Fusion Battery, Dynamo) or make starred weapons cheaper (`mod.energy`, Gravity Anchor). 29 items in all (`npm run catalog` lists them). Own pools: Rook (Dynamo, Capacitor Bank, Logic Core, Circuit Board, Conveyor Belt, Quantum Forge, Perpetual Engine), Quill (Kibble Sack, Treat Pouch, Feeding Bowl, Banquet Trough, Hatchery, Nursery; Pet Bed and Grooming Comb make starred pets cheaper), Venn (Moon Melon, Compost Bin, Sap Tap). Ysel has none: her Burn and phase effects hardly need Energy.
- In the fight the client shows a thin Energy bar under each health bar.
- **In the shop (decided 2026-11-15):** a row under the loose items shows the hero's health for the next fight, Energy used / gained per second (red when the weapons need more than comes in) and a chart button. The button opens the backpack numbers: health, Energy used, gained (refill and items) and the share of a fight weapons would wait, damage per second (weapons, direct), debuff stacks per second, healing, Shield, melee and ranged weapons. The core estimates them without an opponent (`buildStats` in packages/core/src/stats.ts); the fight stays the only truth.

### The dying star (fight clock)

**Decided:** a fight has a time limit; after it both heroes take rising damage (the Supernova). The time until then is told through the star the duel is fought next to. The numbers below were measured and set on 2026-11-15 (`rules.battle` in `data/rules.json`, targets in `data/sim/targets.json`, checked by `npm run report:battles`):

| Phase | Seconds | What happens |
|---|---|---|
| Calm | 0–8 | almost no fight ends here (about 1 %) |
| Flare | 8–16 | about a third of the fights end here (quick, one-sided builds) |
| Red Giant | 16–24 | the most common end (about 40 %) |
| Collapse | 24–32 | about 15 % |
| **Supernova** | from 32 | every second both heroes lose 3 % of their maximum health, 1.5 points more each second (3, 4.5, 6, 7.5 … %), ignoring Shield. After 5 s that is 30 % of the maximum, after 8 s 66 %, after 10 s 98 %. Ysel takes half. |

Targets, per round: an average fight lasts 18–25 s (measured 20–23 s), no fight lasts longer than 45 s (measured at most 44 s), 5–20 % of the fights reach the Supernova (measured 8–17 %), and nine in ten Supernova fights are over within about 10 s (measured 7–11 s). So the Supernova is a real threat in one fight of eight to ten, not the normal way a fight ends, and the waiting time stays short at speed ×1.

The phase is a parameter for abilities: "every star phase: …", "when Flare begins: …", "during Collapse: twice as fast". One hero (Ysel) is built around it.

## Heroes

Four heroes, each with an own focus, passive, start items, shop pool and artifacts (details in `docs/catalog.md`; who they are and how they look: `docs/heroes.md`):

| Hero | Focus | Passive |
|---|---|---|
| **Venn**, The Thing in the Suit | food and organic items; heals a lot, wins slowly through Toxin | its organic items are faster; whenever one of its food items activates, it inflicts Toxin |
| **RK-7 "Rook"**, Salvage Unit | mechanical items and crafting; Shield and Overclock | every combination pays gold; mechanical and crafted items are faster |
| **Quill**, Foundling of the Herd | pets | her pets act the moment the fight begins and are faster; every pet that acts heals her a little; more health per pet |
| **Ysel**, Singer of the Corona | the star phases; Burn; long fights | starts every fight with 1 Power and gains 1 with every star phase; takes half Supernova damage |

### Ways to win

Every hero is designed for three paths (`paths` in `data/heroes.json`), each with own shop items, own recipes and a different upgrade of the start weapon. `npm run report:paths` lets bots commit to one path each and compares them.

| Hero | Paths |
|---|---|
| Venn | Poison garden (Toxin, food) · Thorn wall (Spikes, armor, Regen) · Hungry jungle (plant pets that heal on hit) |
| Rook | Overclocked guns · Shield fortress · Workshop (crafted items, stripping enemy buffs) |
| Quill | Big beasts · Swarm (many small pets) · Well-fed pack (food and healing around the pets) |
| Ysel | Burning corona (Burn) · Late ascension (Power, Overclock, late phases) · Eclipse (Jam, Cryo, Shield per phase) |

## What makes it its own game (open, to decide together)

The base is deliberately the classic backpack mechanic. Candidates for an own identity, in the order they are already in the draft:

0. **Parts that fit:** the shop leans towards the missing parts of recipes you have started (see Items).
1. **The dying star** as fight clock and as a parameter for items and a whole hero.
2. **Long recipe chains** up to 3 steps with crafting as a hero identity (Rook).
3. **Themed bags** that turn "where do I put the bag" into a second packing puzzle.

Not in the draft, ideas only: a shared star per round with a modifier (e.g. "blue giant: Burn is doubled this round"); fights in a best-of against the same opponent with a short re-pack between; trading items with the opponent's ghost shop.

## Effect language (for item design)

An item is data: shape, optional cooldown, optional weapon damage with range (melee/ranged) and Energy cost, and a list of effects. An effect is a trigger plus one action, or a passive bonus.

- Triggers: `start`, `use` (each cooldown), `hit` (weapon hit), `attacked`, `phase` (every phase or a named one), `starUse` (a starred item activates), `lowHp` (once below half health); for heroes also `shipUse` (any own item with a tag activates).
- Actions: gain a buff, inflict a debuff, deal damage, heal, cleanse own debuffs, strip enemy Shield, gain Energy.
- Scaling `per`: starred items with a tag, items with a tag in the backpack, own buff stacks, enemy debuff stacks (with divisor and cap).
- Conditions `if`: chance, star phases, health below a share.
- Passives `to`: self, starred items, all own items with a tag, the hero (health), for bags the items inside. Bonuses: weapon damage, speed, crit, health, starting charged, Energy cost of weapons, Energy refill (hero).

## Tools

See `README.md`: validation, balancing reports as npm commands with accuracy presets, and the browser preview (`npm run play`).
