/** Backpack Space client. It shows and replays what the shared core computes; it never decides a rule or a fight. */
import "pixi.js/unsafe-eval"; // no code generation at runtime, so strict content security policies (store wrappers, hosted previews) work
import { Application } from "pixi.js";
import { DATA } from "./data";
import { Game } from "./game";
import { loadIcons } from "./icons";
import { C } from "./theme";
import { heroScene } from "./scenes/hero";

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ preference: "webgl", resizeTo: window, background: C.bgDeep, antialias: true, autoDensity: true, resolution: Math.min(3, window.devicePixelRatio || 1) });
  document.body.append(app.canvas);
  // fonts are placeholders too; the game starts without them when they cannot be fetched
  const fonts = Promise.all(['700 16px "Chakra Petch"', "400 12px Inter", "600 12px Inter"].map((f) => document.fonts.load(f))).catch(() => undefined);
  await Promise.all([loadIcons(), Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))])]);
  const game = new Game(app, DATA);
  game.show(heroScene(game));
  // for automated checks
  (window as unknown as { __game: Game }).__game = game;
}

void boot();
