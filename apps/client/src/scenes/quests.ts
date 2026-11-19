/**
 * V8: daily and weekly quests behind one entry point (docs/ux.md M8). Every quest is a whole run with one special rule
 * (data/meta.json → quests). The server says which quests are open today and which this player already played; a
 * quest is played once per day or week. Quests need the backend: offline the screen says so.
 */
import { Container, Rectangle } from "pixi.js";
import type { QuestBody } from "@backpack-space/api";
import type { Game, Scene } from "../game";
import { C, W } from "../theme";
import { icon } from "../icons";
import { at, box, screenFill, hudPill, roundButton, tappable, txt } from "../ui";
import { t, upper } from "../i18n";
import { heroScene } from "./hero";

function questCard(game: Game, q: QuestBody, w: number): Container {
  const c = new Container();
  const h = 92;
  c.addChild(box(w, h, { fill: C.panel, line: q.played ? C.line : C.cyan, lineW: q.played ? 1 : 2, radius: 16 }));
  // the special rule: its name and what it changes
  c.addChild(at(icon(q.kind, 26, q.played ? C.dim : C.gold), 34, 46));
  c.addChild(at(txt(upper(t(`quest.${q.rule}.name`)), 15, { color: q.played ? C.dim : C.text, spacing: 1 }), 64, 16));
  c.addChild(at(txt(t(`quest.${q.rule}.text`), 12, { font: "text", color: C.dim, wrap: w - 130 }), 64, 40));
  const start = () => {
    if (q.played) game.toast(t("toast.questPlayed"));
    else game.show(heroScene(game, q));
  };
  if (q.played) c.addChild(at(icon("check", 24, C.good), w - 34, h / 2));
  else c.addChild(at(roundButton("play", 18, start, { fill: C.gold, line: C.gold, tint: C.goldInk, iconSize: 16 }), w - 34, h / 2));
  return tappable(c, start, new Rectangle(0, 0, w, h));
}

export function questsScene(game: Game, back: () => Scene): Scene {
  const root = new Container();
  const list = new Container();
  root.addChild(screenFill(C.bg));
  root.addChild(
    at(
      roundButton("back", 22, () => game.show(back()), { iconSize: 20 }),
      36,
      36,
    ),
  );
  root.addChild(at(txt(upper(t("ui.quests")), 24, { spacing: 2, anchor: [0, 0.5] }), 72, 36));
  const gal = hudPill("galaxy", game.profile.galaxies, C.line, C.text, 40);
  root.addChild(at(gal, W - 14 - gal.width, 16));
  root.addChild(list);

  const note = (key: string) => list.addChild(at(txt(t(key), 14, { font: "text", color: C.dim, wrap: W - 80, align: "center", anchor: [0.5, 0] }), W / 2, 120));
  const render = (quests: QuestBody[]) => {
    list.removeChildren().forEach((c) => c.destroy({ children: true }));
    let y = 92;
    for (const kind of ["daily", "weekly"] as const) {
      const head = new Container();
      head.addChild(at(icon(kind, 20, C.gold), 10, 10), at(txt(t(`ui.quest.${kind}`), 13, { color: C.gold, spacing: 2, anchor: [0, 0.5] }), 28, 10));
      head.addChild(at(txt(t(`ui.quest.renews.${kind}`), 11, { font: "text", color: C.dim, anchor: [1, 0.5] }), W - 40, 10));
      list.addChild(at(head, 20, y));
      y += 30;
      for (const q of quests.filter((x) => x.kind === kind)) {
        list.addChild(at(questCard(game, q, W - 40), 20, y));
        y += 102;
      }
      y += 10;
    }
  };

  if (!game.isOnline) note("ui.quest.offline");
  else {
    note("ui.quest.loading");
    void game.call("quests", {}).then((res) => {
      if (root.destroyed) return;
      list.removeChildren().forEach((c) => c.destroy({ children: true }));
      if (res.ok) render(res.value.quests);
      else note("ui.quest.offline");
    });
  }
  return { root };
}
