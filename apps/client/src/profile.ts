/**
 * The player's progress between runs, kept on this device until there are accounts and a server.
 * The rules (what a run pays, leagues, seasons) live in the core (`packages/core/src/meta.ts`); this file only stores.
 */
import { fitProfile, newProfile, type Meta, type Profile } from "@backpack-space/core";

const KEY = "backpack-space.profile";
const VERSION = 1;

export function readProfile(meta: Meta): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as { v: number; profile: unknown };
      const p = s?.v === VERSION ? fitProfile(meta, s.profile) : null;
      if (p) return p;
    }
  } catch { /* unreadable: start fresh */ }
  return newProfile(meta);
}

export function writeProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, profile: p })); } catch { /* storage unavailable: progress only lasts this session */ }
}

/** Today on this device as YYYY-MM-DD (the core never reads the clock). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
