/**
 * V9: the states that keep the player out of the game at start (docs/ux.md M11): maintenance, update required,
 * no connection, sign-in failed. One symbol, a title, one sentence; "try again" where trying again can help.
 */
import { Container } from "pixi.js";
import type { Scene } from "../game";
import type { OnlineState } from "../online";
import { BUTTON, C, H, W } from "../theme";
import { icon, type IconName } from "../icons";
import { at, pillButton, screenFill, txt } from "../ui";
import { t, tr, upper } from "../i18n";

type Blocking = Exclude<OnlineState["kind"], "ready" | "offline">;

const SYMBOL: Record<Blocking, IconName> = { maintenance: "settings", update: "arrow", noNetwork: "radar", signInFailed: "account" };

export function statusScene(state: OnlineState, retry: () => void): Scene {
  const kind = state.kind as Blocking;
  const root = new Container();
  root.addChild(screenFill(C.bg));
  const mid = H / 2;
  root.addChild(at(icon(SYMBOL[kind], 64, C.gold), W / 2, mid - 120));
  root.addChild(at(txt(upper(t(`status.${kind}.title`)), 24, { spacing: 2, anchor: [0.5, 0.5] }), W / 2, mid - 40));
  // a maintenance text the server names (a key of the language files), else the general one
  const textKey = state.kind === "maintenance" && state.textKey && tr().has(state.textKey) ? state.textKey : `status.${kind}.text`;
  root.addChild(at(txt(t(textKey), 15, { font: "text", color: C.dim, anchor: [0.5, 0], wrap: W - 80, align: "center" }), W / 2, mid));
  // trying again is the answer to a lost connection; for maintenance and an old app it only checks once more
  const main = kind === "noNetwork" || kind === "signInFailed";
  const style = main ? {} : { fill: BUTTON.secondary.fill, ink: BUTTON.secondary.ink, size: 18 };
  root.addChild(at(pillButton(upper(t("status.retry")), 220, 56, retry, style), W / 2 - 110, mid + 110));
  return { root };
}
