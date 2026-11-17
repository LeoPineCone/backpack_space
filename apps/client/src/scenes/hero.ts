/** Choose a hero (after FIGHT on the start screen): heroes on a ring, the start button in the middle, the chosen hero large on top. */
import { Container, Graphics, Rectangle } from "pixi.js";
import { BUFFS, DEBUFFS, TAGS, heroLevel, newRun, ownsHero } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, SCREEN, W } from "../theme";
import { icon, hasIcon } from "../icons";
import { at, box, disc, hudPill, infoButton, placeholder, roundButton, tappable, txt } from "../ui";
import { heroPopup } from "./popup";
import { homeScene } from "./home";
import { shopScene } from "./shop";
import { progressOverlay, type Tab } from "./progress";
import { storeScene } from "./store";
import { t, upper } from "../i18n";

type Slot = { kind: "own"; id: string; letter: string } | { kind: "locked" } | { kind: "soon" };

/** Up to three symbols for what a hero is about, read from its effects and ways to win. */
function traits(game: Game, heroId: string): string[] {
  const hero = game.data.heroes.get(heroId)!;
  const known = new Set<string>([...TAGS, ...BUFFS, ...DEBUFFS, "heal", "crafted"]);
  const out: string[] = [];
  const take = (s: string | undefined) => { if (s && known.has(s) && hasIcon(s) && !out.includes(s)) out.push(s); };
  for (const e of hero.effects) { take(e.tag); take(e.gain); take(e.inflict); }
  for (const p of hero.paths) for (const f of p.focus) take(f);
  return out.slice(0, 3);
}

export function heroScene(game: Game): Scene {
  const root = new Container();
  const data = game.data;
  const slots: Slot[] = [
    ...data.heroList.filter((h) => ownsHero(game.meta, game.profile, h.id)).map((h): Slot => ({ kind: "own", id: h.id, letter: h.name.replace(/[^A-Za-z]/g, "")[0]!.toUpperCase() })),
    { kind: "locked" }, { kind: "locked" }, { kind: "soon" }, { kind: "soon" },
  ];
  let selected = Math.max(0, slots.findIndex((s) => s.kind === "own" && s.id === game.hero));

  const progress = (tab: Tab) => game.openOverlay(progressOverlay(game, tab, render));
  const render = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    const p = game.profile, meta = game.meta;
    const sel = slots[selected]!;
    const hero = sel.kind === "own" ? data.heroes.get(sel.id)! : null;

    // season backdrop, up behind the status bar; the ring of heroes sits at the bottom of the safe area
    const ringY = Math.max(400, H - 358), line = ringY - 10;
    root.addChild(at(box(W, line - SCREEN.y, { fill: C.backdrop }), 0, SCREEN.y), at(new Graphics().rect(0, 0, W, 1).fill(C.line), 0, line));
    root.addChild(at(new Graphics().circle(0, 0, 130).stroke({ width: 1.5, color: C.line }), 360, 70));
    root.addChild(at(new Graphics().circle(0, 0, 90).stroke({ width: 1.5, color: C.line }), 20, line - 80));
    // the equipped menu background (a planet); placeholder until the art exists
    root.addChild(at(icon("planet", 14, C.dim), 21, line - 14), at(txt(t(`cosmetic.${p.equipped.background}`), 10, { font: "text", color: C.dim }), 34, line - 20));

    // back to the start screen; currencies stay in view
    root.addChild(at(roundButton("back", 22, () => game.show(homeScene(game)), { iconSize: 20 }), 36, 36));
    const gal = tappable(hudPill("galaxy", p.galaxies, C.line, C.text), () => progress("planets"));
    root.addChild(at(gal, W - 14 - gal.width, 14));
    const cr = tappable(hudPill("credits", p.credits, C.line, C.gold, 36), () => game.show(storeScene(game, () => heroScene(game))));
    root.addChild(at(cr, W - 14 - cr.width, 64));

    // the chosen hero
    const art = new Container();
    if (hero && sel.kind === "own") {
      art.addChild(placeholder(200, 240, "", 24), at(txt(t("ui.placeholder.heroArt"), 11, { font: "text", color: C.dim, anchor: [0.5, 0.5] }), 100, 192));
      art.addChild(at(txt(sel.letter, 96, { color: C.line, anchor: [0.5, 0.5] }), 100, 110));
      const lvl = new Container();
      lvl.addChild(disc(28, { fill: C.bg, line: C.cyan, lineW: 2 }), at(txt(t("ui.level"), 9, { font: "text", color: C.dim, anchor: [0.5, 0.5] }), 0, -11), at(txt(heroLevel(meta, p.heroXp[sel.id] ?? 0).level, 22, { anchor: [0.5, 0.5] }), 0, 5));
      tappable(lvl, () => progress("hero"), new Rectangle(-32, -32, 64, 64));
      art.addChild(at(lvl, 3, 44));
    } else {
      art.addChild(box(200, 240, { fill: C.bg, radius: 24 }), placeholder(200, 240, "", 24), at(icon("lock", 56, C.dim), 100, 110));
      art.addChild(at(txt(t(sel.kind === "locked" ? "ui.placeholder.silhouette" : "ui.placeholder.comingSoon"), 12, { font: "text", color: C.dim, anchor: [0.5, 0.5] }), 100, 160));
    }
    root.addChild(at(art, 95, 60));

    root.addChild(at(txt(hero ? upper(t(`hero.${hero.id}.name`).replace(/"/g, "")) : t(sel.kind === "locked" ? "ui.seasonHero" : "ui.comingSoon"), 26, { spacing: 1, anchor: [0.5, 0] }), W / 2, 306));
    const row = new Container();
    let x = 0;
    if (hero) {
      for (const t of traits(game, hero.id)) { row.addChild(at(disc(16, { fill: C.bg, line: C.line }), x + 16, 16), at(icon(t, 18, C.text), x + 16, 16)); x += 40; }
      row.addChild(at(infoButton(16, () => game.openOverlay(heroPopup(game, hero.id))), x + 16, 16)); x += 32;
    } else if (sel.kind === "locked") {
      const tag = txt(t("ui.season", { n: 2 }), 13, { color: C.bg, anchor: [0.5, 0.5] });
      row.addChild(box(tag.width + 24, 26, { fill: C.dim, radius: 13 }), at(tag, tag.width / 2 + 12, 13)); x = tag.width + 24;
    }
    root.addChild(at(row, (W - x) / 2, 342));

    // the ring
    const ring = new Container();
    ring.addChild(at(new Graphics().circle(0, 0, 128).stroke({ width: 1.5, color: C.line }), 170, 170));
    slots.forEach((s, i) => {
      const a = ((-90 + (i * 360) / slots.length) * Math.PI) / 180;
      const r = i === selected ? 40 : 30;
      const b = new Container();
      b.addChild(disc(r, { fill: s.kind === "own" ? C.panel : C.bg, line: i === selected ? C.cyan : s.kind === "own" ? C.dim : C.line, lineW: i === selected ? 3 : 2 }));
      if (s.kind === "own") b.addChild(txt(s.letter, 22, { anchor: [0.5, 0.5] }));
      else if (s.kind === "locked") b.addChild(icon("lock", 22, C.dim));
      else b.addChild(txt("?", 20, { color: C.line, anchor: [0.5, 0.5] }));
      tappable(b, () => { selected = i; if (s.kind === "own") game.hero = s.id; render(); }, new Rectangle(-r - 4, -r - 4, r * 2 + 8, r * 2 + 8));
      ring.addChild(at(b, 170 + 128 * Math.cos(a), 170 + 128 * Math.sin(a)));
    });
    // the button in the middle
    const mid = new Container();
    if (sel.kind === "own") {
      mid.addChild(disc(69, { fill: C.gold }), disc(63, { fill: C.gold, line: C.bg, lineW: 4 }), txt(t("ui.start"), 26, { color: C.goldInk, spacing: 1.5, anchor: [0.5, 0.5] }));
      tappable(mid, () => { game.newSeed(); game.run = newRun(data, sel.id, game.rng); game.show(shopScene(game)); }, new Rectangle(-69, -69, 138, 138));
    } else {
      mid.addChild(disc(69, { fill: C.cyan }), disc(63, { fill: C.cyan, line: C.bg, lineW: 4 }), at(icon("cart", 34, C.cyanInk), 0, -14), at(txt(t("ui.shop"), 22, { color: C.cyanInk, spacing: 1.5, anchor: [0.5, 0.5] }), 0, 22));
      tappable(mid, () => game.show(storeScene(game, () => heroScene(game), "heroes")), new Rectangle(-69, -69, 138, 138));
    }
    ring.addChild(at(mid, 170, 170));
    root.addChild(at(ring, 25, ringY));

  };
  render();
  return { root };
}
