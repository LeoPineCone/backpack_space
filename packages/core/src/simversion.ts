/**
 * The simulation version (CORE-03): one string that changes whenever a fight or a shop could come out differently.
 * Client and server compare it to know whether they compute the same game.
 */

/**
 * Raised by hand whenever the logic of the core changes what a fight, a shop or a run computes
 * (battle.ts, compile.ts, shop.ts, run.ts, rng.ts …). Data changes are caught by the hash and need no raise.
 */
export const ENGINE_VERSION = 2;

/** Keys that only hold display text; they never change a fight. */
const TEXT_KEYS = new Set(["name", "title"]);

/** JSON with sorted keys and without text-only keys, so the same rules always give the same string. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && !TEXT_KEYS.has(k) && typeof v !== "function")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** 53-bit string hash (cyrb53); only integer math, so it is equal in every JS engine. */
export function hash53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** The fight-relevant data: rules, heroes, items and recipes as validated. */
export interface SimInput {
  rules: unknown;
  heroes: readonly { focus?: unknown }[];
  items: readonly unknown[];
  recipes: readonly unknown[];
}

/** `<engine>.<data hash>`, e.g. "1.0a3f…". Same data and engine give the same version on every machine. */
export function simVersionOf(input: SimInput): string {
  // a hero's "focus" sentence is text; the "focus" lists of its paths are data and stay
  const heroes = input.heroes.map((h) => (typeof h.focus === "string" ? { ...h, focus: undefined } : h));
  return `${ENGINE_VERSION}.${hash53(canonical({ rules: input.rules, heroes, items: input.items, recipes: input.recipes }))}`;
}
