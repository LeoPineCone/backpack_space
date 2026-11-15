/** Settings: for now only the language. "Device language" follows the phone; the other rows pin one language. */
import { Container, Rectangle } from "pixi.js";
import type { Game, Scene } from "../game";
import { C, H, W } from "../theme";
import { at, box, dimmer, roundButton, tappable, txt } from "../ui";
import { icon } from "../icons";
import { DEVICE, deviceLanguage, languageChoice, setLanguage, t } from "../i18n";

export function settingsOverlay(game: Game, onChange: () => void): Scene {
  const root = new Container();
  const render = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    root.addChild(dimmer(W, H, undefined, 0.94));
    root.addChild(at(txt(t("ui.settings"), 26, { spacing: 2 }), 20, 28));
    root.addChild(at(roundButton("close", 22, () => game.closeOverlay(), { iconSize: 18 }), W - 42, 44));
    root.addChild(at(txt(t("ui.language"), 14, { color: C.gold, spacing: 2 }), 24, 100));
    const choice = languageChoice();
    const device = game.data.locales.languages.find((l) => l.id === deviceLanguage());
    const rows = [
      { id: DEVICE, label: t("ui.deviceLanguage"), sub: device?.name },
      ...game.data.locales.languages.map((l) => ({ id: l.id, label: l.name, sub: undefined as string | undefined })),
    ];
    rows.forEach((r, i) => {
      const on = r.id === choice, rw = W - 40;
      const row = new Container();
      row.addChild(box(rw, 56, { fill: C.panel, line: on ? C.cyan : C.line, lineW: on ? 2 : 1, radius: 14 }));
      row.addChild(at(txt(r.label, 17, { font: "text", weight: "600", anchor: [0, 0.5] }), 18, r.sub ? 20 : 28));
      if (r.sub) row.addChild(at(txt(r.sub, 12, { font: "text", color: C.dim, anchor: [0, 0.5] }), 18, 40));
      if (on) row.addChild(at(icon("check", 20, C.cyan), rw - 26, 28));
      tappable(row, () => {
        setLanguage(r.id);
        game.languageChanged();
        onChange();
        render();
      }, new Rectangle(0, 0, rw, 56));
      root.addChild(at(row, 20, 128 + i * 66));
    });
  };
  render();
  return { root };
}
