/**
 * The design space and the phone's safe area.
 *
 * Screens are laid out in a design space 390 units wide. Its top (y = 0) is the top of the safe area, below the
 * status bar, notch or camera island; its bottom (y = H) is the bottom of the safe area, above the home indicator.
 * Only backgrounds may go outside it: `SCREEN` is the whole display in design units, and backgrounds that fill it
 * reach behind the status bar and the home indicator. Buttons, numbers and everything else that shows data or does
 * something stay inside 0..H.
 *
 * H is set once at start from the device (`fitScreen`): the width fills the safe area and H is whatever height that
 * leaves, but at least MIN_H (shorter screens scale everything down) and at most MAX_H (taller ones get an empty band).
 * Screens therefore place their top parts from y = 0 down and their bottom parts from y = H up.
 */
import { DEV_TOOLS } from "./devtools";
export const W = 390;
/** Every screen fits into this height (an iPhone 15 Pro's safe area is about 753). */
export const MIN_H = 750;
export const MAX_H = 900;

/** Height of the safe area in design units; set by `fitScreen` before the first screen is built. */
export let H = 844;

/** The whole display in design units (x and y are negative where it reaches past the safe area). */
export const SCREEN = { x: 0, y: 0, w: W, h: H };

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The safe-area insets in CSS pixels, from `env(safe-area-inset-*)` (needs `viewport-fit=cover`, see index.html).
 * For checks in a desktop browser `?safe=top,bottom` (e.g. `?safe=59,34`) pretends to be a phone (development builds only, devtools.ts).
 */
export function safeInsets(): Insets {
  const fake = DEV_TOOLS ? new URLSearchParams(location.search).get("safe") : null;
  if (fake) {
    const [top = 0, bottom = 0] = fake.split(",").map(Number);
    return { top, right: 0, bottom, left: 0 };
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  const out = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  return out;
}

/**
 * Places the design space into the window's safe area. The first call also chooses H; later calls (window resized)
 * keep H and scale to fit. Returns the scale and the position of the design space's origin in CSS pixels.
 */
let fixed = false;
export function fitScreen(winW: number, winH: number, ins: Insets): { scale: number; x: number; y: number } {
  const sw = Math.max(1, winW - ins.left - ins.right),
    sh = Math.max(1, winH - ins.top - ins.bottom);
  if (!fixed) {
    H = Math.round(Math.min(MAX_H, Math.max(MIN_H, (sh * W) / sw)));
    fixed = true;
  }
  const scale = Math.min(sw / W, sh / H);
  const x = ins.left + (sw - W * scale) / 2,
    y = ins.top + (sh - H * scale) / 2;
  Object.assign(SCREEN, { x: -x / scale, y: -y / scale, w: winW / scale, h: winH / scale });
  return { scale, x, y };
}
