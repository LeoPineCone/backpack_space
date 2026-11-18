/** Lays items into the backpack: tight packing first, then a local search that maximises how many stars point at something useful. */
import type { GameData, ItemDef } from "../gamedata.js";
import { bagFits, emptyBoard, fits, stamp, starred, type Board } from "../grid.js";
import type { Rng } from "../rng.js";
import { pendingMerges } from "../run.js";
import type { Effect, Placement, Recipe } from "../schema.js";

export interface Arranged {
  items: Placement[];
  left: string[];
}

const matches = (def: ItemDef, tag: string | undefined) =>
  tag === undefined || tag === "any" || (tag === "melee" || tag === "ranged" ? def.range === tag : (def.tags as string[]).includes(tag));

/** Worth of one star link from `src` (through effect e) to `target`. */
function linkValue(e: Effect, target: ItemDef): number {
  if (e.on === "passive") {
    if (e.to !== "stars" || !matches(target, e.tag)) return 0;
    const m = e.mod!;
    let v = 0;
    if (m.damage && target.damage) v += (m.damage * 2) / (target.cooldown ?? 2);
    if (m.speed && target.cooldown) v += (m.speed / 100) * target.cost * 0.6;
    if (m.crit && target.damage) v += (m.crit / 100) * target.cost * 0.6;
    if (m.ready && target.cooldown) v += 0.3;
    return v;
  }
  if (e.on === "starUse") return matches(target, e.tag) && target.cooldown ? 2 / target.cooldown : 0;
  return 0;
}

/** Static layout score: how much the stars are worth. */
export function layoutScore(data: GameData, bags: readonly Placement[], items: readonly Placement[], board?: Board): number {
  const { w, h } = data.rules.grid;
  let b = board;
  if (!b) {
    b = emptyBoard(w, h, bags, data.shape);
    items.forEach((p, i) => stamp(b!, data.shape(p.item, p.rot), p.x, p.y, i));
  }
  let score = 0;
  items.forEach((p, i) => {
    const def = data.items.get(p.item)!;
    if (!def.shape.some((r) => r.includes("*"))) return;
    const targets = starred(b!, items, i, data.shape).map((j) => data.items.get(items[j]!.item)!);
    for (const e of def.effects) {
      for (const t of targets) score += linkValue(e, t);
      if (e.per?.stars) {
        const n = Math.min(e.per.max ?? 99, Math.floor(targets.filter((t) => matches(t, e.per!.stars)).length / (e.per.div ?? 1)));
        score += n * (e.on === "passive" ? 1 : 0.8);
      }
    }
  });
  return score;
}

function pack(data: GameData, bags: readonly Placement[], ids: readonly string[], rng: Rng, scan: boolean): Arranged {
  const { w, h } = data.rules.grid;
  const b = emptyBoard(w, h, bags, data.shape);
  const order = rng.shuffle([...ids]).sort((x, y) => data.items.get(y)!.size - data.items.get(x)!.size);
  const items: Placement[] = [],
    left: string[] = [];
  for (const id of order) {
    const options: Placement[] = [];
    const rots = rng.shuffle([0, 1, 2, 3]);
    search: for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (const rot of rots) {
          if (fits(b, data.shape(id, rot), x, y)) {
            options.push({ item: id, x, y, rot });
            if (scan) break search;
          }
        }
    if (!options.length) {
      left.push(id);
      continue;
    }
    const p = scan ? options[0]! : rng.pick(options);
    stamp(b, data.shape(id, p.rot), p.x, p.y, items.length);
    items.push(p);
  }
  return { items, left };
}

export interface ArrangeOpts {
  /** local search moves (default 250); 0 = packing only */ moves?: number;
  /** packing attempts (default 4) */ tries?: number;
  /** recipes the layout should lay together so that they merge after the fight */ recipes?: readonly Recipe[];
}
/** Layout score of one merge that will happen after the fight, against the score of the stars. */
const MERGE_SCORE = 6;

export function arrange(data: GameData, bags: readonly Placement[], ids: readonly string[], rng: Rng, opts: ArrangeOpts = {}): Arranged {
  const { w, h } = data.rules.grid;
  const size = (l: readonly string[]) => l.reduce((s, id) => s + data.items.get(id)!.size, 0);
  let best: Arranged | null = null;
  for (let t = 0; t < (opts.tries ?? 4); t++) {
    const a = pack(data, bags, ids, rng, t % 2 === 0);
    if (!best || size(a.left) < size(best.left)) best = a;
    if (!best.left.length && t >= 1) break;
  }
  const items = best!.items.map((p) => ({ ...p }));
  const base = emptyBoard(w, h, bags, data.shape);
  const blank = (): Board => ({ w, h, occ: base.occ.slice(), bag: base.bag });
  const rebuild = () => {
    const b = blank();
    items.forEach((p, i) => stamp(b, data.shape(p.item, p.rot), p.x, p.y, i));
    return b;
  };
  const recipes = opts.recipes ?? [];
  const total = () => layoutScore(data, bags, items, rebuild()) + (recipes.length ? MERGE_SCORE * pendingMerges(data, bags, items, recipes).length : 0);
  let score = total();
  const moves = opts.moves ?? 250;
  for (let m = 0; m < moves + (recipes.length ? 150 : 0) && items.length > 1; m++) {
    const i = rng.int(items.length);
    const old = items.map((p) => ({ ...p }));
    if (rng.next() < 0.5) {
      // move one item somewhere else
      const b = blank();
      items.forEach((p, k) => {
        if (k !== i) stamp(b, data.shape(p.item, p.rot), p.x, p.y, k);
      });
      const rot = rng.int(4),
        s = data.shape(items[i]!.item, rot);
      const x = rng.int(w - s.w + 1),
        y = rng.int(h - s.h + 1);
      if (x < 0 || y < 0 || !fits(b, s, x, y)) continue;
      items[i] = { item: items[i]!.item, x, y, rot };
    } else {
      // swap two items
      let j = rng.int(items.length - 1);
      if (j >= i) j++;
      const b = blank();
      items.forEach((p, k) => {
        if (k !== i && k !== j) stamp(b, data.shape(p.item, p.rot), p.x, p.y, k);
      });
      const a = items[i]!,
        c = items[j]!;
      let done = false;
      for (const ra of rng.shuffle([0, 1, 2, 3])) {
        if (!fits(b, data.shape(a.item, ra), c.x, c.y)) continue;
        const b2: Board = { w, h, occ: b.occ.slice(), bag: b.bag };
        stamp(b2, data.shape(a.item, ra), c.x, c.y, i);
        for (const rc of [0, 1, 2, 3])
          if (fits(b2, data.shape(c.item, rc), a.x, a.y)) {
            items[i] = { item: a.item, x: c.x, y: c.y, rot: ra };
            items[j] = { item: c.item, x: a.x, y: a.y, rot: rc };
            done = true;
            break;
          }
        if (done) break;
      }
      if (!done) continue;
    }
    const s2 = total();
    if (s2 >= score) score = s2;
    else old.forEach((p, k) => (items[k] = p));
  }
  return { items, left: best!.left };
}

/** Same items, random layout (for measuring what placement is worth). */
export function shuffleLayout(data: GameData, bags: readonly Placement[], ids: readonly string[], rng: Rng): Arranged {
  let best: Arranged | null = null;
  for (let t = 0; t < 6; t++) {
    const a = pack(data, bags, ids, rng, false);
    if (!best || a.left.length < best.left.length) best = a;
    if (!best.left.length) break;
  }
  return best!;
}

/** Where a bot puts a new bag: touching the bags it has, as compact as possible. Null when the grid has no room. */
export function placeBag(data: GameData, bags: readonly Placement[], id: string): Placement | null {
  const { w, h } = data.rules.grid;
  const b = emptyBoard(w, h, bags, data.shape);
  let best: Placement | null = null,
    bestScore = -Infinity;
  for (let rot = 0; rot < 4; rot++) {
    const s = data.shape(id, rot);
    for (let y = 0; y <= h - s.h; y++)
      for (let x = 0; x <= w - s.w; x++) {
        if (!bagFits(b, s, x, y)) continue;
        let touch = 0,
          dist = 0;
        for (const [cx, cy] of s.cells) {
          const px = x + cx,
            py = y + cy;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const qx = px + dx,
              qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) touch += 0.5;
            else if (b.bag[qy * w + qx] !== -1) touch += 1;
          }
          dist += Math.abs(px - (w - 1) / 2) + Math.abs(py - (h - 1) / 2);
        }
        const score = touch - (dist / s.cells.length) * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = { item: id, x, y, rot };
        }
      }
  }
  return best;
}
