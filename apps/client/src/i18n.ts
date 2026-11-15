/**
 * The player's language. One build carries every language (data/locales/*.json).
 * On the first start the game follows the device language (English when the game does not have it);
 * the settings can switch it, and the choice is stored on the device.
 */
import type { Params, Translator } from "@backpack-space/core";
import { DATA } from "./data";

const KEY = "backpack-space.lang";
/** stored choice meaning "follow the device" */
export const DEVICE = "device";

/** The language of the device or browser, if the game has it; English otherwise. */
export function deviceLanguage(): string {
  const prefs = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return DATA.locales.match(prefs.filter(Boolean));
}

/** What the player picked in the settings: a language id or DEVICE. */
export function languageChoice(): string {
  try { const v = localStorage.getItem(KEY); if (v && (v === DEVICE || DATA.locales.languages.some((l) => l.id === v))) return v; } catch { /* no storage */ }
  return DEVICE;
}

let current: Translator = DATA.locales.get(languageChoice() === DEVICE ? deviceLanguage() : languageChoice());
document.documentElement.lang = current.lang;

/** Switches the language and remembers the choice on this device. */
export function setLanguage(choice: string): void {
  try { localStorage.setItem(KEY, choice); } catch { /* the choice only lasts this session */ }
  current = DATA.locales.get(choice === DEVICE ? deviceLanguage() : choice);
  document.documentElement.lang = current.lang;
}

/** The translator for the current language. */
export const tr = (): Translator => current;
/** The text for a key in the current language (see data/locales/en.json). */
export const t = (key: string, params?: Params): string => current.t(key, params);
/** Upper case the way the current language writes it. */
export const upper = (s: string): string => s.toLocaleUpperCase(current.lang);
