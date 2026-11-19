/** Backpack Space client. It shows and replays what the shared core computes; it never decides a rule or a fight. */
import "./fonts.css"; // the fonts ship inside the app (src/fonts), no request to another server
import "pixi.js/unsafe-eval"; // no code generation at runtime, so strict content security policies (store wrappers, hosted previews) work
import { Application } from "pixi.js";
import { leagueOf } from "@backpack-space/core";
import { DATA, META } from "./data";
import { Game } from "./game";
import { loadIcons } from "./icons";
import { loadArt } from "./art";
import { C } from "./theme";
import { homeScene } from "./scenes/home";
import { shopScene } from "./scenes/shop";
import { battleScene } from "./scenes/battle";
import { t } from "./i18n";
import { DEV_TOOLS, tapTargets } from "./devtools";
import { blocking, connect } from "./connect";
import { statusScene } from "./scenes/status";
import { stateOfFailure } from "./online";
import { createApi } from "./api";
import { APP_VERSION } from "./connect";
import { createReporter, installCrashReports } from "./crash";
import { createSounds, useSounds } from "./sound";
import { readPrefs } from "./prefs";

/** Crash and error reports go to our backend from the first line on, so a failing start is reported too (BE-15). */
function reportCrashes(): void {
  const base = import.meta.env.VITE_BACKEND_URL;
  if (!base) return;
  const api = createApi({ base, appVersion: APP_VERSION, fetch: (url, init) => fetch(url, init) });
  installCrashReports(window, createReporter((r) => api.call("clientError", r), DATA.simVersion));
}

/** The sound files ship in the app (art/sounds); the menu music starts with the first touch, as browsers ask. */
function startSounds(): void {
  const files: Record<string, string> = {};
  for (const [path, url] of Object.entries(import.meta.glob<string>("../art/sounds/*.{wav,mp3,ogg,m4a}", { eager: true, query: "?url", import: "default" })))
    files[path.replace(/^.*\/|\.\w+$/g, "")] = url;
  const sounds = createSounds(files, (url) => new Audio(url), readPrefs);
  useSounds(sounds);
  window.addEventListener("pointerdown", () => sounds.music("menu"), { once: true });
}

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ preference: "webgl", resizeTo: window, background: C.bgDeep, antialias: true, autoDensity: true, resolution: Math.min(3, window.devicePixelRatio || 1) });
  document.body.append(app.canvas);
  // the fonts are bundled; the wait only guards against a broken file, the game then starts with the fallback font
  const fonts = Promise.all(['700 16px "Chakra Petch"', "400 12px Inter", "600 12px Inter"].map((f) => document.fonts.load(f))).catch(() => undefined);
  await Promise.all([loadIcons(), loadArt(), Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))])]);
  const game = new Game(app, DATA, META);
  startSounds();
  game.reenter = () => void enter(game);
  await enter(game);
  if (DEV_TOOLS) {
    // for automated checks
    Object.assign(window, { __game: game, __tapTargets: () => tapTargets(game.stage) });
    // the version of the rules this build computes with (CORE-03); a future server compares it
    console.info(`simVersion ${DATA.simVersion}`);
  }
}

/** Asks the backend (when there is one), then opens the game; a blocking state shows until trying again works. */
async function enter(game: Game): Promise<void> {
  // the season of the profile on this device, to tell when the server moved it into a new one (META-03)
  const seasonBefore = game.profile.season.id;
  const online = await connect(game);
  if (blocking(online)) {
    game.show(statusScene(online, () => void enter(game)));
    return;
  }
  // online the server changes the season and the profile comes from there; offline the device does it
  const season = game.isOnline ? (game.profile.season.id > seasonBefore ? game.profile.season : null) : game.checkSeason()?.profile.season;
  if (game.isOnline) {
    // the server says which run is open; the copy on this device only continues when it belongs to it (RUN-11)
    const res = await game.enterRun();
    if (!res.ok) {
      game.online = stateOfFailure(res.error, res.textKey);
      game.show(statusScene(game.online, () => void enter(game)));
      return;
    }
    const { booked, fight } = res.value;
    game.show(!game.run ? homeScene(game) : fight ? battleScene(game, fight) : shopScene(game));
    if (booked) game.toast(t("toast.runBooked", { wins: booked.wins }));
  } else {
    // offline: a stored run continues where it was left, in the shop or in the fight that was already started
    const resumed = game.resume();
    game.show(!resumed ? homeScene(game) : resumed.fight ? battleScene(game, resumed.fight) : shopScene(game));
  }
  if (season) game.toast(t("toast.seasonStart", { n: season.id, league: t(`league.${META.leagues.ids[leagueOf(META, season.points)]}`) }));
}

reportCrashes();
void boot();
