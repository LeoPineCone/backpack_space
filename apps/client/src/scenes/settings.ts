/**
 * Settings (docs/ux.md P11): language, music, sounds, account, privacy policy, terms of use, help and the glossary.
 * Music and sounds switch the sound module (sound.ts) on and off; help is a placeholder. Account: export and deletion (account.ts). Privacy policy and terms of use
 * open the website pages in the player's language (WEB-03). No vibration setting: the app never vibrates.
 */
import { Container, Rectangle } from "pixi.js";
import type { Game, Scene } from "../game";
import { C, W } from "../theme";
import { at, box, dimmer, roundButton, tappable, txt } from "../ui";
import { icon } from "../icons";
import { glossary } from "./popup";
import { accountOverlay } from "./account";
import { soundPrefsChanged } from "../sound";
import { readPrefs, writePrefs, type Prefs } from "../prefs";
import { DEVICE, deviceLanguage, languageChoice, setLanguage, t, tr } from "../i18n";
import { websiteUrl, type WebsitePage } from "../website";

/** Opens a website page outside the app (the system browser in the store app); a toast while there is no website. */
function openPage(game: Game, page: WebsitePage): void {
  const url = websiteUrl(import.meta.env.VITE_WEBSITE_URL, page, tr().lang);
  if (url) window.open(url, "_blank", "noopener");
  else game.toast(t("toast.websiteLater"));
}

/** A switch drawn as a pill with a knob; origin top-left. */
function toggle(on: boolean): Container {
  const c = new Container();
  c.addChild(box(52, 30, { fill: on ? C.cyan : C.bg, line: on ? C.cyan : C.line, lineW: 2, radius: 15 }));
  c.addChild(at(box(22, 22, { fill: on ? C.cyanInk : C.dim, radius: 11 }), on ? 26 : 4, 4));
  return c;
}

export function settingsOverlay(game: Game, onChange: () => void): Scene {
  const root = new Container();
  const rw = W - 40;
  const render = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    root.addChild(dimmer(undefined, 0.94));
    root.addChild(at(txt(t("ui.settings"), 26, { spacing: 2 }), 20, 28));
    root.addChild(
      at(
        roundButton("close", 22, () => game.closeOverlay(), { iconSize: 18 }),
        W - 42,
        44,
      ),
    );

    // language
    let y = 92;
    root.addChild(at(txt(t("ui.language"), 13, { color: C.gold, spacing: 2 }), 24, y));
    y += 26;
    const choice = languageChoice();
    const device = game.data.locales.languages.find((l) => l.id === deviceLanguage());
    const rows = [
      { id: DEVICE, label: t("ui.deviceLanguage"), sub: device?.name },
      ...game.data.locales.languages.map((l) => ({ id: l.id, label: l.name, sub: undefined as string | undefined })),
    ];
    for (const r of rows) {
      const on = r.id === choice;
      const row = new Container();
      row.addChild(box(rw, 48, { fill: C.panel, line: on ? C.cyan : C.line, lineW: on ? 2 : 1, radius: 14 }));
      row.addChild(at(txt(r.label, 16, { font: "text", weight: "600", anchor: [0, 0.5] }), 18, 24));
      if (r.sub) row.addChild(at(txt(r.sub, 12, { font: "text", color: C.dim, anchor: [1, 0.5] }), rw - (on ? 52 : 18), 24));
      if (on) row.addChild(at(icon("check", 20, C.cyan), rw - 26, 24));
      tappable(
        row,
        () => {
          setLanguage(r.id);
          game.languageChanged();
          onChange();
          render();
        },
        new Rectangle(0, 0, rw, 48),
      );
      root.addChild(at(row, 20, y));
      y += 56;
    }

    // sound
    y += 10;
    const prefs = readPrefs();
    const flip = (k: keyof Prefs) => {
      writePrefs({ ...prefs, [k]: !prefs[k] });
      soundPrefsChanged();
      render();
    };
    // more: account (Game Center / Google Play Games, silently), privacy policy, terms of use, help, glossary
    const items: { ic: string; label: string; on?: boolean; tap: () => void }[] = [
      { ic: "music", label: t("ui.music"), on: prefs.music, tap: () => flip("music") },
      { ic: "sound", label: t("ui.sounds"), on: prefs.sounds, tap: () => flip("sounds") },
      { ic: "account", label: t("ui.account"), tap: () => game.openOverlay(accountOverlay(game)) },
      { ic: "privacy", label: t("ui.privacy"), tap: () => openPage(game, "privacy") },
      { ic: "info", label: t("ui.terms"), tap: () => openPage(game, "terms") },
      { ic: "help", label: t("ui.help"), tap: () => game.toast(t("toast.helpLater")) },
      { ic: "book", label: t("ui.glossaryRow"), tap: () => game.openOverlay(glossary(game)) },
    ];
    for (const it of items) {
      const row = new Container();
      row.addChild(box(rw, 50, { fill: C.panel, line: C.line, radius: 14 }));
      row.addChild(at(icon(it.ic, 22, C.text), 28, 25), at(txt(it.label, 16, { font: "text", weight: "600", anchor: [0, 0.5] }), 54, 25));
      if (it.on !== undefined) row.addChild(at(toggle(it.on), rw - 66, 10));
      else row.addChild(at(icon("arrow", 18, C.dim), rw - 24, 25));
      tappable(row, it.tap, new Rectangle(0, 0, rw, 50));
      root.addChild(at(row, 20, y));
      y += 58;
    }
  };
  render();
  return { root };
}
