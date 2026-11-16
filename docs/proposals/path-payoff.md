# Path payoff: items of a path reward each other (proposal, 2026-11-16)

Status: **proposal, nothing built, no number changed.** Asked by Ilja after the path-pull sweeps and the number
proposal (`docs/findings.md`, top two entries): before any numbers, how can the items of a path reward each other?

## 1. What is wrong today, measured

Baseline of main (2 × 240 lobbies). For every path its bots are split into thirds by how much of their final
build is on the path (share of item cost). Win share against other heroes, all rounds / rounds 9–12:

| Path | least committed third | middle third | most committed third | Going deeper |
|---|---|---|---|---|
| Venn Thorn wall | 21 %: 50 / 54 | 34 %: 51 / 57 | 49 %: 56 / 61 | **pays** |
| Rook Workshop | 38 %: 57 / 62 | 51 %: 58 / 67 | 64 %: 55 / 59 | even |
| Ysel Eclipse | 42 %: 50 / 56 | 56 %: 51 / 58 | 68 %: 50 / 55 | even |
| Quill Swarm | 16 %: 52 / 61 | 27 %: 54 / 57 | 41 %: 55 / 51 | even, worse late |
| Venn Poison garden | 38 %: 49 / 50 | 54 %: 47 / 43 | 72 %: 48 / 42 | even, worse late |
| Ysel Burning corona | 22 %: 51 / 54 | 34 %: 54 / 54 | 48 %: 52 / 44 | even, worse late |
| Quill Big beasts | 20 %: 50 / 54 | 32 %: 46 / 48 | 46 %: 50 / 47 | even, worse late |
| Venn Hungry jungle | 51 %: 44 / 40 | 65 %: 40 / 32 | 78 %: 40 / 33 | costs |
| Rook Overclocked guns | 50 %: 52 / 49 | 62 %: 46 / 37 | 74 %: 45 / 31 | **costs** |
| Rook Shield fortress | 29 %: 50 / 53 | 41 %: 49 / 47 | 55 %: 41 / 39 | **costs** |
| Quill Well-fed pack | 36 %: 47 / 51 | 50 %: 44 / 40 | 64 %: 38 / 31 | **costs** |
| Ysel Late ascension | 44 %: 50 / 45 | 58 %: 42 / 35 | 71 %: 40 / 26 | **costs** |

Only Thorn wall rewards a player for going deeper. In five paths the most committed bots lose 9–20 points in the
late rounds against the least committed ones. (Bots, not players; the pattern is the same on both seeds' pooled
data and fits the sweep: more path liking, more losses.)

Why, from the items:

- A path has three roles: **source** (makes the path's resource: Shield, Overclock, Power, feedings, healing),
  **converter** (turns the resource into damage or survival, the more resource the more), **body** (weapons and
  health that win the fight while the engine runs).
- Thorn wall has all three in almost every item: Spikes are source and converter at once (the enemy's own hits
  do the damage), and its armor is the body.
- The five paths that cost are **sources without converters or without a body**:
  - *Shield fortress*: 10 items, no weapon. The only converters are ram effects capped at 6–20 damage, most at
    25–30 % chance. A deep fortress build blocks well and kills nothing before the Supernova.
  - *Well-fed pack*: 9 items, no pet and no weapon. Power comes in single stacks; the one real converter is the
    anchor (Herd Heart). A deep build is food without a pack.
  - *Late ascension*: 7 items, two weapons (epic and legendary) that only wake up from the third phase. Power
    and Overclock pile up with nothing to use them early; the shields per Power sit in Eclipse items.
  - *Overclocked guns*: six weapons at 2–5 Energy. Overclock makes them faster, so they ask for more Energy; the
    converters (damage per Overclock) are capped at 4–14.
  - *Hungry jungle*: healing has no converter at all (health above the maximum is lost), and the mantraps'
    bonus needs Toxin, which is Poison garden's resource.

## 2. Design rule proposed

1. **Every path names one resource and gets converters at three price levels** (common or rare, epic, the
   anchor). Today most converters are the anchor or a legendary: too late and too rare to build around.
2. **A converter scales with the resource and its cap is reached only by a committed build** (a cap that two
   items fill is a flat bonus, not a payoff).
3. **Every path keeps a body**: at least two weapons or pets a player can find by round 4, or a converter that
   is itself the damage (as Spikes are).
4. **Sources stay useful alone, converters need the path.** That keeps the round-4 choice open (2 of 3 anchors
   at random): a player who does not get the anchor still has a use for the sources.
5. **A path's converter reads the path's own resource**, not a neighbour's (mantraps and Toxin).

## 3. Proposal per path (ideas to choose from, numbers come later with the tools)

All use what the effect schema already has (`per` buff / debuff / ship / stars, `starUse`, `attacked`) unless
marked **schema**.

| Path | Resource | Proposed change |
|---|---|---|
| Shield fortress | own Shield | Ram becomes a real weapon line: a common ram weapon (melee, damage +1 per so many Shield), Ram Plate and Bastion Frame ram on every hit taken instead of by chance, caps raised so 150+ Shield matters. Shield Emitter keeps its ram on use. |
| Well-fed pack | feedings (food used next to a pet) | Feedings give the fed pet something that lasts for the fight: every food gets "pet next to it: +1 damage for the fight when this is used" (today only the anchor does it, for the hero). Add one common pet that likes being fed (extra attack when a food next to it is used). Herd Heart stays the big version. |
| Late ascension | Power | An early weapon that uses Power twice (fast, cheap Energy, "+1 damage per 2 Power" on top of Power itself) and a rare one; move one "Shield per Power" effect from Eclipse here or copy it, so Power also keeps the hero alive until the late phases. |
| Overclocked guns | Overclock | Remove the Energy trap: Overclock sources also give Energy per stack gained, or Overclock weapons cost less Energy per stack (**schema**: Energy cost per buff). Raise the caps of "damage per Overclock" on the rare and epic guns. |
| Hungry jungle | healing | Healing above full health becomes Shield, up to a cap (**schema**: new rule or item effect), carried by one common jungle item and the anchor. Mantraps read the jungle's own resource (pets next to them, or own Regen) instead of enemy Toxin. Strangler Fig's Cryo stays the control tool. |
| Poison garden, Burning corona, Big beasts, Swarm | | Leave. Check the late rounds again after the others are done (they fall off late because damage over time and small pets meet the big Shields of late builds). |
| Workshop, Eclipse, Thorn wall | | Leave. Workshop's strength is the hero rule (crafted items 25 % faster); that is a separate decision. |

## 4. How we would know it worked

- New number in `report:paths` and a target: **the most committed third of a path wins at least as often as the
  least committed third** (all rounds, and rounds 9–12). This says "the path pays" without needing the open bot.
- `pathOverOpen` (≥ +2) stays as the second check.
- Path-pull sweep again: with payoff, more path liking should no longer lose.

## 5. Order proposed

1. Ilja picks per path: take the idea, change it, or leave the path.
2. Build the "commit pays" number (small, no game change).
3. One path at a time, starting with Shield fortress and Well-fed pack (largest gap, no schema change): items
   per the item-design skill, first numbers by budget, then `balance:propose`, full run, findings.
4. The two schema ideas (Energy cost per Overclock, healing above full to Shield) only after a yes to each.
