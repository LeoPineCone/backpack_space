/**
 * Shop and backpack on one screen. Buying is dragging: into a bag to place it, anywhere else to let it drop below the backpack.
 * Tapping a piece opens its popup. Every rule decision is made by the core; this screen only asks and draws.
 */
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from "pixi.js";
import {
  boardOf, buy, combine, dropBag, dropItem, findCombos, moveBag, moveItem, placeLoose, reroll, sellBag, sellItem, sellLoose, sellPrice, toggleFreeze,
  type Combo, type RunState, type Spot,
} from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, RARITY, RARITY_PIPS, W } from "../theme";
import { icon } from "../icons";
import { at, box, disc, hearts, hudPill, pillButton, roundButton, tappable, txt } from "../ui";
import { piece, pieceFit } from "../pieces";
import { heroPopup, itemPopup } from "./popup";
import { specialOverlay } from "./special";
import { battleScene } from "./battle";

type Src = { kind: "offer" | "loose" | "item" | "bag"; i: number };

const CELL = 40, GX = 15, GY = 276;
const OFFER = { x: 15, y: 70, w: 114, h: 92, gap: 9 };
const FLOOR = { x: 15, y: 566, w: 360, h: 104 };
const SELL = { x: 343, y: 796, r: 32 };

interface Drag {
  src: Src; id: string; rot: number; pointerId: number; touch: boolean;
  startX: number; startY: number; active: boolean;
  /** from the piece's top-left corner to the pointer */
  grabX: number; grabY: number;
  ghost: Container | null; mark: Graphics | null;
  spot: Spot | null; ok: boolean;
}

export function shopScene(game: Game): Scene {
  const root = new Container();
  const view = new Container(), dragLayer = new Container();
  root.addChild(view, dragLayer);
  root.eventMode = "static";
  root.hitArea = new Rectangle(0, 0, W, 844);
  const data = game.data, rules = data.rules;
  const run = (): RunState => game.run!;
  let drag: Drag | null = null;
  let sellLabel: Container | null = null;
  let specialOpen = false;

  const srcItem = (s: Src): string => { const r = run(); return s.kind === "offer" ? r.offers[s.i]!.item : s.kind === "loose" ? r.loose[s.i]! : s.kind === "item" ? r.items[s.i]!.item : r.bags[s.i]!.item; };
  const applyTo = (r: RunState, s: Src, spot: Spot): boolean => {
    switch (s.kind) {
      case "offer": return buy(r, data, s.i, spot);
      case "loose": return placeLoose(r, data, s.i, spot);
      case "item": return moveItem(r, data, s.i, spot);
      case "bag": return moveBag(r, data, s.i, spot);
    }
  };
  const canPlace = (s: Src, spot: Spot) => applyTo(structuredClone(run()), s, spot);

  // ---------- drawing ----------
  const render = () => {
    const r = run();
    view.removeChildren().forEach((c) => c.destroy({ children: true }));
    view.addChild(box(W, 844, { fill: C.bg }));

    // top bar: hero, lives, rounds, gold
    const hero = data.heroes.get(r.hero)!;
    const heroBtn = new Container();
    heroBtn.addChild(disc(22, { fill: C.panel, line: C.cyan, lineW: 2 }), txt(hero.name.replace(/[^A-Za-z]/g, "")[0]!.toUpperCase(), 18, { anchor: [0.5, 0.5] }));
    view.addChild(at(tappable(heroBtn, () => game.openOverlay(heroPopup(game, r.hero)), new Rectangle(-24, -24, 48, 48)), 37, 36));
    view.addChild(at(hearts(r.lives, rules.lives, 20), 69, 16));
    const pips = new Graphics();
    for (let i = 0; i < rules.rounds; i++) {
      const now = i === r.round - 1, rad = now ? 6 : 4, cx = 73 + i * 13;
      pips.circle(cx, 49, rad);
      if (i < r.round - 1) pips.fill(r.results[i] ? C.dim : C.line); else if (now) pips.fill(C.gold); else pips.stroke({ width: 1.5, color: C.line });
    }
    view.addChild(pips);
    const gold = hudPill("coin", r.gold, C.gold, C.gold);
    view.addChild(at(gold, W - 15 - gold.width, 14));

    // offers
    r.offers.forEach((o, i) => {
      const x = OFFER.x + (i % 3) * (OFFER.w + OFFER.gap), y = OFFER.y + Math.floor(i / 3) * (OFFER.h + OFFER.gap);
      if (!o) { view.addChild(at(box(OFFER.w, OFFER.h, { line: C.gridLine, radius: 12 }), x, y)); return; }
      const def = data.items.get(o.item)!;
      const frame = def.isBag ? C.bagLine : RARITY[def.rarity] ?? C.dim;
      const tile = new Container();
      tile.addChild(box(OFFER.w, OFFER.h, { fill: C.panel, line: frame, lineW: 2, radius: 12 }));
      tile.addChild(at(pieceFit(data, o.item, 90, 46, 24, { label: true }), 12, 16));
      if (!def.isBag) for (let p = 0; p < (RARITY_PIPS[def.rarity] ?? 1); p++) tile.addChild(at(disc(2.5, { fill: frame }), 10 + p * 8, 9));
      tile.addChild(at(icon("coin", 14, C.gold), 14, OFFER.h - 13));
      tile.addChild(at(txt(o.price, 15, { color: r.gold < o.price ? C.line : o.sale ? C.good : C.text, anchor: [0, 0.5] }), 24, OFFER.h - 13));
      tile.eventMode = "static"; tile.cursor = "grab"; tile.hitArea = new Rectangle(0, 0, OFFER.w, OFFER.h);
      tile.on("pointerdown", (e) => press({ kind: "offer", i }, e));
      const pin = new Container();
      pin.addChild(disc(15, { fill: o.frozen ? C.cyan : C.bg, line: o.frozen ? C.cyan : C.line, lineW: 2 }), icon("pin", 14, o.frozen ? C.cyanInk : C.dim));
      tile.addChild(at(tappable(pin, () => { toggleFreeze(r, i); render(); }, new Rectangle(-20, -20, 40, 40)), OFFER.w - 9, 9));
      view.addChild(at(tile, x, y));
    });

    // the backpack grid
    const { w: gw, h: gh } = rules.grid;
    const grid = new Graphics();
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) grid.rect(GX + x * CELL + 0.5, GY + y * CELL + 0.5, CELL - 1, CELL - 1);
    grid.stroke({ width: 1, color: C.gridLine });
    view.addChild(grid);
    const combos = uniqueCombos(findCombos(data, r.bags, r.items));
    const inCombo = new Set(combos.flatMap((c) => c.idxs));
    r.bags.forEach((p) => view.addChild(at(piece(data, p.item, p.rot, CELL, { label: false }), GX + p.x * CELL, GY + p.y * CELL)));
    r.items.forEach((p, i) => view.addChild(at(piece(data, p.item, p.rot, CELL, inCombo.has(i) ? { line: C.gold } : {}), GX + p.x * CELL, GY + p.y * CELL)));
    const hit = new Graphics().rect(GX, GY, gw * CELL, gh * CELL).fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.on("pointerdown", (e) => {
      const pos = root.toLocal(e.global);
      const cx = Math.floor((pos.x - GX) / CELL), cy = Math.floor((pos.y - GY) / CELL);
      const b = boardOf(gw, gh, r.bags, r.items, data.shape);
      const item = b.occ[cy * gw + cx] ?? -1, bag = b.bag[cy * gw + cx] ?? -1;
      if (item >= 0) press({ kind: "item", i: item }, e);
      else if (bag >= 0) press({ kind: "bag", i: bag }, e);
    });
    view.addChild(hit);
    // combine buttons between neighbours that make a recipe
    for (const c of combos) {
      const cells = c.idxs.flatMap((i) => { const p = r.items[i]!; return data.shape(p.item, p.rot).cells.map(([x, y]) => [p.x + x, p.y + y] as const); });
      const mx = cells.reduce((a, q) => a + q[0], 0) / cells.length, my = cells.reduce((a, q) => a + q[1], 0) / cells.length;
      const btn = new Container();
      btn.addChild(disc(20, { fill: C.gold, line: C.bg, lineW: 3 }), icon("merge", 20, C.goldInk));
      tappable(btn, () => game.openOverlay(itemPopup(game, c.recipe.out, { action: { label: "COMBINE", onTap: () => { game.closeOverlay(); combine(run(), data, c); render(); } } })), new Rectangle(-22, -22, 44, 44));
      view.addChild(at(btn, GX + (mx + 0.5) * CELL, GY + (my + 0.5) * CELL));
    }

    // loose pieces below the backpack
    view.addChild(at(box(FLOOR.w, FLOOR.h, { fill: 0x101830, radius: 14 }), FLOOR.x, FLOOR.y), at(new Graphics().rect(0, 0, FLOOR.w, 2).fill(C.line), FLOOR.x, FLOOR.y + FLOOR.h - 2));
    const shapes = r.loose.map((id) => data.shape(id, 0));
    const cellsWide = shapes.reduce((a, s) => a + s.w, 0), tallest = Math.max(1, ...shapes.map((s) => s.h));
    const lc = Math.min(26, (FLOOR.w - 24 - r.loose.length * 8) / Math.max(1, cellsWide), (FLOOR.h - 16) / tallest);
    let lx = FLOOR.x + 14;
    r.loose.forEach((id, i) => {
      const s = shapes[i]!, pw = s.w * lc, ph = s.h * lc;
      const node = piece(data, id, 0, lc, { label: lc >= 20 });
      node.pivot.set(pw / 2, ph / 2);
      node.angle = ((i * 37) % 17) - 8;
      node.position.set(lx + pw / 2, FLOOR.y + FLOOR.h - 8 - ph / 2);
      node.eventMode = "static"; node.cursor = "grab"; node.hitArea = new Rectangle(-3, -3, pw + 6, ph + 6);
      node.on("pointerdown", (e) => press({ kind: "loose", i }, e));
      view.addChild(node);
      lx += pw + 8;
    });
    if (r.loose.length >= rules.shop.looseLimit) view.addChild(at(txt(`${r.loose.length}/${rules.shop.looseLimit}`, 12, { color: C.bad, anchor: [1, 0] }), FLOOR.x + FLOOR.w - 8, FLOOR.y + 6));

    // bottom row: reroll, fight, sell
    const rr = roundButton("dice", 32, () => { if (reroll(run(), data, game.rng)) render(); else game.toast("Not enough gold"); }, { line: C.dim, iconSize: 28 });
    rr.addChild(at(disc(11, { fill: C.gold }), 24, 22), at(txt(rules.shop.rerollCost, 13, { color: C.goldInk, anchor: [0.5, 0.5] }), 24, 22));
    if (r.gold < rules.shop.rerollCost) rr.alpha = 0.5;
    view.addChild(at(rr, 47, 796));
    view.addChild(at(pillButton("FIGHT", 208, 64, () => { if (!run().special) game.show(battleScene(game)); }, { iconName: "swords" }), 91, 764));
    const bin = new Container();
    const ring = new Graphics();
    for (let k = 0; k < 16; k++) ring.arc(0, 0, SELL.r, (k * Math.PI) / 8, (k * Math.PI) / 8 + 0.24).stroke({ width: 2, color: C.dim });
    bin.addChild(ring, icon("bin", 26, C.dim));
    view.addChild(at(bin, SELL.x, SELL.y));

    if (r.special && !specialOpen) {
      specialOpen = true;
      game.openOverlay(specialOverlay(game, () => { specialOpen = false; render(); }));
    }
  };

  /** Several recipes can use the same neighbours; one button per group of items is enough. */
  const uniqueCombos = (all: Combo[]): Combo[] => {
    const seen = new Set<string>();
    return all.filter((c) => { const k = [...c.idxs].sort((a, b) => a - b).join(","); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  // ---------- pressing, dragging, dropping ----------
  const press = (src: Src, e: FederatedPointerEvent) => {
    if (drag) { if (drag.active && e.pointerId !== drag.pointerId) rotate(); return; }
    const pos = root.toLocal(e.global);
    const id = srcItem(src), r = run();
    const placed = src.kind === "item" ? r.items[src.i]! : src.kind === "bag" ? r.bags[src.i]! : null;
    const s = data.shape(id, placed?.rot ?? 0);
    const touch = e.pointerType === "touch";
    drag = {
      src, id, rot: placed?.rot ?? 0, pointerId: e.pointerId, touch, startX: pos.x, startY: pos.y, active: false,
      grabX: placed ? pos.x - (GX + placed.x * CELL) : (s.w * CELL) / 2,
      grabY: placed ? pos.y - (GY + placed.y * CELL) : (s.h * CELL) / 2 + (touch ? 44 : 0),
      ghost: null, mark: null, spot: null, ok: false,
    };
  };
  const makeGhost = () => {
    const d = drag!;
    d.ghost?.destroy({ children: true });
    d.ghost = piece(data, d.id, d.rot, CELL, { stars: true });
    d.ghost.alpha = 0.9;
    if (!d.mark) d.mark = new Graphics();
    dragLayer.addChild(d.ghost, d.mark);
  };
  const rotate = () => {
    const d = drag;
    if (!d?.active) return;
    d.rot = (d.rot + 1) & 3;
    const s = data.shape(d.id, d.rot);
    d.grabX = (s.w * CELL) / 2; d.grabY = (s.h * CELL) / 2 + (d.touch ? 44 : 0);
    makeGhost();
    follow(lastX, lastY);
  };
  let lastX = 0, lastY = 0;
  const overSell = (x: number, y: number) => Math.hypot(x - SELL.x, y - SELL.y) < SELL.r + 14;
  const follow = (x: number, y: number) => {
    const d = drag!;
    lastX = x; lastY = y;
    const s = data.shape(d.id, d.rot);
    const tx = x - d.grabX, ty = y - d.grabY;
    const { w: gw, h: gh } = rules.grid;
    const cx = tx + (s.w * CELL) / 2, cy = ty + (s.h * CELL) / 2;
    const inGrid = cx > GX - 10 && cx < GX + gw * CELL + 10 && cy > GY - 10 && cy < GY + gh * CELL + 10;
    d.mark!.clear();
    if (inGrid) {
      d.spot = { x: Math.round((tx - GX) / CELL), y: Math.round((ty - GY) / CELL), rot: d.rot };
      d.ok = canPlace(d.src, d.spot);
      for (const [px, py] of s.cells) d.mark!.rect(GX + (d.spot.x + px) * CELL, GY + (d.spot.y + py) * CELL, CELL, CELL);
      d.mark!.fill({ color: d.ok ? C.good : C.bad, alpha: 0.35 });
      d.ghost!.position.set(GX + d.spot.x * CELL, GY + d.spot.y * CELL);
    } else {
      d.spot = null; d.ok = false;
      d.ghost!.position.set(tx, ty);
    }
    // what selling would pay
    sellLabel?.destroy({ children: true }); sellLabel = null;
    if (d.src.kind !== "offer" && overSell(x, y)) {
      sellLabel = new Container();
      sellLabel.addChild(disc(SELL.r + 4, { fill: C.gold }), txt(`+${sellPrice(data, d.id)}`, 20, { color: C.goldInk, anchor: [0.5, 0.5] }));
      sellLabel.position.set(SELL.x, SELL.y);
      dragLayer.addChildAt(sellLabel, 0);
    }
  };
  const endDrag = () => {
    drag = null;
    sellLabel = null;
    dragLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
  };
  const onMove = (e: FederatedPointerEvent) => {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const pos = root.toLocal(e.global);
    if (!d.active) {
      if (Math.hypot(pos.x - d.startX, pos.y - d.startY) < 8) return;
      d.active = true;
      makeGhost();
    }
    follow(pos.x, pos.y);
  };
  const openPopup = (src: Src) => {
    const r = run(), id = srcItem(src);
    if (src.kind === "offer") { game.openOverlay(itemPopup(game, id)); return; }
    if (src.kind === "item") {
      const p = r.items[src.i]!;
      const turn = () => {
        for (let k = 1; k < 4; k++) if (moveItem(run(), data, src.i, { x: p.x, y: p.y, rot: (p.rot + k) & 3 })) { game.closeOverlay(); render(); return; }
        game.toast("No room to turn it here. Drag it and tap with a second finger, or press R.");
      };
      game.openOverlay(itemPopup(game, id, { sell: true, onRotate: data.shape(id, 0).cells.length > 1 ? turn : undefined }));
      return;
    }
    game.openOverlay(itemPopup(game, id, { sell: true }));
  };
  const onUp = (e: FederatedPointerEvent) => {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const pos = root.toLocal(e.global);
    const src = d.src, r = run();
    if (!d.active) { endDrag(); openPopup(src); return; }
    const { spot, ok } = d;
    endDrag();
    if (spot) {
      if (ok) applyTo(r, src, spot);
      else game.toast(src.kind === "offer" && r.gold < r.offers[src.i]!.price ? "Not enough gold" : src.kind === "bag" ? "A bag needs free cells and only turns while empty" : "It does not fit there");
    } else if (overSell(pos.x, pos.y)) {
      if (src.kind === "item") sellItem(r, data, src.i);
      else if (src.kind === "loose") sellLoose(r, data, src.i);
      else if (src.kind === "bag" && !sellBag(r, data, src.i)) game.toast("Only an empty bag can be sold");
    } else if (src.kind === "offer") {
      // let go below the shop: bought, and it drops below the backpack
      if (pos.y > GY - 8 && !buy(r, data, src.i)) game.toast(r.gold < r.offers[src.i]!.price ? "Not enough gold" : "Too many loose items. Place or sell one first.");
    } else if (src.kind === "item") dropItem(r, src.i);
    else if (src.kind === "bag") dropBag(r, data, src.i);
    render();
  };
  root.on("pointermove", onMove);
  root.on("pointerup", onUp);
  root.on("pointerupoutside", onUp);
  root.on("pointercancel", () => { if (drag) { endDrag(); render(); } });
  // a second finger anywhere turns the dragged piece
  root.on("pointerdown", (e) => { if (drag?.active && e.pointerId !== drag.pointerId) rotate(); });
  const onKey = (e: KeyboardEvent) => { if (e.key === "r" || e.key === "R") rotate(); };
  const onWheel = (e: WheelEvent) => { if (drag?.active) { e.preventDefault(); rotate(); } };
  window.addEventListener("keydown", onKey);
  window.addEventListener("wheel", onWheel, { passive: false });

  render();
  return { root, destroy: () => { window.removeEventListener("keydown", onKey); window.removeEventListener("wheel", onWheel); } };
}
