/**
 * Draws items and bags as tiles: the shape in cells with the rarity frame, and inside either the item's picture
 * (`art/items/<id>.png`, see docs/client-art.md) or, while it has none, a type symbol and the item's initials.
 */
import { Container, Graphics, Sprite } from "pixi.js";
import { artTexture } from "./art";
import { PET_KINDS, starLinks, type GameData, type ItemDef, type Placement, type StarLink } from "@backpack-space/core";
import { C, RARITY, TAG_FILL } from "./theme";
import { icon } from "./icons";
import { at, disc, txt } from "./ui";
import type { Chip, Row } from "./symbols";
import { tr } from "./i18n";

/** "Plasma Sword" -> "PS"; a one-word name ("Plasmaschwert") keeps two letters -> "PL" */
export const initials = (name: string) => {
  const words = name.replace(/[^\p{L}\p{N} -]/gu, "").split(/[ -]+/).filter(Boolean);
  return (words.length === 1 ? words[0]!.slice(0, 2) : words.map((w) => w[0]!).slice(0, 3).join("")).toLocaleUpperCase();
};

/** bare: an item with a picture is drawn as the picture alone, without tile and frame (shop offers). */
export interface PieceOpts { stars?: boolean; label?: boolean; alpha?: number; line?: number; bare?: boolean }

/** The symbol on an item's tile: its first type, but a pet shows its kind (beast or swarm) when it has one. */
function tileIcon(def: ItemDef): string {
  if (def.isBag) return "bag";
  return def.tags.find((t) => (PET_KINDS as readonly string[]).includes(t)) ?? def.tags[0] ?? "any";
}

/** An item or bag; origin at the top-left corner of its bounding box. */
export function piece(data: GameData, id: string, rot: number, cell: number, o: PieceOpts = {}): Container {
  const def = data.items.get(id)!;
  const s = data.shape(id, rot);
  const c = new Container();
  if (o.bare && !def.isBag) {
    const pic = itemArt(data, id, rot, cell);
    if (pic) { pic.alpha = o.alpha ?? 1; c.addChild(pic); return c; }
  }
  const g = new Graphics();
  const pad = def.isBag ? 0 : Math.max(1.5, cell * 0.06);
  const fill = def.isBag ? C.bag : TAG_FILL[def.tags[0] ?? "bag"] ?? C.line;
  const line = o.line ?? (def.isBag ? C.bagLine : RARITY[def.rarity] ?? C.dim);
  const has = new Set(s.cells.map(([x, y]) => `${x},${y}`));
  // one rectangle per cell, grown over the seam towards neighbouring cells so the shape reads as one piece
  for (const [x, y] of s.cells) {
    const l = has.has(`${x - 1},${y}`) ? 0 : pad, t = has.has(`${x},${y - 1}`) ? 0 : pad;
    const r = has.has(`${x + 1},${y}`) ? 0 : pad, b = has.has(`${x},${y + 1}`) ? 0 : pad;
    g.rect(x * cell + l, y * cell + t, cell - l - r, cell - t - b);
  }
  // with a picture the type colour stays only as a faint tint, so it does not fight the picture's own colours
  const tint = !def.isBag && artTexture(`items/${id}`) ? 0.22 : 1;
  g.fill({ color: fill, alpha: (o.alpha ?? 1) * tint });
  // outline: every cell edge that has no neighbour
  const lw = def.isBag ? 1 : Math.max(1.5, cell * 0.05);
  for (const [x, y] of s.cells) {
    const x0 = x * cell + pad, y0 = y * cell + pad, x1 = (x + 1) * cell - pad, y1 = (y + 1) * cell - pad;
    if (!has.has(`${x},${y - 1}`)) g.moveTo(x0, y0).lineTo(x1, y0);
    if (!has.has(`${x},${y + 1}`)) g.moveTo(x0, y1).lineTo(x1, y1);
    if (!has.has(`${x - 1},${y}`)) g.moveTo(x0, y0).lineTo(x0, y1);
    if (!has.has(`${x + 1},${y}`)) g.moveTo(x1, y0).lineTo(x1, y1);
  }
  g.stroke({ width: lw, color: line, cap: "square" });
  if (def.isBag) for (const [x, y] of s.cells) g.rect(x * cell, y * cell, cell, cell).stroke({ width: 1, color: C.bagLine, alpha: 0.5 });
  c.addChild(g);
  // symbol + initials in the cell closest to the middle
  const mx = (s.w - 1) / 2, my = (s.h - 1) / 2;
  const mid = [...s.cells].sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my))[0]!;
  const cx = mid[0] * cell + cell / 2, cy = mid[1] * cell + cell / 2;
  const label = o.label !== false && cell >= 26;
  const pic = def.isBag ? null : itemArt(data, id, rot, cell);
  if (pic) c.addChild(pic);
  else if (!def.isBag || o.label !== false) {
    c.addChild(at(icon(tileIcon(def), cell * (label ? 0.42 : 0.55), def.isBag ? C.dim : C.text), cx, cy - (label ? cell * 0.12 : 0)));
    if (label) c.addChild(at(txt(initials(tr().item(id)), cell * 0.24, { color: def.isBag ? C.dim : C.text, anchor: [0.5, 0.5] }), cx, cy + cell * 0.27));
  }
  if (o.stars) for (const [x, y] of s.stars) c.addChild(at(icon("starFull", cell * 0.45, C.gold), x * cell + cell / 2, y * cell + cell / 2));
  return c;
}

/**
 * The item's picture over its bounding box, turned with the item. The file is drawn for rotation 0 at
 * width × height of the unturned shape in cells. Returns null while the item has no picture.
 */
function itemArt(data: GameData, id: string, rot: number, cell: number): Sprite | null {
  const tex = artTexture(`items/${id}`);
  if (!tex) return null;
  const s0 = data.shape(id, 0), s = data.shape(id, rot);
  const sp = new Sprite(tex);
  sp.anchor.set(0.5);
  sp.width = s0.w * cell;
  sp.height = s0.h * cell;
  sp.rotation = (rot & 3) * Math.PI / 2;
  sp.position.set(s.w * cell / 2, s.h * cell / 2);
  return sp;
}

/** A piece scaled to fit a box, centred in it. Origin top-left of the box. */
export function pieceFit(data: GameData, id: string, w: number, h: number, maxCell: number, o: PieceOpts = {}): Container {
  const s = data.shape(id, 0);
  const cell = Math.min(maxCell, w / s.w, h / s.h);
  const p = piece(data, id, 0, cell, o);
  p.position.set((w - s.w * cell) / 2, (h - s.h * cell) / 2);
  const c = new Container();
  c.addChild(p);
  return c;
}

/** One chip of a symbol row. Returns the container and its width. */
export function chip(ch: Chip, size = 32): { node: Container; w: number } {
  const c = new Container();
  const label = ch.text ? txt(ch.text, size * 0.5, { anchor: [0, 0.5] }) : null;
  if (ch.kind === "trigger") {
    const w = (label ? label.width + 6 : 0) + size * 0.5 + 18;
    const g = new Graphics().roundRect(0, 0, w, size, size / 2).stroke({ width: 1.5, color: C.dim, alignment: 1 });
    c.addChild(g, at(icon(ch.icon, size * 0.5, C.text), 9 + size * 0.25, size / 2));
    if (label) c.addChild(at(label, 9 + size * 0.5 + 5, size / 2));
    return { node: c, w };
  }
  if (ch.kind === "plain") {
    let x = 0;
    if (label) { label.style.fill = C.dim; c.addChild(at(label, 0, size / 2)); x = label.width + 3; }
    c.addChild(at(icon(ch.icon, size * 0.55, C.dim), x + size * 0.275, size / 2));
    return { node: c, w: x + size * 0.55 };
  }
  const buff = ch.kind === "buff";
  const g = new Graphics().roundRect(0, 0, size, size, size * 0.25).fill(buff ? C.text : C.bg).stroke({ width: 1.5, color: C.text, alignment: 1 });
  c.addChild(g, at(icon(ch.icon, size * 0.58, buff ? C.bg : C.text), size / 2, size / 2));
  let w = size;
  if (label) { label.style.fontSize = size * 0.56; c.addChild(at(label, size + 4, size / 2)); w += 4 + label.width; }
  return { node: c, w };
}

/** A symbol row laid out left to right, wrapping at maxW. Returns the node and its height. */
export function symbolRow(row: Row, maxW: number, size = 32): { node: Container; h: number } {
  const c = new Container();
  let x = 0, y = 0;
  const gap = 6;
  const put = (node: Container, w: number) => {
    if (x > 0 && x + w > maxW) { x = size * 0.6; y += size + 6; }
    node.position.set(x, y);
    c.addChild(node);
    x += w + gap;
  };
  for (const ch of row.when) { const k = chip(ch, size); put(k.node, k.w); }
  const arrow = new Container();
  arrow.addChild(at(icon("arrow", 14, C.dim), 7, size / 2));
  put(arrow, 14);
  for (const ch of row.then) { const k = chip(ch, size); put(k.node, k.w); }
  return { node: c, h: y + size };
}

/**
 * The stars of a placed backpack that have an item on them, drawn on the edge between the two items:
 * gold when the star's effect counts that item, faint when it lies there without effect. Origin = top-left of the grid.
 */
export function starMarks(data: GameData, bags: readonly Placement[], items: readonly Placement[], cell: number): Container {
  const c = new Container();
  let links: StarLink[];
  try { links = starLinks(data, bags, items); } catch { return c; }
  const seen = new Set<string>();
  // active stars last, so they sit on top
  for (const l of [...links].sort((a, b) => Number(a.active) - Number(b.active))) {
    const p = items[l.from]!;
    const [sx, sy] = l.star;
    const near = data.shape(p.item, p.rot).cells.map(([x, y]) => [p.x + x, p.y + y] as const).sort((a, b) => Math.hypot(a[0] - sx, a[1] - sy) - Math.hypot(b[0] - sx, b[1] - sy))[0]!;
    const mx = ((near[0] + sx) / 2 + 0.5) * cell, my = ((near[1] + sy) / 2 + 0.5) * cell;
    const key = `${mx},${my}`;
    if (seen.has(key) && !l.active) continue;
    seen.add(key);
    const r = cell * 0.2;
    if (l.active) c.addChild(at(disc(r, { fill: C.bgDeep, line: C.gold, lineW: 1.5 }), mx, my), at(icon("starFull", r * 1.45, C.gold), mx, my));
    else c.addChild(at(icon("star", r * 1.3, C.dim), mx, my)).alpha = 0.6;
  }
  return c;
}

/**
 * An item as a square icon of one fixed size, whatever its shape: type symbol and initials on the type colour, rarity frame.
 * Used where items stand side by side (recipes). Origin top-left. The item's picture replaces symbol and initials.
 */
export function itemIcon(data: GameData, id: string, size: number, o: { line?: number } = {}): Container {
  const def = data.items.get(id)!;
  const c = new Container();
  const fill = def.isBag ? C.bag : TAG_FILL[def.tags[0] ?? "bag"] ?? C.line;
  c.addChild(new Graphics().roundRect(0, 0, size, size, size * 0.2).fill(fill).stroke({ width: Math.max(2, size * 0.05), color: o.line ?? (def.isBag ? C.bagLine : RARITY[def.rarity] ?? C.dim), alignment: 1 }));
  const tex = def.isBag ? null : artTexture(`items/${id}`);
  if (tex) {
    const sp = new Sprite(tex), k = size * 0.86 / Math.max(tex.width, tex.height);
    sp.anchor.set(0.5);
    sp.scale.set(k);
    c.addChild(at(sp, size / 2, size / 2));
    return c;
  }
  c.addChild(at(icon(tileIcon(def), size * 0.42, C.text), size / 2, size * 0.4));
  c.addChild(at(txt(initials(tr().item(id)), size * 0.22, { anchor: [0.5, 0.5] }), size / 2, size * 0.77));
  return c;
}

/** The outline of a piece (every cell edge without a neighbour) as one path, for glows. Origin as in `piece`. */
export function outlinePath(g: Graphics, data: GameData, id: string, rot: number, cell: number, grow = 0): Graphics {
  const s = data.shape(id, rot);
  const has = new Set(s.cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of s.cells) {
    const x0 = x * cell - (has.has(`${x - 1},${y}`) ? 0 : grow), x1 = (x + 1) * cell + (has.has(`${x + 1},${y}`) ? 0 : grow);
    const y0 = y * cell - (has.has(`${x},${y - 1}`) ? 0 : grow), y1 = (y + 1) * cell + (has.has(`${x},${y + 1}`) ? 0 : grow);
    if (!has.has(`${x},${y - 1}`)) g.moveTo(x0, y0).lineTo(x1, y0);
    if (!has.has(`${x},${y + 1}`)) g.moveTo(x0, y1).lineTo(x1, y1);
    if (!has.has(`${x - 1},${y}`)) g.moveTo(x0, y0).lineTo(x0, y1);
    if (!has.has(`${x + 1},${y}`)) g.moveTo(x1, y0).lineTo(x1, y1);
  }
  return g;
}

/** Colour of the merge hints: the soft glow on items that could merge and the energy beam while dragging. */
export const ZAP = C.zap;

/** A jagged energy beam from (x0, y0) to (x1, y1). `rnd` returns 0..1; a new one each frame makes it flicker. */
export function zap(g: Graphics, x0: number, y0: number, x1: number, y1: number, rnd: () => number, alpha = 1): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  const n = Math.max(3, Math.round(len / 16));
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  const pts: number[] = [x0, y0];
  for (let k = 1; k < n; k++) {
    const f = k / n, off = (rnd() - 0.5) * 14 * Math.sin(Math.PI * f);
    pts.push(x0 + (x1 - x0) * f + nx * off, y0 + (y1 - y0) * f + ny * off);
  }
  pts.push(x1, y1);
  const line = (w: number, color: number, a: number) => { g.moveTo(pts[0]!, pts[1]!); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k]!, pts[k + 1]!); g.stroke({ width: w, color, alpha: a * alpha, join: "round", cap: "round" }); };
  line(8, ZAP, 0.18);
  line(3.5, ZAP, 0.55);
  line(1.5, 0xffffff, 0.95);
  g.circle(x1, y1, 5).fill({ color: ZAP, alpha: 0.35 * alpha }).circle(x1, y1, 2.5).fill({ color: 0xffffff, alpha: 0.9 * alpha });
}
