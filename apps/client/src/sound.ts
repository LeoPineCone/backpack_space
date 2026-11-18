/**
 * Sounds and music (UX-09, docs/ux.md M9): a few menu sounds and a menu music, each switchable in the settings (the
 * setting is stored with the other device settings, prefs.ts). The files ship inside the app (`apps/client/art/sounds/`,
 * no downloads); until the real files exist (#104) they are silent stand-ins with the final names.
 *
 * The module itself does not know the browser: `createSounds` gets a way to make a player for a file, so a test can
 * count what plays. `main.ts` wires it to HTMLAudioElement and registers it with `useSounds`.
 */
import type { Prefs } from "./prefs";

/** short sounds: a tap on any button, the result of a fight */
export const SOUNDS = ["tap", "win", "lose"] as const;
export type SoundName = (typeof SOUNDS)[number];
/** looping music; one plays at a time */
export const MUSIC = ["menu"] as const;
export type MusicName = (typeof MUSIC)[number];

/** The part of an audio element the module uses. */
export interface Player {
  play(): Promise<void> | void;
  pause(): void;
  loop: boolean;
  currentTime: number;
}

export interface Sounds {
  play(name: SoundName): void;
  /** starts this music (or stops music with null); it plays only while music is switched on */
  music(name: MusicName | null): void;
  /** call after the settings changed: starts or stops the music */
  prefsChanged(): void;
}

/** `files`: file address per sound (`tap`) and music (`music-menu`); a missing file stays silent. */
export function createSounds(files: Record<string, string>, make: (url: string) => Player, prefs: () => Prefs): Sounds {
  let wanted: MusicName | null = null;
  let playing: { name: MusicName; player: Player } | null = null;
  const start = (p: Player) => void Promise.resolve(p.play()).catch(() => undefined); // a blocked autoplay stays silent

  const sync = () => {
    const name = prefs().music ? wanted : null;
    if (playing && playing.name === name) return;
    playing?.player.pause();
    playing = null;
    const url = name && files[`music-${name}`];
    if (!name || !url) return;
    const player = make(url);
    player.loop = true;
    playing = { name, player };
    start(player);
  };

  return {
    play(name) {
      const url = files[name];
      if (!prefs().sounds || !url) return;
      start(make(url));
    },
    music(name) {
      wanted = name;
      sync();
    },
    prefsChanged: sync,
  };
}

let current: Sounds | null = null;
/** Registers the game's sounds (main.ts). */
export function useSounds(s: Sounds): void {
  current = s;
}
/** Plays a sound if the game has sounds (tests and tools have none). */
export function playSound(name: SoundName): void {
  current?.play(name);
}
/** Tells the sounds that the settings changed. */
export function soundPrefsChanged(): void {
  current?.prefsChanged();
}
