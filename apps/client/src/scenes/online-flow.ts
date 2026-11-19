/**
 * How the screens of a run react to the backend (docs/ux.md M11, docs/client-server.md "Error cases"): the search
 * screen while the fight request runs, and one place that turns a failed request into what the player sees.
 */
import { Container } from "pixi.js";
import type { Game, Scene } from "../game";
import type { ApiFailure } from "../api";
import { stateOfFailure } from "../online";
import { failureStep } from "../server-run";
import { C, H, W } from "../theme";
import { icon } from "../icons";
import { at, screenFill, txt } from "../ui";
import { t, upper } from "../i18n";
import { statusScene } from "./status";

/** V4a: while the server looks for an opponent and computes the fight. Nothing to tap; it is short. */
export function searchingScene(): Scene {
  const root = new Container();
  root.addChild(screenFill(C.bg));
  const radar = icon("radar", 72, C.gold);
  root.addChild(at(radar, W / 2, H / 2 - 100));
  root.addChild(at(txt(upper(t("status.searching.title")), 24, { spacing: 2, anchor: [0.5, 0.5] }), W / 2, H / 2 - 20));
  root.addChild(at(txt(t("status.searching.text"), 15, { font: "text", color: C.dim, anchor: [0.5, 0], wrap: W - 80, align: "center" }), W / 2, H / 2 + 16));
  let time = 0;
  return {
    root,
    update(dt) {
      time += dt;
      radar.rotation = time * 2;
    },
  };
}

/**
 * A failed run request: `back` returns to where the player was; the run stays paused there and the same button sends
 * the request again (the server gives the same answer to a repeat). Maintenance and an old app show their status
 * screen; a run that does not fit asks the server for the open run again (`game.reenter`).
 */
export function onRunFailure(game: Game, failure: { error: ApiFailure; textKey?: string }, back: () => void): void {
  switch (failureStep(failure.error)) {
    case "status":
    case "signIn":
      game.online = stateOfFailure(failure.error, failure.textKey);
      game.show(statusScene(game.online, () => game.reenter()));
      return;
    case "reload":
      game.reenter();
      return;
    case "rejected":
      back();
      game.toast(t("toast.backpackRejected"));
      return;
    case "retry":
      back();
      game.toast(t("toast.noConnection"));
      return;
  }
}
