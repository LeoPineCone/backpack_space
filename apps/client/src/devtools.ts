/**
 * Development helpers (UX-06): the `window.__game` handle for automated checks, the simulation version in the
 * console and the `?safe=` stand-in for a phone's safe area. They exist in the dev server (`npm run client`) and in
 * a build made on purpose for checks (`npm run client:build:dev`, Vite mode "devtools"), never in the production
 * build: Vite replaces the flag with `false` there and drops the code behind it.
 */
import { Text, type Container } from "pixi.js";

export const DEV_TOOLS: boolean = import.meta.env.DEV || import.meta.env.MODE === "devtools";

/** A tappable thing on screen for automated checks: its name (the button's words, or its symbol) and its centre in page pixels. */
export interface TapTarget {
  name: string;
  x: number;
  y: number;
}

/**
 * Every visible tappable object below `root`, named by its own label (round buttons carry their symbol's name) or by
 * the words it shows. The browser runs (e2e/) tap these at their place on the page, so the tap goes through the
 * same event path as a finger.
 */
export function tapTargets(root: Container): TapTarget[] {
  const out: TapTarget[] = [];
  const words = (c: Container): string[] => (c instanceof Text ? [c.text] : c.children.flatMap((k) => words(k)));
  const walk = (c: Container) => {
    if (!c.visible || c.alpha === 0) return;
    if (c.eventMode === "static" && c.listenerCount("pointertap") > 0) {
      const name = c.label || words(c).join(" ").trim();
      const b = c.getBounds();
      if (name && b.width > 0) out.push({ name, x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
    for (const k of c.children) walk(k);
  };
  walk(root);
  return out;
}
