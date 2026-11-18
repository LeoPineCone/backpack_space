/** Backpack Space client. It shows and replays what the shared core computes; it never decides a rule or a fight. */
import "./fonts.css"; // the fonts ship inside the app (src/fonts), no request to another server
import "pixi.js/unsafe-eval"; // no code generation at runtime, so strict content security policies (store wrappers, hosted previews) work
import { Application } from "pixi.js";
import { DATA, META } from "./data";
import { Game } from "./game";
import { loadIcons } from "./icons";
import { loadArt } from "./art";
import { C } from "./theme";
import { homeScene } from "./scenes/home";
import { shopScene } from "./scenes/shop";
import { battleScene } from "./scenes/battle";
import { t } from "./i18n";
import { DEV_TOOLS } from "./devtools";
import { blocking, connect } from "./connect";
import { statusScene } from "./scenes/status";

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ preference: "webgl", resizeTo: window, background: C.bgDeep, antialias: true, autoDensity: true, resolution: Math.min(3, window.devicePixelRatio || 1) });
  document.body.append(app.canvas);
  // the fonts are bundled; the wait only guards against a broken file, the game then starts with the fallback font
  const fonts = Promise.all(['700 16px "Chakra Petch"', "400 12px Inter", "600 12px Inter"].map((f) => document.fonts.load(f))).catch(() => undefined);
  await Promise.all([loadIcons(), loadArt(), Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))])]);
  const game = new Game(app, DATA, META);
  await enter(game);
  if (DEV_TOOLS) {
    // for automated checks
    (window as unknown as { __game: Game }).__game = game;
    // the version of the rules this build computes with (CORE-03); a future server compares it
    console.info(`simVersion ${DATA.simVersion}`);
  }
}

/** Asks the backend (when there is one), then opens the game; a blocking state shows until trying again works. */
async function enter(game: Game): Promise<void> {
  const online = await connect(game);
  if (blocking(online)) {
    game.show(statusScene(online, () => void enter(game)));
    return;
  }
  const season = game.checkSeason(online.kind === "ready" ? online.config.serverDate : undefined);
  // a stored run continues where it was left: in the shop, or in the fight that was already started
  const resumed = game.resume();
  game.show(!resumed ? homeScene(game) : resumed.fight ? battleScene(game, resumed.fight) : shopScene(game));
  if (season) game.toast(t("toast.seasonStart", { n: season.profile.season.id, league: t(`league.${META.leagues.ids[season.league[1]]}`) }));
}

void boot();
