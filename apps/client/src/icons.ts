/** Placeholder symbols: simple white line icons drawn from SVG paths, tinted when used. Real art replaces them later. */
import { Sprite, Texture } from "pixi.js";

const HEART = "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z";
const STAR = "M12 3l2.6 5.6l6 .7l-4.5 4.1l1.3 6l-5.4-3.1l-5.4 3.1l1.3-6L3.4 9.3l6-.7z";
const SHIELD = "M12 3l7 3v6c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6z";

const PATHS: Record<string, string> = {
  // item types
  weapon: "M5 19l3-3M7 14l3 3M9 15L19 5V3h-2L7 13",
  armor: SHIELD,
  accessory: "M12 9a5.500 5.500 0 1 0 0 11a5.500 5.500 0 0 0 0-11zM9 4h6l-3 5z",
  pet: "M8 15c0-2 2-3 4-3s4 1 4 3s-2 4-4 4s-4-2-4-4zM6 10v.01M10 6v.01M14 6v.01M18 10v.01",
  food: "M6 3v7a3 3 0 0 0 6 0V3M9 3v18M17 3c-2 2-2 7 0 9v9",
  mechanical: "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  organic: "M5 19c0-9 5-14 14-14c0 9-5 14-14 14zM5 19l8-8",
  bag: "M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2",
  crafted: "M4 20l9-9M13 11l-2-2l5-5l4 4l-5 5z",
  any: "M5 5h14v14H5z",
  // statuses
  shield: SHIELD + "M9 12l2 2l4-4",
  regen: "M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5M18 3v4h-4M6 21v-4h4",
  overclock: "M13 3L5 13h6l-1 8l8-10h-6z",
  power: "M12 20V6M6 11l6-6l6 6M6 20h12",
  spikes: "M3 19l4-10l3 6l2-10l2 10l3-6l4 10z",
  burn: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4c0 2 1 3 2 3c0-3-1-5 1-9z",
  toxin: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z",
  cryo: "M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9",
  jam: "M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM6.5 6.5l11 11",
  radiation: "M12 10a2 2 0 1 0 0 4a2 2 0 0 0 0-4zM12 3v4M4.2 16.5l3.500-2M19.800 16.500l-3.500-2M12 3a9 9 0 0 1 7.800 13.500M4.200 16.500A9 9 0 0 1 12 3",
  // effects
  energy: "M7 7h10v12H7zM10 4h4v3M13 9l-3 4h4l-3 4",
  energyRegen: "M7 7h10v12H7zM10 4h4v3M12 10v6M9 13h6",
  melee: "M5 19l3-3M7 14l3 3M9 15L19 5V3h-2L7 13",
  ranged: "M12 5a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM12 2v4M12 18v4M2 12h4M18 12h4",
  damage: "M12 3l2 6l6-2l-4 5l4 5l-6-2l-2 6l-2-6l-6 2l4-5l-4-5l6 2z",
  heal: "M12 5v14M5 12h14",
  cleanse: "M11 3l1.800 5.200L18 10l-5.200 1.800L11 17l-1.800-5.200L4 10l5.200-1.800zM18 16v4M16 18h4",
  strip: SHIELD + "M13 7l-3 5h4l-3 5",
  speed: "M4 6l7 6l-7 6zM13 6l7 6l-7 6z",
  crit: "M12 2l3 7l7 3l-7 3l-3 7l-3-7l-7-3l7-3z",
  maxHp: HEART + "M12 9v5M9.500 11.500h5",
  ready: "M6 4l14 8l-14 8z",
  // triggers and targets
  clock: "M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 8v4l3 2",
  start: "M6 21V4M6 4h11l-2 4l2 4H6",
  hit: "M12 5a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM12 2v5M12 17v5M2 12h5M17 12h5",
  attacked: "M19 5L9 15M9 9v6h6M5 19h.01",
  phase: "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  lowHp: HEART + "M12 8l-2 4h4l-2 4",
  chance: "M5 5h14v14H5zM9 9h.01M15 15h.01M12 12h.01",
  hero: "M12 4a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM4 21c1-5 4-7 8-7s7 2 8 7",
  star: STAR,
  ship: "M7 9a5 5 0 0 1 10 0v11H7zM10 4h4M9 14h6",
  self: "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4",
  // interface
  heart: HEART,
  coin: "M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 8v8",
  gem: "M12 3l6 9l-6 9l-6-9z",
  pin: "M9 3h6M10 3v6l-3 4h10l-3-4V3M12 13v8",
  dice: "M5 5h14v14H5zM9 9h.01M15 15h.01M12 12h.01M15 9h.01M9 15h.01",
  bin: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  book: "M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM9 8h5M9 12h5",
  settings: "M4 7h10M18 7h2M14 4v6M4 17h2M10 17h10M6 14v6",
  cart: "M3 4h3l2 11h10l2-8H7M9 19h.01M17 19h.01",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  swords: "M4 20l3-3M6 15l3 3M8 16L20 4h-3L7 14M20 20l-3-3M18 15l-3 3",
  arrow: "M5 12h14M13 6l6 6l-6 6",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12l5 5l9-10",
  share: "M12 15V4M8 8l4-4l4 4M5 13v7h14v-7",
  chart: "M6 20v-6M12 20V4M18 20v-10",
  home: "M4 11l8-7l8 7M6 10v10h12V10",
  rotate: "M20 12a8 8 0 1 1-3-6.200M20 4v5h-5",
  merge: "M4 12h6M20 12h-6M8 9l3 3l-3 3M16 9l-3 3l3 3",
  info: "M12 11v6M12 7v.01",
  league: SHIELD + "M9 12l2 2l4-4",
  plus: "M12 6v12M6 12h12",
};
/** Filled variants. */
const FILLED: Record<string, string> = { heartFull: HEART, starFull: STAR };

export type IconName = string;
const textures = new Map<string, Texture>();

function load(name: string, path: string, filled: boolean): Promise<void> {
  const body = filled
    ? `<path d="${path}" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`
    : `<path d="${path}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">${body}</svg>`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { textures.set(name, Texture.from(img)); resolve(); };
    img.onerror = () => resolve();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

export async function loadIcons(): Promise<void> {
  await Promise.all([
    ...Object.entries(PATHS).map(([n, p]) => load(n, p, false)),
    ...Object.entries(FILLED).map(([n, p]) => load(n, p, true)),
  ]);
}

export const hasIcon = (name: string) => textures.has(name);

/** A square icon sprite of the given size, anchored at its centre. */
export function icon(name: IconName, size: number, tint = 0xffffff): Sprite {
  const s = new Sprite(textures.get(name) ?? textures.get("any") ?? Texture.WHITE);
  s.anchor.set(0.5);
  s.width = size; s.height = size;
  s.tint = tint;
  return s;
}
