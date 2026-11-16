/**
 * Measuring one item: builds the bots really played get the item for free (with room for it) and fight the same
 * opponents with the same dice, with and without it. Every item has its own dice (from the seed and its id), so
 * its result does not depend on which other items are measured in the same run: measuring one item again on the
 * same field gives the same number unless the item (or the field) changed.
 */
import { arrange, compile, simulate, type Build, type GameData, type ItemDef, type Placement, Rng } from "@backpack-space/core";

/** round in which the item is typically new */
export const roundOf = (it: ItemDef): number =>
  it.rarity === "artifact" ? (it.hero ? 5 : 9) : it.crafted ? [0, 5, 8, 11][it.depth]! : { common: 3, rare: 5, epic: 7, legendary: 9 }[it.rarity as "common"]!;

/** every free grid cell gets a plain pouch, so the extra item never has to push something out */
function withRoom(d: GameData, b: Build): Placement[] {
  const { w, h } = d.rules.grid;
  const used = new Set<number>();
  for (const p of b.bags) for (const [cx, cy] of d.shape(p.item, p.rot).cells) used.add((p.y + cy) * w + p.x + cx);
  const pouch = d.itemList.find((i) => i.isBag && i.size === 1 && i.effects.length === 0)!;
  const bags = [...b.bags];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!used.has(y * w + x)) bags.push({ item: pouch.id, x, y, rot: 0 });
  return bags;
}

/** a seed from a number and a text (FNV-1a) */
export function seedOf(seed: number, text: string): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 2147483647;
}

export interface ItemGain { id: string; round: number; /** points of win share gained per build that got the item */ deltas: number[] }

export function measureItem(data: GameData, it: ItemDef, byRound: readonly Build[][], n: { builds: number; fights: number }, seed: number): ItemGain {
  const rng = new Rng(seedOf(seed, it.id));
  const round = roundOf(it);
  const field = byRound[round - 1]!;
  const pool = field.filter((b) => !it.hero || b.hero === it.hero);
  const deltas: number[] = [];
  for (let s = 0; s < n.builds && pool.length; s++) {
    const base = pool[rng.int(pool.length)]!;
    const bags = withRoom(data, base);
    const layout = rng.int(2 ** 31);
    const a0 = arrange(data, bags, base.items.map((p) => p.item), new Rng(layout), { moves: 120 });
    const a1 = arrange(data, bags, [...base.items.map((p) => p.item), it.id], new Rng(layout), { moves: 120 });
    // the dice of the fights are drawn before the build is judged, so a build that does not fit shifts nothing
    const fights = Array.from({ length: n.fights }, () => [rng.int(field.length), rng.int(2 ** 31)] as const);
    if (a1.left.length || a0.left.length) continue;
    const c0 = compile({ ...base, bags, items: a0.items }, data), c1 = compile({ ...base, bags, items: a1.items }, data);
    let w0 = 0, w1 = 0;
    for (const [o, fs] of fights) {
      const opp = compile(field[o]!, data);
      const x0 = simulate(c0, opp, data.rules, fs).winner, x1 = simulate(c1, opp, data.rules, fs).winner;
      w0 += x0 === 0 ? 1 : x0 === -1 ? 0.5 : 0; w1 += x1 === 0 ? 1 : x1 === -1 ? 0.5 : 0;
    }
    deltas.push((100 * (w1 - w0)) / n.fights);
  }
  return { id: it.id, round, deltas };
}

/** the items a ratings run measures, in a fixed order */
export const ratedItems = (data: GameData): ItemDef[] => data.itemList.filter((i) => !i.isBag);
