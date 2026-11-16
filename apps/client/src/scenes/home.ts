/**
 * The start screen: the equipped menu background (star field and its turning planet) fills the screen, the player's picture with a name banner,
 * league patch and profile level on top, currencies on the right, one big FIGHT button (leads to the hero choice)
 * and four round buttons at the bottom.
 */
import { Container, Graphics, Rectangle } from "pixi.js";
import { profileLevel } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, W } from "../theme";
import { icon } from "../icons";
import { at, box, disc, hudPill, pillButton, placeholder, roundButton, tappable, txt } from "../ui";
import { glossary } from "./popup";
import { settingsOverlay } from "./settings";
import { heroScene } from "./hero";
import { progressOverlay, type Tab } from "./progress";
import { t, upper } from "../i18n";
import { backdrop, type Backdrop } from "../backdrop";

/** Ribbon under the picture; origin at its top centre. */
function banner(label: string): Container {
  const c = new Container();
  const name = txt(label, 15, { spacing: 1, anchor: [0.5, 0.5] });
  const w = Math.max(104, name.width + 36), h = 26, notch = 9;
  const g = new Graphics()
    .poly([-w / 2 - notch, 4, -w / 2 + 6, 4, -w / 2 + 6, h + 4, -w / 2 - notch, h + 4, -w / 2 - notch + 6, h / 2 + 4])
    .fill(C.bag)
    .poly([w / 2 + notch, 4, w / 2 - 6, 4, w / 2 - 6, h + 4, w / 2 + notch, h + 4, w / 2 + notch - 6, h / 2 + 4])
    .fill(C.bag);
  c.addChild(g, box(w, h, { fill: C.panel, line: C.gold, radius: 4 }));
  c.children[1]!.position.set(-w / 2, 0);
  c.addChild(at(name, 0, h / 2));
  return c;
}

export function homeScene(game: Game): Scene {
  const root = new Container();
  const progress = (tab: Tab) => game.openOverlay(progressOverlay(game, tab, render));
  let back: Backdrop | null = null, shownBg = "";
  const render = () => {
    root.removeChildren().forEach((c) => { if (c !== back?.view) c.destroy({ children: true }); });
    const p = game.profile, meta = game.meta;

    // the equipped menu background over the whole screen; rebuilt only when another one is equipped
    if (!back || shownBg !== p.equipped.background) {
      back?.view.destroy({ children: true });
      back = backdrop(game);
      shownBg = p.equipped.background;
    }
    root.addChild(back.view);
    if (!back.hasArt) {
      root.addChild(at(new Graphics().circle(0, 0, 150).stroke({ width: 1.5, color: C.line }), W - 40, 300));
      root.addChild(at(new Graphics().circle(0, 0, 70).stroke({ width: 1.5, color: C.line }), 60, 560));
      root.addChild(at(placeholder(W - 40, 430, ""), 20, 170));
      root.addChild(at(icon("planet", 40, C.line), W / 2, 365));
      root.addChild(at(txt(t("ui.placeholder.menuBackground"), 11, { font: "text", color: C.dim, anchor: [0.5, 0.5] }), W / 2, 400));
      root.addChild(at(txt(t(`cosmetic.${p.equipped.background}`), 13, { font: "text", weight: "600", color: C.dim, anchor: [0.5, 0.5] }), W / 2, 420));
    }

    // the player: picture with the profile level, name banner below, league patch beside it
    const me = new Container();
    me.addChild(disc(40, { fill: C.panel, line: C.gold, lineW: 3 }), at(icon("skin", 30, C.dim), 0, -8));
    me.addChild(at(txt(t("ui.placeholder.picture"), 9, { font: "text", color: C.dim, anchor: [0.5, 0.5] }), -6, 16));
    const lvl = new Container();
    lvl.addChild(disc(16, { fill: C.bg, line: C.cyan, lineW: 2 }), txt(profileLevel(meta, p), 15, { anchor: [0.5, 0.5] }));
    me.addChild(at(lvl, 30, 28));
    me.addChild(at(banner(upper(p.name)), 0, 44));
    tappable(me, () => progress("profile"), new Rectangle(-62, -44, 124, 124));
    root.addChild(at(me, 72, 62));
    if (p.equipped.patch) {
      const patch = new Container();
      patch.addChild(disc(24, { fill: C.panel, line: C.gold, lineW: 2 }), icon("patch", 30, C.gold));
      tappable(patch, () => progress("leagues"), new Rectangle(-28, -28, 56, 56));
      root.addChild(at(patch, 152, 50));
    }

    // currencies: earned (Galaxies) and bought or slowly earned (Credits)
    const gal = tappable(hudPill("galaxy", p.galaxies, C.line, C.text, 40), () => progress("planets"));
    root.addChild(at(gal, W - 14 - gal.width, 22));
    const cr = tappable(hudPill("credits", p.credits, C.line, C.gold, 40), () => game.toast(t("toast.heroShopLater")));
    root.addChild(at(cr, W - 14 - cr.width, 70));

    // FIGHT: to the hero choice
    const fw = 240, fh = 84;
    const fight = new Container();
    fight.addChild(box(fw + 12, fh + 12, { fill: C.gold, radius: (fh + 12) / 2 }));
    fight.addChild(at(pillButton(t("ui.fight"), fw, fh, () => game.show(heroScene(game)), { iconName: "swords", size: 34 }), 6, 6));
    fight.children[1]!.addChildAt(box(fw, fh, { line: C.bg, lineW: 4, radius: fh / 2 }), 1);
    root.addChild(at(fight, (W - fw - 12) / 2, 640));

    // four round buttons
    const bottom: [string, () => void][] = [
      ["book", () => game.openOverlay(glossary(game))],
      ["settings", () => game.openOverlay(settingsOverlay(game, render))],
      ["pass", () => progress("pass")],
      ["cart", () => game.toast(t("toast.heroShopLater"))],
    ];
    const gap = (W - 2 * 46) / (bottom.length - 1);
    bottom.forEach(([ic, go], i) => root.addChild(at(roundButton(ic, 26, go, { iconSize: 24 }), 46 + i * gap, 798)));
  };
  render();
  return { root, update: (dt) => back?.update(dt) };
}
