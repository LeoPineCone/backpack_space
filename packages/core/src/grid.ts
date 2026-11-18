/** Backpack geometry: shapes with stars, rotation, placement, neighbours. */
import type { Placement } from "./schema.js";

export interface Shape {
  cells: [number, number][];
  stars: [number, number][];
  w: number;
  h: number;
}

/** Parses shape rows and rotates them clockwise `rot` times. The origin is the top-left corner of the cells' bounding box; stars may have negative offsets. */
export function parseShape(rows: readonly string[], rot: number): Shape {
  let m = rows.map((r) => [...r]);
  const width = Math.max(...m.map((r) => r.length));
  m = m.map((r) => [...r, ...Array<string>(width - r.length).fill(".")]);
  for (let k = 0; k < (rot & 3); k++) {
    const h = m.length,
      w = m[0]!.length;
    const n: string[][] = [];
    for (let y = 0; y < w; y++) {
      const row: string[] = [];
      for (let x = 0; x < h; x++) row.push(m[h - 1 - x]![y]!);
      n.push(row);
    }
    m = n;
  }
  const cells: [number, number][] = [],
    stars: [number, number][] = [];
  m.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c === "#") cells.push([x, y]);
      else if (c === "*") stars.push([x, y]);
    }),
  );
  const minX = Math.min(...cells.map((c) => c[0])),
    minY = Math.min(...cells.map((c) => c[1]));
  const shift = (p: [number, number]): [number, number] => [p[0] - minX, p[1] - minY];
  const cs = cells.map(shift);
  return { cells: cs, stars: stars.map(shift), w: Math.max(...cs.map((c) => c[0])) + 1, h: Math.max(...cs.map((c) => c[1])) + 1 };
}

/** occ: item index per cell (-1 = free); bag: bag index per cell (-1 = no bag there, nothing can lie on it). */
export interface Board {
  w: number;
  h: number;
  occ: Int16Array;
  bag: Int16Array;
}

export type ShapeOf = (item: string, rot: number) => Shape;

/** The backpack with its bags laid out and no items yet; throws when a bag is out of bounds or overlaps another. */
export function emptyBoard(w: number, h: number, bags: readonly Placement[], shapeOf: ShapeOf): Board {
  const bag = new Int16Array(w * h).fill(-1);
  bags.forEach((p, i) => {
    for (const [cx, cy] of shapeOf(p.item, p.rot).cells) {
      const x = p.x + cx,
        y = p.y + cy;
      if (x < 0 || y < 0 || x >= w || y >= h || bag[y * w + x] !== -1) throw new Error(`bag ${p.item} does not fit at ${p.x},${p.y}`);
      bag[y * w + x] = i;
    }
  });
  return { w, h, occ: new Int16Array(w * h).fill(-1), bag };
}
/** Can a bag lie there (inside the grid, not on another bag)? */
export function bagFits(b: Board, s: Shape, x: number, y: number): boolean {
  for (const [cx, cy] of s.cells) {
    const px = x + cx,
      py = y + cy;
    if (px < 0 || py < 0 || px >= b.w || py >= b.h || b.bag[py * b.w + px] !== -1) return false;
  }
  return true;
}

export function fits(b: Board, s: Shape, x: number, y: number): boolean {
  for (const [cx, cy] of s.cells) {
    const px = x + cx,
      py = y + cy;
    if (px < 0 || py < 0 || px >= b.w || py >= b.h || b.bag[py * b.w + px] === -1 || b.occ[py * b.w + px] !== -1) return false;
  }
  return true;
}
export function stamp(b: Board, s: Shape, x: number, y: number, idx: number): void {
  for (const [cx, cy] of s.cells) b.occ[(y + cy) * b.w + x + cx] = idx;
}

/** Board of bags and items; throws when something is out of bounds, overlaps or lies outside the bags. */
export function boardOf(w: number, h: number, bags: readonly Placement[], items: readonly Placement[], shapeOf: ShapeOf): Board {
  const b = emptyBoard(w, h, bags, shapeOf);
  items.forEach((p, i) => {
    const s = shapeOf(p.item, p.rot);
    if (!fits(b, s, p.x, p.y)) throw new Error(`${p.item} does not fit at ${p.x},${p.y}`);
    stamp(b, s, p.x, p.y, i);
  });
  return b;
}

/** Indices of the items lying on the stars of item i. */
export function starred(b: Board, items: readonly Placement[], i: number, shapeOf: ShapeOf): number[] {
  const p = items[i]!,
    s = shapeOf(p.item, p.rot),
    out: number[] = [];
  for (const [sx, sy] of s.stars) {
    const px = p.x + sx,
      py = p.y + sy;
    if (px < 0 || py < 0 || px >= b.w || py >= b.h) continue;
    const o = b.occ[py * b.w + px]!;
    if (o >= 0 && o !== i && !out.includes(o)) out.push(o);
  }
  return out;
}

/** Indices of the items sharing an edge with item i. */
export function neighbours(b: Board, items: readonly Placement[], i: number, shapeOf: ShapeOf): number[] {
  const p = items[i]!,
    s = shapeOf(p.item, p.rot),
    out: number[] = [];
  for (const [cx, cy] of s.cells)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const px = p.x + cx + dx,
        py = p.y + cy + dy;
      if (px < 0 || py < 0 || px >= b.w || py >= b.h) continue;
      const o = b.occ[py * b.w + px]!;
      if (o >= 0 && o !== i && !out.includes(o)) out.push(o);
    }
  return out;
}

/** Indices of the bags item i lies on. */
export function bagsUnder(b: Board, items: readonly Placement[], i: number, shapeOf: ShapeOf): number[] {
  const p = items[i]!,
    out: number[] = [];
  for (const [cx, cy] of shapeOf(p.item, p.rot).cells) {
    const o = b.bag[(p.y + cy) * b.w + p.x + cx]!;
    if (o >= 0 && !out.includes(o)) out.push(o);
  }
  return out;
}
