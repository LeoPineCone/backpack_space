/** The running game: one screen at a time, popups above it, and the state of the current run. */
import { Application, Container, Graphics, Rectangle } from "pixi.js";
import { ROUTES, type RequestOf, type ResponseOf, type RouteName } from "@backpack-space/api";
import {
  applyAction,
  bookRun,
  buildOf,
  newRun,
  newProfile,
  questData,
  questRule,
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
import { profileFromServer, type OnlineState } from "./online";
import type { Api, ApiFailure, ApiResult } from "./api";
import { bookingFromServer, decideEntry, roundActions, type RunEntry } from "./server-run";

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
  /** progress between runs: the server's when online, a copy is kept on this device */
  profile: Profile;
  /** how the start against the backend went (connect.ts) */
  online: OnlineState = { kind: "offline" };
  /** the backend, when the build has an address (connect.ts) */
  api: Api | null = null;
  /** signs in again when the session token expired */
  signIn: (() => Promise<OnlineState>) | null = null;
  /** online: the server's id of the current run */
  runId: string | null = null;
  /** the quest of the current run, if it is a quest run: its special rule changes the rules (CORE-07) */
  quest: string | null = null;
  /** starts the app's entry again: configuration, sign-in, open run (main.ts) */
  reenter: () => void = () => {};
  readonly opponents: OpponentSource;

  constructor(
    readonly app: Application,
    /** the game data as shipped; `data` is what the current run plays with */
    readonly baseData: GameData,
    readonly meta: Meta,
  ) {
    const data = baseData;
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

  private questCache: { id: string; data: GameData } | null = null;

  /** The game data of the current run: during a quest run with the rules of its quest, otherwise as shipped. */
  get data(): GameData {
    return this.run && this.quest ? this.dataFor(this.quest) : this.baseData;
  }

  /** The game data a quest plays with (the shipped data for no quest or an unknown one). */
  dataFor(quest: string | null): GameData {
    if (!quest) return this.baseData;
    if (this.questCache?.id !== quest) {
      const rule = questRule(this.meta.quests, quest);
      this.questCache = { id: quest, data: rule ? questData(this.baseData, rule) : this.baseData };
    }
    return this.questCache.data;
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
    if (this.run && !this.run.over)
      writeSave({ run: this.run, seed: this.seed, fight, ...(this.runId ? { runId: this.runId } : {}), ...(this.quest ? { quest: this.quest } : {}) });
    else clearSave();
  }

  /** Ends the stored run (finished or left). */
  dropSave(): void {
    clearSave();
  }

  /** Takes up a stored run; returns its running fight, or undefined when there is no run to continue. */
  resume(): { fight: SavedFight | null } | undefined {
    const s = readSave(this.baseData);
    if (!s) return undefined;
    this.run = s.run;
    this.seed = s.seed;
    this.hero = s.run.hero;
    this.runId = s.runId ?? null;
    this.quest = s.quest ?? null;
    return { fight: s.fight };
  }

  // ---------- the run against the backend (server-run.ts)

  /** Online: the server decides the run; offline (no backend address) the device plays alone as before. */
  get isOnline(): boolean {
    return this.online.kind === "ready" && this.api !== null;
  }

  /** One request with the session token; an expired token signs in again silently and repeats once. */
  async call<N extends RouteName>(name: N, body: RequestOf<N>): Promise<ApiResult<ResponseOf<N>>> {
    const token = () => (this.online.kind === "ready" ? this.online.token : undefined);
    let res = await this.api!.call(name, body, ROUTES[name].auth ? token() : undefined);
    if (!res.ok && res.error === "unauthorized" && this.signIn) {
      this.online = await this.signIn();
      if (this.online.kind === "ready") res = await this.api!.call(name, body, token());
    }
    return res;
  }

  /** Starts a run on the server: the run id and the shop seed of round 1 come from there (RUN-03); `quest`: a quest run. */
  async startRun(hero: string, quest?: string): Promise<ApiResult<null>> {
    const res = await this.call("runStart", { hero, simVersion: this.baseData.simVersion, ...(quest ? { quest } : {}) });
    if (!res.ok) return res;
    const r = res.value.run;
    if (r.round !== 1 || r.hero !== hero || r.quest !== quest) {
      // an open run this device has no copy of: the server books it, then the new run starts
      const ended = await this.call("runFinish", { runId: r.runId, reason: "no_local_copy" });
      if (!ended.ok) return ended;
      this.setProfile(bookingFromServer(ended.value, this.profile).profile);
      return this.startRun(hero, quest);
    }
    this.quest = r.quest ?? null;
    this.run = newRun(this.dataFor(this.quest), hero, r.shopSeed);
    this.seed = r.shopSeed;
    this.runId = r.runId;
    this.save();
    return { ok: true, value: null };
  }

  /** The fight request of the round: backpack and shop actions go to the server, opponent, seed and result come back. */
  async requestFight(): Promise<ApiResult<SavedFight>> {
    const run = this.run!;
    const res = await this.call("runFight", {
      runId: this.runId!,
      round: run.round,
      backpack: buildOf(run),
      actions: roundActions(run.log),
      simVersion: this.baseData.simVersion,
    });
    if (!res.ok) return res;
    const a = res.value;
    const fight: SavedFight = {
      ghost: a.opponent.backpack,
      seed: a.fightSeed,
      server: { name: a.opponent.name, patch: a.opponent.patch, won: a.result === "win", run: a.run },
    };
    this.save(fight);
    return { ok: true, value: fight };
  }

  /** Reports the end of the run (over, or given up); the server books it once and sends the new profile. */
  async finishOnline(reason: "finished" | "gave_up"): Promise<ApiResult<RunBooking>> {
    const res = await this.call("runFinish", { runId: this.runId!, reason });
    if (!res.ok) return res;
    const b = bookingFromServer(res.value, this.profile);
    this.setProfile(b.profile);
    this.runId = null;
    this.dropSave();
    return { ok: true, value: b };
  }

  /**
   * At start: asks the server for the open run and lines the local copy up with it. A copy of another run, or of a
   * run the server no longer has, is dropped; an open run without a copy is reported and booked by the server.
   */
  async enterRun(): Promise<ApiResult<{ entry: RunEntry; booked?: { booking: RunBooking; wins: number }; fight: SavedFight | null }>> {
    const res = await this.call("runCurrent", {});
    if (!res.ok) return res;
    const saved = this.resume();
    const local = saved && this.run ? { runId: this.runId ?? undefined, round: this.run.round, answered: !!saved.fight?.server } : null;
    const entry = decideEntry(res.value, local);
    const keep = entry.kind === "resume";
    if (!keep) {
      this.run = null;
      this.runId = null;
      this.dropSave();
    }
    if (entry.kind === "booked") {
      const booking = bookingFromServer(entry.finished, this.profile);
      this.setProfile(booking.profile);
      return { ok: true, value: { entry, booked: { booking, wins: entry.finished.result.wins }, fight: null } };
    }
    if (entry.kind === "noCopy") {
      const ended = await this.call("runFinish", { runId: entry.runId, reason: "no_local_copy" });
      if (!ended.ok) return ended;
      const booking = bookingFromServer(ended.value, this.profile);
      this.setProfile(booking.profile);
      return { ok: true, value: { entry, booked: { booking, wins: ended.value.result.wins }, fight: null } };
    }
    return { ok: true, value: { entry, fight: keep ? (saved?.fight ?? null) : null } };
  }

  /**
   * A change the player makes to the profile (equip, skin, name), already checked on the device as `local`. Online
   * the server applies it and its profile is kept; offline the device's is. Returns why the server refused it or
   * did not answer (the profile stays as it was), or null.
   */
  async changeProfile<N extends "profileEquip" | "profileSkin" | "profileName">(local: Profile, name: N, body: RequestOf<N>): Promise<ApiFailure | null> {
    if (!this.isOnline) {
      this.setProfile(local);
      return null;
    }
    const res = await this.call(name, body);
    if (!res.ok) return res.error;
    this.setProfile(profileFromServer((res.value as { profile: Parameters<typeof profileFromServer>[0] }).profile, this.profile));
    return null;
  }

  /**
   * Deletes the account on the server (ACC-08); afterwards this device forgets the run and the profile, and the next
   * start signs in as a new player.
   */
  async deleteAccount(): Promise<ApiResult<ResponseOf<"accountDelete">>> {
    const res = await this.call("accountDelete", {});
    if (res.ok) {
      this.run = null;
      this.runId = null;
      this.quest = null;
      this.dropSave();
      this.setProfile(newProfile(this.meta));
    }
    return res;
  }

  /** Stores a changed profile. */
  setProfile(p: Profile): void {
    this.profile = p;
    writeProfile(p);
  }

  /** Books a finished run into the profile: hero XP, Galaxies, league points and what they unlock. */
  bookRun(run: RunState): RunBooking {
    const b = bookRun(
      this.meta,
      this.profile,
      {
        hero: run.hero,
        wins: run.wins,
        livesLeft: run.lives,
        roundsPlayed: run.results.length,
        completed: run.over && run.lives > 0,
      },
      this.quest ? { quest: this.quest } : {},
    );
    this.setProfile(b.profile);
    return b;
  }

  /** Offline only (online the server changes the season): moves the profile into the season that runs on `date`, if a new one has started. */
  checkSeason(date: string = today()): SeasonChange | null {
    const c = enterSeason(this.meta, this.profile, seasonAt(this.meta, date));
    if (c) this.setProfile(c.profile);
    return c;
  }
}
