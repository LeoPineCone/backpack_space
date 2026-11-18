import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSounds, MUSIC, SOUNDS, type Player } from "../apps/client/src/sound";
import type { Prefs } from "../apps/client/src/prefs";

/** Players that record what they do. */
function setup(prefs: Prefs) {
  const log: string[] = [];
  const make = (url: string): Player => {
    const p: Player = {
      loop: false,
      currentTime: 0,
      play: () => void log.push(`play ${url}${p.loop ? " loop" : ""}`),
      pause: () => void log.push(`pause ${url}`),
    };
    return p;
  };
  const files = { tap: "tap.wav", win: "win.wav", lose: "lose.wav", "music-menu": "menu.wav" };
  return { log, sounds: createSounds(files, make, () => prefs), prefs };
}

describe("sounds and music (UX-09)", () => {
  it("plays sounds and loops the music while both are on", () => {
    const { log, sounds } = setup({ music: true, sounds: true });
    sounds.play("tap");
    sounds.music("menu");
    sounds.music("menu");
    expect(log).toEqual(["play tap.wav", "play menu.wav loop"]);
  });

  it("plays nothing when switched off, and follows the switches at once", () => {
    const s = setup({ music: false, sounds: false });
    s.sounds.play("win");
    s.sounds.music("menu");
    expect(s.log).toEqual([]);
    s.prefs.music = true;
    s.sounds.prefsChanged();
    expect(s.log).toEqual(["play menu.wav loop"]);
    s.prefs.music = false;
    s.sounds.prefsChanged();
    expect(s.log).toEqual(["play menu.wav loop", "pause menu.wav"]);
  });

  it("ships a file for every sound and music inside the app", () => {
    const files = readdirSync(new URL("../apps/client/art/sounds/", import.meta.url)).map((f) => f.replace(/\.\w+$/, ""));
    for (const s of SOUNDS) expect(files).toContain(s);
    for (const m of MUSIC) expect(files).toContain(`music-${m}`);
  });
});
