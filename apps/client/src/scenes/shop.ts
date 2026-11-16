/**
 * Shop and backpack on one screen. Buying is dragging: into a bag to place it, anywhere else to let it drop below the backpack.
 * Tapping a piece opens its popup. Every rule decision is made by the core; this screen only asks and draws.
 */
import { Container, Graphics, Rectangle, type FederatedPointerEvent } from "pixi.js";
import {
  boardOf, buildOf, buildStats, buy, compile, dropBag, dropItem, mergePartners, moveBag, moveItem, pendingMerges, placeLoose, reroll, sellBag, sellItem, sellLoose, sellPrice, toggleFreeze, toggleLock,
  type RunState, type Spot,
} from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, RARITY, RARITY_PIPS, W } from "../theme";
import { icon } from "../icons";
import { at, box, disc, hearts, hudPill, infoButton, pillButton, roundButton, tappable, txt } from "../ui";
import { outlinePath, piece, pieceFit, starMarks, zap, ZAP } from "../pieces";
import { introOverlay, introSeen, type IntroStep } from "./intro";
import { heroPopup, itemPopup } from "./popup";
import { specialOverlay } from "./special";
import { battleScene } from "./battle";
import { fmt, statsOverlay } from "./stats";
import { t } from "../i18n";

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
  let introOpen = false;
  const later: (() => void)[] = [];
  // merge hints: everything on screen (offers, loose items, backpack items) in one list; locked items and empty slots are null
  let partners: Set<number>[] = [];
  let centers: { x: number; y: number }[] = [];
  let glows: Graphics[] = [];
  let beams: Graphics | null = null;
  let clock = 0, beamAge = 1;
  // energy beams that stay between backpack items which will merge after the fight (from the core's pendingMerges)
  let fuseBeams: Graphics | null = null;
  let fuseLinks: [number, number, number, number][] = [];
  let fuseAge = 1;
  const poolIndex = (src: Src): number => { const r = run(); return src.kind === "offer" ? src.i : src.kind === "loose" ? r.offers.length + src.i : src.kind === "item" ? r.offers.length + r.loose.length + src.i : -1; };
  /** a soft pulsing outline; drawn into `g`, kept for the animation */
  const glow = (g: Graphics, draw: (g: Graphics) => void): Graphics => {
    draw(g); g.stroke({ width: 7, color: ZAP, alpha: 0.16 });
    draw(g); g.stroke({ width: 2.5, color: ZAP, alpha: 0.85 });
    glows.push(g);
    return g;
  };

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
    glows = [];
    const ids = [...r.offers.map((o) => o?.item ?? null), ...r.loose, ...r.items.map((p) => (p.lock ? null : p.item))];
    partners = mergePartners(data, ids);
    centers = ids.map(() => ({ x: 0, y: 0 }));
    const canMerge = (k: number) => partners[k]!.size > 0;

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
    view.addChild(at(infoButton(15, () => openIntro()), W - 15 - gold.width - 26, 36));


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
      centers[i] = { x: x + OFFER.w / 2, y: y + OFFER.h / 2 };
      if (canMerge(i)) tile.addChild(glow(new Graphics(), (g) => g.roundRect(-2, -2, OFFER.w + 4, OFFER.h + 4, 14)));
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
    const combos = pendingMerges(data, r.bags, r.items);
    const inCombo = new Set(combos.flatMap((c) => c.idxs));
    r.bags.forEach((p) => view.addChild(at(piece(data, p.item, p.rot, CELL, { label: false }), GX + p.x * CELL, GY + p.y * CELL)));
    r.items.forEach((p, i) => view.addChild(at(piece(data, p.item, p.rot, CELL, inCombo.has(i) ? { line: C.gold } : {}), GX + p.x * CELL, GY + p.y * CELL)));
    // items that could merge with something on screen glow softly (a locked item never does)
    r.items.forEach((p, i) => {
      const k = r.offers.length + r.loose.length + i;
      const cells = data.shape(p.item, p.rot).cells;
      centers[k] = { x: GX + (p.x + cells.reduce((a, q) => a + q[0], 0) / cells.length + 0.5) * CELL, y: GY + (p.y + cells.reduce((a, q) => a + q[1], 0) / cells.length + 0.5) * CELL };
      if (canMerge(k)) view.addChild(at(glow(new Graphics(), (g) => outlinePath(g, data, p.item, p.rot, CELL, -1)), GX + p.x * CELL, GY + p.y * CELL));
    });
    // a locked item does not merge
    r.items.forEach((p) => {
      if (!p.lock) return;
      const [cx, cy] = data.shape(p.item, p.rot).cells[0]!;
      view.addChild(at(disc(9, { fill: C.bg, line: C.text }), GX + (p.x + cx) * CELL + 11, GY + (p.y + cy) * CELL + 11), at(icon("lock", 11, C.text), GX + (p.x + cx) * CELL + 11, GY + (p.y + cy) * CELL + 11));
    });
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
    // stars that have an item on them, so it shows which items work together
    view.addChild(at(starMarks(data, r.bags, r.items, CELL), GX, GY));
    // items that will merge after the fight stay joined by an energy beam, like the beam while dragging
    const itemCenter = (i: number) => centers[r.offers.length + r.loose.length + i]!;
    fuseLinks = [];
    for (const c of combos) {
      const joined = [c.idxs[0]!];
      for (const i of c.idxs.slice(1)) {
        const a = itemCenter(i);
        const near = joined.reduce((best, j) => (Math.hypot(itemCenter(j).x - a.x, itemCenter(j).y - a.y) < Math.hypot(itemCenter(best).x - a.x, itemCenter(best).y - a.y) ? j : best));
        const b = itemCenter(near);
        fuseLinks.push([b.x, b.y, a.x, a.y]);
        joined.push(i);
      }
    }
    fuseBeams = new Graphics();
    fuseAge = 1;
    view.addChild(fuseBeams);
    // a mark between neighbours that will merge after the fight; tapping it shows the result
    for (const c of combos) {
      const cells = c.idxs.flatMap((i) => { const p = r.items[i]!; return data.shape(p.item, p.rot).cells.map(([x, y]) => [p.x + x, p.y + y] as const); });
      // in the top right corner of the group, so the beam between the items stays visible
      const right = Math.max(...cells.map((q) => q[0])), top = Math.min(...cells.map((q) => q[1]));
      const btn = new Container();
      btn.addChild(disc(14, { fill: C.gold, line: C.bg, lineW: 2.5 }), icon("merge", 15, C.goldInk));
      tappable(btn, () => { game.openOverlay(itemPopup(game, c.recipe.out)); game.toast(t("toast.mergesAfterFight")); }, new Rectangle(-22, -22, 44, 44));
      view.addChild(at(btn, GX + (right + 1) * CELL - 4, GY + top * CELL + 4));
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
      const k = r.offers.length + i;
      centers[k] = { x: node.x, y: node.y };
      if (canMerge(k)) node.addChild(glow(new Graphics(), (g) => outlinePath(g, data, id, 0, lc, 1)));
      view.addChild(node);
      lx += pw + 8;
    });
    if (r.loose.length >= rules.shop.looseLimit) view.addChild(at(txt(`${r.loose.length}/${rules.shop.looseLimit}`, 12, { color: C.bad, anchor: [1, 0] }), FLOOR.x + FLOOR.w - 8, FLOOR.y + 6));

    // running numbers between the loose items and the bottom row: health for the next fight, Energy used / gained per second, all numbers
    {
      const st = buildStats(compile(buildOf(r), data), rules);
      const short = st.energy.need > st.energy.income + 1e-9;
      const row = new Container();
      const health = hudPill("maxHp", st.maxHp, C.line, C.good, 34);
      tappable(health, () => game.toast(t("toast.roundHealth", { n: r.round, base: rules.heroHp[r.round - 1]! })), new Rectangle(0, 0, health.width, 34));
      const energy = hudPill("energy", `${fmt(st.energy.need)} / ${fmt(st.energy.income)}`, short ? C.bad : C.line, short ? C.bad : C.gold, 34);
      tappable(energy, () => game.toast(t(short ? "toast.energyShort" : "toast.energyOk", { need: fmt(st.energy.need), income: fmt(st.energy.income) })), new Rectangle(0, 0, energy.width, 34));
      const more = roundButton("chart", 17, () => game.openOverlay(statsOverlay(game)), { line: C.dim, iconSize: 18 });
      row.addChild(health, at(energy, health.width + 8, 0), at(more, health.width + 8 + energy.width + 8 + 17, 17));
      view.addChild(at(row, (W - row.width) / 2, FLOOR.y + FLOOR.h + 12));
    }

    // bottom row: reroll, fight, sell
    const rr = roundButton("dice", 32, () => { if (reroll(run(), data, game.rng)) render(); else game.toast(t("toast.notEnoughGold")); }, { line: C.dim, iconSize: 28 });
    rr.addChild(at(disc(11, { fill: C.gold }), 24, 22), at(txt(rules.shop.rerollCost, 13, { color: C.goldInk, anchor: [0.5, 0.5] }), 24, 22));
    if (r.gold < rules.shop.rerollCost) rr.alpha = 0.5;
    view.addChild(at(rr, 47, 796));
    view.addChild(at(pillButton(t("ui.fight"), 208, 64, () => { if (!run().special) game.show(battleScene(game)); }, { iconName: "swords" }), 91, 764));
    const bin = new Container();
    const ring = new Graphics();
    for (let k = 0; k < 16; k++) ring.arc(0, 0, SELL.r, (k * Math.PI) / 8, (k * Math.PI) / 8 + 0.24).stroke({ width: 2, color: C.dim });
    bin.addChild(ring, icon("bin", 26, C.dim));
    view.addChild(at(bin, SELL.x, SELL.y));

    // popups wait for the next frame: this screen may still be on its way in, and showing a screen closes all popups
    if (r.special && !specialOpen) {
      specialOpen = true;
      later.push(() => game.openOverlay(specialOverlay(game, () => { specialOpen = false; render(); })));
    }
    if (!introOpen && !introSeen()) { introOpen = true; later.push(openIntro); }
    game.save();
  };

  // ---------- the introduction on the first run ----------
  const openIntro = () => {
    introOpen = true;
    const { w: gw, h: gh } = rules.grid;
    const pack = { x: GX, y: GY, w: gw * CELL, h: gh * CELL };
    const steps: IntroStep[] = [
      { spot: { x: OFFER.x, y: OFFER.y, w: 3 * OFFER.w + 2 * OFFER.gap, h: 2 * OFFER.h + OFFER.gap }, icons: ["coin", "arrow", "bag"], line: t("intro.buy") },
      { spot: pack, icons: ["starFull"], line: t("intro.stars") },
      { spot: pack, icons: ["merge", "lock"], line: t("intro.merge") },
      { spot: { x: SELL.x - SELL.r, y: SELL.y - SELL.r, w: SELL.r * 2, h: SELL.r * 2 }, icons: ["arrow", "bin", "coin"], line: t("intro.sell") },
      { spot: { x: 91, y: 764, w: 208, h: 64 }, icons: ["swords"], line: t("intro.fight") },
    ];
    game.openOverlay(introOverlay(game, steps));
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
    beams = null;
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
        game.toast(t("toast.noRoomToTurn"));
      };
      const lock = data.recipesWith.has(id) ? { label: t(p.lock ? "ui.unlock" : "ui.lock"), onTap: () => { toggleLock(run(), src.i); game.closeOverlay(); render(); } } : undefined;
      game.openOverlay(itemPopup(game, id, { sell: true, onRotate: data.shape(id, 0).cells.length > 1 ? turn : undefined, action: lock }));
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
      else game.toast(t(src.kind === "offer" && r.gold < r.offers[src.i]!.price ? "toast.notEnoughGold" : src.kind === "bag" ? "toast.bagNeedsRoom" : "toast.doesNotFit"));
    } else if (overSell(pos.x, pos.y)) {
      if (src.kind === "item") sellItem(r, data, src.i);
      else if (src.kind === "loose") sellLoose(r, data, src.i);
      else if (src.kind === "bag" && !sellBag(r, data, src.i)) game.toast(t("toast.onlyEmptyBag"));
    } else if (src.kind === "offer") {
      // let go below the shop: bought, and it drops below the backpack
      if (pos.y > GY - 8 && !buy(r, data, src.i)) game.toast(t(r.gold < r.offers[src.i]!.price ? "toast.notEnoughGold" : "toast.tooManyLoose"));
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
  later.push(() => game.toast(t("toast.roundHealth", { n: run().round, base: rules.heroHp[run().round - 1]! })));
  /** the soft pulse on items that could merge; while dragging, energy beams from the dragged item to its partners */
  const animate = (dt: number) => {
    clock += dt;
    const d = drag?.active ? drag : null;
    const mine = d ? partners[poolIndex(d.src)] : undefined;
    const pulse = 0.45 + 0.3 * Math.sin(clock * 2.4);
    glows.forEach((g) => { g.alpha = pulse; });
    if (fuseBeams) {
      fuseBeams.visible = !d;
      fuseAge += dt;
      if (!d && fuseAge >= 0.09) {
        fuseAge = 0;
        fuseBeams.clear();
        for (const [x0, y0, x1, y1] of fuseLinks) zap(fuseBeams, x0, y0, x1, y1, Math.random, 0.85);
      }
    }
    if (!d || !d.ghost || !mine?.size) { beams?.clear(); return; }
    if (!beams) { beams = new Graphics(); dragLayer.addChildAt(beams, 0); }
    beamAge += dt;
    if (beamAge < 0.06) return;
    beamAge = 0;
    const s = data.shape(d.id, d.rot);
    const fx = d.ghost.x + (s.w * CELL) / 2, fy = d.ghost.y + (s.h * CELL) / 2;
    beams.clear();
    for (const k of mine) zap(beams, fx, fy, centers[k]!.x, centers[k]!.y, Math.random);
  };

  return { root, update: (dt) => { for (const f of later.splice(0)) f(); animate(dt); }, destroy: () => { window.removeEventListener("keydown", onKey); window.removeEventListener("wheel", onWheel); } };
}
