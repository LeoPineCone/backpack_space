/**
 * The run menu (docs/ux.md P13), behind the small button at the top of the shop: settings, home (the run stays
 * stored and continues from the start screen) and give up (ends the run with the rounds fought and books the reward).
 * Giving up asks for a second tap instead of a dialog.
 */
import { Container, Rectangle } from "pixi.js";
import { giveUp } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, W } from "../theme";
import { icon } from "../icons";
import { at, box, dimmer, roundButton, tappable, txt } from "../ui";
import { settingsOverlay } from "./settings";
import { homeScene } from "./home";
import { runEndScene } from "./results";
import { t } from "../i18n";

export function runMenuOverlay(game: Game, onChange: () => void): Scene {
  const root = new Container();
  let armed = false;
  const render = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    root.addChild(dimmer(() => game.closeOverlay()));
    const pw = 300,
      rw = pw - 40;
    const panel = new Container();
    const rows: { ic: string; label: string; color: number; tap: () => void }[] = [
      { ic: "settings", label: t("ui.settings"), color: C.text, tap: () => game.openOverlay(settingsOverlay(game, onChange)) },
      {
        ic: "home",
        label: t("ui.runMenu.home"),
        color: C.text,
        tap: () => {
          game.save();
          game.show(homeScene(game));
        },
      },
      {
        ic: "flag",
        label: t(armed ? "ui.runMenu.giveUpSure" : "ui.runMenu.giveUp"),
        color: armed ? C.bad : C.text,
        tap: () => {
          if (!armed) {
            armed = true;
            render();
            return;
          }
          const run = game.run!;
          giveUp(run);
          // the stored run ends before the reward is booked, so a reload cannot book it twice
          game.dropSave();
          game.show(runEndScene(game, game.bookRun(run)));
        },
      },
    ];
    const ph = 76 + rows.length * 62 + 6;
    const bg = box(pw, ph, { fill: C.panel, line: C.cyan, lineW: 2, radius: 20 });
    bg.eventMode = "static";
    panel.addChild(bg);
    panel.addChild(
      at(icon("menu", 24, C.cyan), 34, 38),
      at(
        roundButton("close", 18, () => game.closeOverlay(), { iconSize: 16 }),
        pw - 30,
        38,
      ),
    );
    rows.forEach((r, i) => {
      const row = new Container();
      row.addChild(box(rw, 52, { fill: C.bg, line: r.color === C.bad ? C.bad : C.line, lineW: r.color === C.bad ? 2 : 1, radius: 14 }));
      row.addChild(at(icon(r.ic, 22, r.color), 28, 26), at(txt(r.label, 16, { color: r.color, spacing: 1, anchor: [0, 0.5] }), 54, 26));
      tappable(row, r.tap, new Rectangle(0, 0, rw, 52));
      panel.addChild(at(row, 20, 76 + i * 62));
    });
    root.addChild(at(panel, (W - pw) / 2, (H - ph) / 2));
  };
  render();
  return { root };
}
