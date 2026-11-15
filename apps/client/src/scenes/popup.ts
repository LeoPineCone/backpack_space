/** Popups: what an item or hero does (symbols first, words behind the "i" button) and the glossary. */
import { Container, Graphics, Rectangle } from "pixi.js";
import { describeHero, describeItem, sellPrice } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, RARITY, RARITY_PIPS, W } from "../theme";
import { icon } from "../icons";
import { at, box, dimmer, disc, infoButton, pillButton, roundButton, tappable, txt } from "../ui";
import { pieceFit, symbolRow } from "../pieces";
import { GLOSSARY_GROUPS, heroRows, itemRows, keywordsIn, type Keyword, type Row } from "../symbols";
import { t, tr, upper } from "../i18n";

const PW = 330, PAD = 16, IW = PW - PAD * 2;

interface Subject {
  name: string;
  line: number;
  pips: number;
  /** drawn below the header in the main view */
  art?: () => Container;
  artH?: number;
  tags: string[];
  rows: Row[];
  /** exact generated wording, shown in the legend */
  lines: string[];
  recipes?: { ins: string[]; out: string }[];
  sell?: number;
  action?: { label: string; onTap: () => void };
  onRotate?: () => void;
}

function keywordRow(kw: Keyword, w: number): { node: Container; h: number } {
  const c = new Container();
  const text = txt(kw.text, 12, { font: "text", color: C.dim, wrap: w - 72, lineHeight: 16 });
  const h = Math.max(56, 30 + text.height + 10);
  c.addChild(box(w, h, { fill: C.bg, radius: 12 }));
  c.addChild(at(box(40, 40, { fill: C.bg, line: C.text, radius: 10 }), 10, (h - 40) / 2), at(icon(kw.icon, 22, C.text), 30, h / 2));
  c.addChild(at(txt(kw.word, 15), 62, 9), at(text, 62, 29));
  return { node: c, h };
}

function subjectPopup(game: Game, s: Subject): Scene {
  const root = new Container();
  let legend = false;
  const close = () => game.closeOverlay();

  const build = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    root.addChild(dimmer(W, H, close));
    const col = new Container();
    let y = PAD;
    const add = (node: Container, h: number, gap = 14, centerW?: number) => {
      node.position.set(PAD + (centerW !== undefined ? (IW - centerW) / 2 : 0), y);
      col.addChild(node);
      y += h + gap;
    };
    // header
    const head = new Container();
    head.addChild(at(infoButton(22, () => { legend = !legend; build(); }, legend), 22, 22));
    if (legend) head.addChild(at(txt(upper(s.name), 16, { spacing: 0.5, anchor: [0.5, 0.5], wrap: IW - 100, align: "center" }), IW / 2, 22));
    else for (let i = 0; i < s.pips; i++) head.addChild(at(disc(4.5, { fill: s.line }), IW / 2 - ((s.pips - 1) * 13) / 2 + i * 13, 22));
    head.addChild(at(roundButton("close", 22, close, { fill: C.panel, line: C.line, iconSize: 18 }), IW - 22, 22));
    add(head, 44);

    if (!legend) {
      if (s.art) add(s.art(), s.artH ?? 110);
      const name = txt(upper(s.name), 22, { spacing: 0.7, wrap: IW, align: "center" });
      add(name, name.height, 12, name.width);
      if (s.tags.length) {
        const tags = new Container();
        s.tags.forEach((t, i) => tags.addChild(at(disc(18, { fill: C.bg, line: C.line }), i * 44 + 18, 18), at(icon(t, 18, C.text), i * 44 + 18, 18)));
        add(tags, 36, 14, s.tags.length * 44 - 8);
      }
      if (s.rows.length) {
        const inner = new Container();
        let ry = 12;
        for (const r of s.rows) { const sr = symbolRow(r, IW - 24); sr.node.position.set(12, ry); inner.addChild(sr.node); ry += sr.h + 10; }
        const panel = new Container();
        panel.addChild(box(IW, ry + 2, { fill: C.bg, radius: 14 }), inner);
        add(panel, ry + 2);
      }
      for (const r of (s.recipes ?? []).slice(0, 2)) {
        const row = new Container();
        let x = 0;
        r.ins.forEach((id, i) => {
          if (i > 0) { row.addChild(at(txt("+", 18, { color: C.dim, anchor: [0.5, 0.5] }), x + 9, 26)); x += 18; }
          row.addChild(at(pieceFit(game.data, id, 40, 40, 20, { label: false }), x, 6));
          x += 46;
        });
        row.addChild(at(txt("=", 18, { color: C.dim, anchor: [0.5, 0.5] }), x + 7, 26)); x += 20;
        const out = game.data.items.get(r.out)!;
        row.addChild(at(box(52, 52, { fill: C.bg, line: RARITY[out.rarity], lineW: 2, radius: 10 }), x, 0), at(pieceFit(game.data, r.out, 44, 44, 22, { label: false }), x + 4, 4));
        x += 52;
        add(row, 52, 12, x);
      }
      if (s.sell !== undefined || s.onRotate) {
        const foot = new Container();
        let x = 0;
        if (s.onRotate) { foot.addChild(at(roundButton("rotate", 20, s.onRotate, { iconSize: 20 }), 20, 20)); x = 56; }
        if (s.sell !== undefined) {
          foot.addChild(at(icon("bin", 18, C.dim), x + 9, 20), at(icon("coin", 14, C.gold), x + 30, 20));
          const v = txt(s.sell, 14, { color: C.dim, anchor: [0, 0.5] });
          foot.addChild(at(v, x + 41, 20));
          x += 41 + v.width;
        }
        add(foot, 40, 12, x);
      }
      if (s.action) add(pillButton(s.action.label, IW, 56, s.action.onTap, { size: 20 }), 56);
    } else {
      for (const kw of keywordsIn(s.rows, s.tags, game.keywords)) { const k = keywordRow(kw, IW); add(k.node, k.h, 8); }
      if (s.lines.length) {
        const t = txt(s.lines.join("\n"), 12, { font: "text", color: C.dim, wrap: IW - 8, lineHeight: 17 });
        y += 4;
        add(t, t.height, 14);
      }
      const g = new Container();
      const label = txt(t("ui.glossary"), 14, { anchor: [0, 0.5] });
      const gw = 18 + 18 + 8 + label.width + 18;
      g.addChild(box(gw, 44, { line: C.dim, radius: 22 }), at(icon("book", 18, C.text), 27, 22), at(label, 44, 22));
      tappable(g, () => game.openOverlay(glossary(game)), new Rectangle(0, 0, gw, 44));
      add(g, 44, 14, gw);
    }
    const h = y + 2;
    const panel = new Container();
    const bg = box(PW, h, { fill: C.panel, line: s.line, lineW: 2, radius: 20 });
    bg.eventMode = "static";
    panel.addChild(bg, col);
    // tall popups scroll by dragging
    const top = h <= H - 40 ? (H - h) / 2 : 20;
    panel.position.set((W - PW) / 2, top);
    if (h > H - 40) {
      let grab: number | null = null;
      bg.on("pointerdown", (e) => { grab = root.toLocal(e.global).y - panel.y; });
      root.eventMode = "static";
      root.on("pointermove", (e) => { if (grab !== null) panel.y = Math.max(H - 20 - h, Math.min(20, root.toLocal(e.global).y - grab)); });
      root.on("pointerup", () => { grab = null; });
      root.on("pointerupoutside", () => { grab = null; });
    }
    root.addChild(panel);
  };
  build();
  return { root };
}

export interface ItemPopupOpts { rot?: number; sell?: boolean; action?: { label: string; onTap: () => void }; onRotate?: () => void }

export function itemPopup(game: Game, id: string, o: ItemPopupOpts = {}): Scene {
  const data = game.data, def = data.items.get(id)!;
  const tags = def.isBag ? ["bag"] : def.tags.filter((t) => t !== "bag");
  return subjectPopup(game, {
    name: tr().item(id),
    line: def.isBag ? C.cyan : RARITY[def.rarity] ?? C.cyan,
    pips: def.isBag ? 0 : RARITY_PIPS[def.rarity] ?? 1,
    art: () => pieceFit(data, id, IW, 110, 36, { stars: true }),
    tags,
    rows: itemRows(def, data),
    lines: describeItem(def, data, tr()),
    recipes: (data.recipesWith.get(id) ?? []).map((r) => ({ ins: r.in, out: r.out })),
    sell: o.sell ? sellPrice(data, id) : undefined,
    action: o.action,
    onRotate: o.onRotate,
  });
}

export function heroPopup(game: Game, heroId: string): Scene {
  const data = game.data, hero = data.heroes.get(heroId)!;
  return subjectPopup(game, {
    name: tr().t(`hero.${hero.id}.name`),
    line: C.cyan,
    pips: 0,
    art: () => { const t = txt(upper(tr().t(`hero.${hero.id}.title`)), 13, { color: C.dim, spacing: 1.5, wrap: IW, align: "center" }); const c = new Container(); c.addChild(at(t, (IW - t.width) / 2, 0)); return c; },
    artH: 16,
    tags: [],
    rows: heroRows(hero, data),
    lines: [tr().t(`hero.${hero.id}.focus`), ...describeHero(hero, data, tr())],
  });
}

/** All keywords, grouped. Scrolls by dragging. */
export function glossary(game: Game): Scene {
  const root = new Container();
  root.addChild(dimmer(W, H, undefined, 0.94));
  const list = new Container();
  let y = 0;
  for (const g of GLOSSARY_GROUPS) {
    list.addChild(at(txt(t(g.title), 14, { color: C.gold, spacing: 2 }), 4, y));
    y += 28;
    for (const ic of g.icons) {
      const kw = game.keywords.get(ic);
      if (!kw) continue;
      const k = keywordRow(kw, W - 40);
      list.addChild(at(k.node, 0, y));
      y += k.h + 6;
    }
    y += 14;
  }
  const top = 84, viewH = H - top - 16;
  const clip = new Graphics().rect(0, top, W, viewH).fill(0xffffff);
  const holder = new Container();
  holder.addChild(list, clip);
  holder.mask = clip;
  list.position.set(20, top);
  root.addChild(holder);
  root.addChild(at(txt(t("ui.glossary"), 26, { spacing: 2 }), 20, 28));
  root.addChild(at(roundButton("close", 22, () => game.closeOverlay(), { iconSize: 18 }), W - 42, 44));
  const minY = Math.min(top, top + viewH - y);
  let grab: number | null = null;
  root.eventMode = "static";
  root.hitArea = new Rectangle(0, 0, W, H);
  root.on("pointerdown", (e) => { grab = root.toLocal(e.global).y - list.y; });
  root.on("pointermove", (e) => { if (grab !== null) list.y = Math.max(minY, Math.min(top, root.toLocal(e.global).y - grab)); });
  root.on("pointerup", () => { grab = null; });
  root.on("pointerupoutside", () => { grab = null; });
  root.on("wheel", (e) => { list.y = Math.max(minY, Math.min(top, list.y - e.deltaY)); });
  return { root };
}
