/** The running game: one screen at a time, popups above it, and the state of the current run. */
import { Application, Container, Graphics, Rectangle } from "pixi.js";
import { Rng, type GameData, type RunState } from "@backpack-space/core";
import { C, H, W } from "./theme";
import { at, box, txt } from "./ui";
import { keywords, type Keyword } from "./symbols";
import { clearSave, readSave, writeSave, type SavedFight } from "./save";

export interface Scene {
  root: Container;
  /** called every frame with the seconds since the last one */
  update?(dt: number): void;
  destroy?(): void;
}

const REWARD_KEY = "backpack-space.reward";

export class Game {
  /** everything is laid out in a fixed 390 × 844 design space and scaled to the window */
  readonly stage = new Container();
  private readonly sceneLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly toastLayer = new Container();
  private scene: Scene | null = null;
  private overlays: Scene[] = [];
  private toastLeft = 0;
  readonly keywords: Map<string, Keyword>;

  run: RunState | null = null;
  rng = new Rng(1);
  seed = 1;
  hero: string;

  constructor(readonly app: Application, readonly data: GameData) {
    this.keywords = keywords(data);
    this.hero = data.heroList[0]!.id;
    const frame = new Graphics().rect(0, 0, W, H).fill(C.bg);
    const clip = new Graphics().rect(0, 0, W, H).fill(0xffffff);
    this.stage.addChild(frame, this.sceneLayer, this.overlayLayer, this.toastLayer, clip);
    this.stage.mask = clip;
    this.stage.eventMode = "static";
    this.stage.hitArea = new Rectangle(0, 0, W, H);
    app.stage.addChild(this.stage);
    app.ticker.add((t) => this.tick(t.deltaMS / 1000));
    window.addEventListener("resize", () => this.layout());
    this.layout();
  }

  private layout(): void {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    this.stage.scale.set(s);
    this.stage.position.set((window.innerWidth - W * s) / 2, (window.innerHeight - H * s) / 2);
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
    if (this.scene) { this.scene.destroy?.(); this.sceneLayer.removeChild(this.scene.root); this.scene.root.destroy({ children: true }); }
    this.scene = scene;
    this.sceneLayer.addChild(scene.root);
  }

  openOverlay(scene: Scene): void { this.overlays.push(scene); this.overlayLayer.addChild(scene.root); }

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
    const w = label.width + 32, h = label.height + 20;
    this.toastLayer.addChild(at(box(w, h, { fill: C.bgDeep, alpha: 0.95, line: C.dim, radius: 14 }), (W - w) / 2, 700 - h / 2), at(label, W / 2, 700));
    this.toastLayer.alpha = 1;
    this.toastLeft = 2.2;
  }

  /** Starts a new run with the chosen hero. The seed only drives the shop; battles carry their own seed. */
  newSeed(): void {
    this.seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
    this.rng = new Rng(this.seed);
  }

  /** Stores the run on this device; `fight` while a fight of this round is running or shown. */
  save(fight: SavedFight | null = null): void {
    if (this.run && !this.run.over) writeSave({ run: this.run, rng: this.rng.state, seed: this.seed, fight });
    else clearSave();
  }

  /** Ends the stored run (finished or left). */
  dropSave(): void { clearSave(); }

  /** Takes up a stored run; returns its running fight, or undefined when there is no run to continue. */
  resume(): { fight: SavedFight | null } | undefined {
    const s = readSave(this.data);
    if (!s) return undefined;
    this.run = s.run;
    this.seed = s.seed;
    this.rng = new Rng(s.rng);
    this.hero = s.run.hero;
    return { fight: s.fight };
  }

  /** The reward unit kept between runs (stored on this device for now). */
  get reward(): number { try { return Number(localStorage.getItem(REWARD_KEY)) || 0; } catch { return 0; } }
  addReward(n: number): void { try { localStorage.setItem(REWARD_KEY, String(this.reward + n)); } catch { /* storage unavailable: the reward is only shown */ } }
}
