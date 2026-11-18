/** Popups: what an item or hero does (symbols first, words behind the "i" button) and the glossary. */
import { Container, Graphics, Rectangle } from "pixi.js";
import { describeHero, describeItem, sellPrice } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, RARITY, RARITY_PIPS, W } from "../theme";
import { icon } from "../icons";
import { at, box, dimmer, disc, infoButton, pillButton, plate, roundButton, tappable, txt } from "../ui";
import { itemIcon, pieceFit, symbolRow, ZAP } from "../pieces";
import { GLOSSARY_GROUPS, heroRows, itemRows, keywordsIn, type Keyword, type Row } from "../symbols";
import { t, tr, upper } from "../i18n";

const PW = 330,
  PAD = 16,
  IW = PW - PAD * 2;

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
  /** opens every recipe the subject is part of */
  onRadar?: () => void;
  sell?: number;
  action?: { label: string; onTap: () => void };
  onRotate?: () => void;
}

export function keywordRow(kw: Keyword, w: number): { node: Container; h: number } {
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
    root.addChild(dimmer(close));
    const col = new Container();
    let y = PAD;
    const add = (node: Container, h: number, gap = 14, centerW?: number) => {
      node.position.set(PAD + (centerW !== undefined ? (IW - centerW) / 2 : 0), y);
      col.addChild(node);
      y += h + gap;
    };
    // header
    const head = new Container();
    head.addChild(
      at(
        infoButton(
          22,
          () => {
            legend = !legend;
            build();
          },
          legend,
        ),
        22,
        22,
      ),
    );
    if (s.onRadar) head.addChild(at(roundButton("radar", 22, s.onRadar, { fill: C.panel, line: ZAP, tint: ZAP, iconSize: 24 }), 72, 22));
    if (legend) head.addChild(at(txt(upper(s.name), 16, { spacing: 0.5, anchor: [0.5, 0.5], wrap: IW - 100, align: "center" }), IW / 2, 22));
    else for (let i = 0; i < s.pips; i++) head.addChild(at(disc(4.5, { fill: s.line }), IW / 2 - ((s.pips - 1) * 13) / 2 + i * 13, 22));
    head.addChild(at(roundButton("close", 22, close, { fill: C.panel, line: C.line, iconSize: 18 }), IW - 22, 22));
    add(head, 44);

    if (!legend) {
      if (s.art) add(s.art(), s.artH ?? 110);
      const name = txt(upper(s.name), 22, { spacing: 0.7, wrap: IW, align: "center", inked: true });
      add(name, name.height, 12, name.width);
      if (s.tags.length) {
        const tags = new Container();
        s.tags.forEach((t, i) =>
          tags.addChild(at(disc(18, { fill: C.bg, line: C.line, ink: true }), i * 44 + 18, 18), at(icon(t, 18, C.text), i * 44 + 18, 18)),
        );
        add(tags, 36, 14, s.tags.length * 44 - 8);
      }
      if (s.rows.length) {
        const inner = new Container();
        let ry = 12;
        for (const r of s.rows) {
          const sr = symbolRow(r, IW - 24);
          sr.node.position.set(12, ry);
          inner.addChild(sr.node);
          ry += sr.h + 10;
        }
        const panel = new Container();
        panel.addChild(box(IW, ry + 2, { fill: C.bg, radius: 14 }), inner);
        add(panel, ry + 2);
      }
      if (s.sell !== undefined || s.onRotate) {
        const foot = new Container();
        let x = 0;
        if (s.onRotate) {
          foot.addChild(at(roundButton("rotate", 20, s.onRotate, { iconSize: 20 }), 20, 20));
          x = 56;
        }
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
      for (const kw of keywordsIn(s.rows, s.tags, game.keywords, s.onRadar ? ["radar"] : [])) {
        const k = keywordRow(kw, IW);
        add(k.node, k.h, 8);
      }
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
    const bg = plate(PW, h, { fill: C.panel, line: s.line, radius: 20, hatch: true });
    bg.eventMode = "static";
    panel.addChild(bg, col);
    // tall popups scroll by dragging
    const top = h <= H - 40 ? (H - h) / 2 : 20;
    panel.position.set((W - PW) / 2, top);
    if (h > H - 40) {
      let grab: number | null = null;
      bg.on("pointerdown", (e) => {
        grab = root.toLocal(e.global).y - panel.y;
      });
      root.eventMode = "static";
      root.on("pointermove", (e) => {
        if (grab !== null) panel.y = Math.max(H - 20 - h, Math.min(20, root.toLocal(e.global).y - grab));
      });
      root.on("pointerup", () => {
        grab = null;
      });
      root.on("pointerupoutside", () => {
        grab = null;
      });
    }
    root.addChild(panel);
  };
  build();
  return { root };
}

export interface ItemPopupOpts {
  rot?: number;
  sell?: boolean;
  action?: { label: string; onTap: () => void };
  onRotate?: () => void;
}

export function itemPopup(game: Game, id: string, o: ItemPopupOpts = {}): Scene {
  const data = game.data,
    def = data.items.get(id)!;
  const tags = def.isBag ? ["bag"] : def.tags.filter((t) => t !== "bag");
  return subjectPopup(game, {
    name: tr().item(id),
    line: def.isBag ? C.cyan : (RARITY[def.rarity] ?? C.cyan),
    pips: def.isBag ? 0 : (RARITY_PIPS[def.rarity] ?? 1),
    art: () => pieceFit(data, id, IW, 110, 36, { stars: true }),
    tags,
    rows: itemRows(def, data),
    lines: describeItem(def, data, tr()),
    onRadar: recipesOf(game, id).length ? () => game.openOverlay(recipeRadar(game, id)) : undefined,
    sell: o.sell ? sellPrice(data, id) : undefined,
    action: o.action,
    onRotate: o.onRotate,
  });
}

export function heroPopup(game: Game, heroId: string): Scene {
  const data = game.data,
    hero = data.heroes.get(heroId)!;
  return subjectPopup(game, {
    name: tr().t(`hero.${hero.id}.name`),
    line: C.cyan,
    pips: 0,
    art: () => {
      const t = txt(upper(tr().t(`hero.${hero.id}.title`)), 13, { color: C.dim, spacing: 1.5, wrap: IW, align: "center" });
      const c = new Container();
      c.addChild(at(t, (IW - t.width) / 2, 0));
      return c;
    },
    artH: 16,
    tags: [],
    rows: heroRows(hero, data),
    lines: [tr().t(`hero.${hero.id}.focus`), ...describeHero(hero, data, tr())],
  });
}

/** Every recipe an item is part of: the one that makes it first, then those it goes into. */
function recipesOf(game: Game, id: string): { in: string[]; out: string }[] {
  return [...game.data.recipes.filter((r) => r.out === id), ...(game.data.recipesWith.get(id) ?? [])];
}

/**
 * The recipe radar: every recipe the item is part of, all items as icons of one size. The item itself is ringed;
 * tapping any icon opens that item.
 */
export function recipeRadar(game: Game, id: string): Scene {
  const data = game.data;
  const root = new Container();
  root.addChild(dimmer(() => game.closeOverlay(), 0.94));
  const S = 52,
    PLUS = 18,
    EQ = 24,
    ROW = S + 16;
  const list = new Container();
  let y = 0;
  recipesOf(game, id).forEach((r, k) => {
    const row = new Container();
    let x = 0;
    const put = (item: string) => {
      const ic = itemIcon(data, item, S, item === id ? { line: ZAP } : {});
      if (item === id) ic.addChildAt(new Graphics().roundRect(-5, -5, S + 10, S + 10, S * 0.28).stroke({ width: 2, color: ZAP, alpha: 0.5 }), 0);
      row.addChild(
        at(
          tappable(ic, () => game.openOverlay(itemPopup(game, item)), new Rectangle(0, 0, S, S)),
          x,
          0,
        ),
      );
      x += S;
    };
    r.in.forEach((item, i) => {
      if (i > 0) {
        row.addChild(at(icon("plus", 14, C.dim), x + PLUS / 2, S / 2));
        x += PLUS;
      }
      put(item);
    });
    row.addChild(at(icon("arrow", 18, C.dim), x + EQ / 2, S / 2));
    x += EQ;
    put(r.out);
    const band = box(W - 32, ROW - 6, { fill: r.out === id ? C.backdrop : C.panel, radius: 14 });
    list.addChild(at(band, 0, y), at(row, (W - 32 - x) / 2, y + (ROW - 6 - S) / 2));
    y += ROW + (k === 0 && r.out === id ? 10 : 0);
  });
  // header: radar symbol and the item itself
  const head = new Container();
  head.addChild(at(disc(24, { fill: C.panel, line: ZAP, lineW: 2 }), 24, 24), at(icon("radar", 26, ZAP), 24, 24));
  const name = txt(upper(tr().item(id)), 20, { spacing: 0.7, anchor: [0, 0.5], wrap: W - 160 });
  head.addChild(at(name, 60, 24));
  root.addChild(at(head, 16, 28));
  root.addChild(
    at(
      roundButton("close", 22, () => game.closeOverlay(), { iconSize: 18 }),
      W - 38,
      52,
    ),
  );
  const top = 100,
    viewH = H - top - 16;
  const clip = new Graphics().rect(0, top, W, viewH).fill(0xffffff);
  const holder = new Container();
  holder.addChild(list, clip);
  holder.mask = clip;
  list.position.set(16, top);
  root.addChild(holder);
  // long lists scroll by dragging
  if (y > viewH) {
    const minY = top + viewH - y;
    let grab: number | null = null;
    holder.eventMode = "static";
    holder.hitArea = new Rectangle(0, top, W, viewH);
    holder.on("pointerdown", (e) => {
      grab = root.toLocal(e.global).y - list.y;
    });
    root.eventMode = "static";
    root.on("pointermove", (e) => {
      if (grab !== null) list.y = Math.max(minY, Math.min(top, root.toLocal(e.global).y - grab));
    });
    root.on("pointerup", () => {
      grab = null;
    });
    root.on("pointerupoutside", () => {
      grab = null;
    });
    root.on("wheel", (e) => {
      list.y = Math.max(minY, Math.min(top, list.y - e.deltaY));
    });
  }
  return { root };
}

/** All keywords, grouped. Scrolls by dragging. */
export function glossary(game: Game): Scene {
  const root = new Container();
  root.addChild(dimmer(undefined, 0.94));
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
  const top = 84,
    viewH = H - top - 16;
  const clip = new Graphics().rect(0, top, W, viewH).fill(0xffffff);
  const holder = new Container();
  holder.addChild(list, clip);
  holder.mask = clip;
  list.position.set(20, top);
  root.addChild(holder);
  root.addChild(at(txt(t("ui.glossary"), 26, { spacing: 2 }), 20, 28));
  root.addChild(
    at(
      roundButton("close", 22, () => game.closeOverlay(), { iconSize: 18 }),
      W - 42,
      44,
    ),
  );
  const minY = Math.min(top, top + viewH - y);
  let grab: number | null = null;
  root.eventMode = "static";
  root.hitArea = new Rectangle(0, 0, W, H);
  root.on("pointerdown", (e) => {
    grab = root.toLocal(e.global).y - list.y;
  });
  root.on("pointermove", (e) => {
    if (grab !== null) list.y = Math.max(minY, Math.min(top, root.toLocal(e.global).y - grab));
  });
  root.on("pointerup", () => {
    grab = null;
  });
  root.on("pointerupoutside", () => {
    grab = null;
  });
  root.on("wheel", (e) => {
    list.y = Math.max(minY, Math.min(top, list.y - e.deltaY));
  });
  return { root };
}
