/**
 * V8: daily and weekly quests behind one entry point (docs/ux.md M8). Every quest will be a whole run with
 * special rules that pays Galaxies. Which quests and rules is still open, so the cards are placeholders:
 * the structure (sections, progress, reward, start) is here, the contents come later.
 */
import { Container, Rectangle } from "pixi.js";
import type { Game, Scene } from "../game";
import { C, W } from "../theme";
import { icon } from "../icons";
import { at, box, screenFill, hudPill, placeholder, roundButton, tappable, txt } from "../ui";
import { t, upper } from "../i18n";

/** placeholder quests per section until the quests are designed */
const SLOTS = { daily: 3, weekly: 1 } as const;

function questCard(game: Game, kind: keyof typeof SLOTS, w: number): Container {
  const c = new Container();
  const h = 92;
  c.addChild(box(w, h, { fill: C.panel, line: C.line, radius: 16 }));
  // the special rule as a symbol (open), the run it starts, and its reward in Galaxies
  c.addChild(at(placeholder(60, 60, "", 12), 16, 16));
  c.addChild(at(icon(kind, 26, C.dim), 46, 46));
  c.addChild(at(txt(t("ui.quest.rulesOpen"), 13, { font: "text", color: C.dim }), 92, 18));
  c.addChild(at(box(w - 200, 8, { fill: C.bg, line: C.line, radius: 4 }), 92, 50));
  c.addChild(at(txt("0 / ?", 12, { font: "text", color: C.dim, anchor: [0, 0.5] }), 92 + w - 200 + 8, 54));
  const reward = hudPill("galaxy", "?", C.cyan, C.text, 30);
  c.addChild(at(reward, w - 14 - reward.width, 10));
  const play = roundButton("play", 18, () => game.toast(t("toast.questsLater")), { fill: C.gold, line: C.gold, tint: C.goldInk, iconSize: 16 });
  c.addChild(at(play, w - 34, h - 24));
  return tappable(c, () => game.toast(t("toast.questsLater")), new Rectangle(0, 0, w, h));
}

export function questsScene(game: Game, back: () => Scene): Scene {
  const root = new Container();
  root.addChild(screenFill(C.bg));
  root.addChild(at(roundButton("back", 22, () => game.show(back()), { iconSize: 20 }), 36, 36));
  root.addChild(at(txt(upper(t("ui.quests")), 24, { spacing: 2, anchor: [0, 0.5] }), 72, 36));
  const gal = hudPill("galaxy", game.profile.galaxies, C.line, C.text, 40);
  root.addChild(at(gal, W - 14 - gal.width, 16));
  let y = 92;
  for (const kind of ["daily", "weekly"] as const) {
    const head = new Container();
    head.addChild(at(icon(kind, 20, C.gold), 10, 10), at(txt(t(`ui.quest.${kind}`), 13, { color: C.gold, spacing: 2, anchor: [0, 0.5] }), 28, 10));
    // time left until new quests: open (needs the server's clock)
    head.addChild(at(txt(t("ui.quest.renews"), 11, { font: "text", color: C.dim, anchor: [1, 0.5] }), W - 40, 10));
    root.addChild(at(head, 20, y));
    y += 30;
    for (let i = 0; i < SLOTS[kind]; i++) { root.addChild(at(questCard(game, kind, W - 40), 20, y)); y += 102; }
    y += 10;
  }
  return { root };
}
