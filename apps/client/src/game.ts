/** The running game: one screen at a time, popups above it, and the state of the current run. */
import { Application, Container, Graphics, Rectangle } from "pixi.js";
import {
  applyAction,
  bookRun,
  enterSeason,
  seasonAt,
  type GameData,
  type Meta,
  type Profile,
  type RunBooking,
  type Action,
  type RunState,
  type SeasonChange,
} from "@backpack-space/core";
import { C, H, SCREEN, W } from "./theme";
import { fitScreen, safeInsets } from "./screen";
import { at, box, txt } from "./ui";
import { keywords, type Keyword } from "./symbols";
import { clearSave, readSave, writeSave, type SavedFight } from "./save";
import { readProfile, today, writeProfile } from "./profile";
import { GhostOpponents, type OpponentSource } from "./opponents";

export interface Scene {
  root: Container;
  /** called every frame with the seconds since the last one */
  update?(dt: number): void;
  destroy?(): void;
}

export class Game {
  /** everything is laid out in a 390 units wide design space that fills the phone's safe area (screen.ts) */
  readonly stage = new Container();
  private readonly sceneLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly toastLayer = new Container();
  /** background and clip over the whole display, behind the status bar and the home indicator too */
  private readonly frame = new Graphics();
  private readonly clip = new Graphics();
  private scene: Scene | null = null;
  private overlays: Scene[] = [];
  private toastLeft = 0;
  /** keyword legend in the current language; rebuilt by `languageChanged` */
  keywords: Map<string, Keyword>;

  run: RunState | null = null;
  /** seed of the next or current run; the core derives every shop from it (later the server hands it out) */
  seed = 1;
  hero: string;
  /** progress between runs (stored on this device) */
  profile: Profile;
  readonly opponents: OpponentSource;

  constructor(
    readonly app: Application,
    readonly data: GameData,
    readonly meta: Meta,
  ) {
    this.keywords = keywords(data);
    this.profile = readProfile(meta);
    this.opponents = new GhostOpponents(data);
    this.hero = data.heroList[0]!.id;
    this.stage.addChild(this.frame, this.sceneLayer, this.overlayLayer, this.toastLayer, this.clip);
    this.stage.mask = this.clip;
    this.stage.eventMode = "static";
    app.stage.addChild(this.stage);
    app.ticker.add((t) => this.tick(t.deltaMS / 1000));
    window.addEventListener("resize", () => this.layout());
    this.layout();
  }

  private layout(): void {
    const f = fitScreen(window.innerWidth, window.innerHeight, safeInsets());
    this.stage.scale.set(f.scale);
    this.stage.position.set(f.x, f.y);
    const { x, y, w, h } = SCREEN;
    this.frame.clear().rect(x, y, w, h).fill(C.bg);
    this.clip.clear().rect(x, y, w, h).fill(0xffffff);
    this.stage.hitArea = new Rectangle(x, y, w, h);
  }

  private tick(dt: number): void {
    const d = Math.min(0.1, dt);
    this.scene?.update?.(d);
    for (const o of this.overlays) o.update?.(d);
    if (this.toastLeft > 0) {
      this.toastLeft -= d;
      this.toastLayer.alpha = Math.min(1, this.toastLeft / 0.3);
      if (this.toastLeft <= 0) this.toastLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    }
  }

  /** Replaces the current screen (and closes all popups). */
  show(scene: Scene): void {
    while (this.overlays.length) this.closeOverlay();
    if (this.scene) {
      this.scene.destroy?.();
      this.sceneLayer.removeChild(this.scene.root);
      this.scene.root.destroy({ children: true });
    }
    this.scene = scene;
    this.sceneLayer.addChild(scene.root);
  }

  openOverlay(scene: Scene): void {
    this.overlays.push(scene);
    this.overlayLayer.addChild(scene.root);
  }

  closeOverlay(): void {
    const o = this.overlays.pop();
    if (!o) return;
    o.destroy?.();
    this.overlayLayer.removeChild(o.root);
    o.root.destroy({ children: true });
  }

  toast(message: string): void {
    this.toastLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const label = txt(message, 14, { font: "text", weight: "600", wrap: W - 80, align: "center", anchor: [0.5, 0.5] });
    const w = label.width + 32,
      h = label.height + 20;
    this.toastLayer.addChild(at(box(w, h, { fill: C.bgDeep, alpha: 0.95, line: C.dim, radius: 14 }), (W - w) / 2, H - 144 - h / 2), at(label, W / 2, H - 144));
    this.toastLayer.alpha = 1;
    this.toastLeft = 2.2;
  }

  /** Call after switching the language: rebuilds the texts that are cached here. */
  languageChanged(): void {
    this.keywords = keywords(this.data);
  }

  /** Makes the seed for a new run. It only drives the shops and free picks; battles carry their own seed. */
  newSeed(): void {
    this.seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  }

  /**
   * The only way the client changes the run in the shop: one action line, checked and applied by the core and
   * recorded in the run's log (the server will get that log). Returns whether it was applied.
   */
  act(action: Action): boolean {
    return !!this.run && applyAction(this.run, this.data, action);
  }

  /** Stores the run on this device; `fight` while a fight of this round is running or shown. */
  save(fight: SavedFight | null = null): void {
    if (this.run && !this.run.over) writeSave({ run: this.run, seed: this.seed, fight });
    else clearSave();
  }

  /** Ends the stored run (finished or left). */
  dropSave(): void {
    clearSave();
  }

  /** Takes up a stored run; returns its running fight, or undefined when there is no run to continue. */
  resume(): { fight: SavedFight | null } | undefined {
    const s = readSave(this.data);
    if (!s) return undefined;
    this.run = s.run;
    this.seed = s.seed;
    this.hero = s.run.hero;
    return { fight: s.fight };
  }

  /** Stores a changed profile. */
  setProfile(p: Profile): void {
    this.profile = p;
    writeProfile(p);
  }

  /** Books a finished run into the profile: hero XP, Galaxies, league points and what they unlock. */
  bookRun(run: RunState): RunBooking {
    const b = bookRun(this.meta, this.profile, { hero: run.hero, wins: run.wins, livesLeft: run.lives, roundsPlayed: run.results.length });
    this.setProfile(b.profile);
    return b;
  }

  /** Moves the profile into the season that runs today, if a new one has started. */
  checkSeason(): SeasonChange | null {
    const c = enterSeason(this.meta, this.profile, seasonAt(this.meta, today()));
    if (c) this.setProfile(c.profile);
    return c;
  }
}
