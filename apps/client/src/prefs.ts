/** Device settings that are not progress: music and sounds on or off. Stored on this device. No vibration setting: the app never vibrates. */
const KEY = "backpack-space.prefs";

export interface Prefs {
  music: boolean;
  sounds: boolean;
}

export function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    return { music: p.music ?? true, sounds: p.sounds ?? true };
  } catch {
    return { music: true, sounds: true };
  }
}

export function writePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the setting lasts this session */
  }
}
