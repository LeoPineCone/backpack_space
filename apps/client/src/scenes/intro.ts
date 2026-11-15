/**
 * The short introduction on the first run: a few spots on the shop screen, each lit up with a row of symbols and one line.
 * Tap anywhere for the next spot. It can be seen again with the i button in the shop.
 */
import { Container, Graphics, Rectangle } from "pixi.js";
import type { Game, Scene } from "../game";
import { C, H, W } from "../theme";
import { icon } from "../icons";
import { at, box, disc, roundButton, tappable, txt } from "../ui";

const SEEN_KEY = "backpack-space.intro";

export interface IntroStep {
  /** the lit-up area in screen coordinates */
  spot: { x: number; y: number; w: number; h: number };
  /** symbols shown above the line, read left to right */
  icons: string[];
  line: string;
}

export function introSeen(): boolean { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; } }
function markSeen(): void { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* shown again next time */ } }

export function introOverlay(game: Game, steps: IntroStep[]): Scene {
  const root = new Container();
  let at_ = 0;
  let pulse = 0;
  let ring: Graphics | null = null;

  const close = () => { markSeen(); game.closeOverlay(); };
  const next = () => { if (++at_ >= steps.length) close(); else render(); };
  const render = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    const st = steps[at_]!, s = st.spot, pad = 6;
    const x0 = Math.max(0, s.x - pad), y0 = Math.max(0, s.y - pad), x1 = Math.min(W, s.x + s.w + pad), y1 = Math.min(H, s.y + s.h + pad);
    // dark everywhere except the spot; a tap anywhere goes on
    const dim = new Graphics()
      .rect(0, 0, W, y0).rect(0, y1, W, H - y1).rect(0, y0, x0, y1 - y0).rect(x1, y0, W - x1, y1 - y0)
      .fill({ color: C.bgDeep, alpha: 0.82 });
    const catcher = new Graphics().rect(0, 0, W, H).fill({ color: 0xffffff, alpha: 0.001 });
    tappable(catcher, next);
    ring = new Graphics().roundRect(x0, y0, x1 - x0, y1 - y0, 14).stroke({ width: 3, color: C.gold });
    root.addChild(dim, catcher, ring);

    // the card goes where there is more room: above or below the spot
    const cardW = W - 40;
    const iconRow = new Container();
    let ix = 0;
    for (const name of st.icons) {
      if (name === "arrow") { iconRow.addChild(at(icon("arrow", 18, C.dim), ix + 9, 22)); ix += 26; continue; }
      iconRow.addChild(at(disc(22, { fill: C.bg, line: C.line, lineW: 2 }), ix + 22, 22), at(icon(name, 26, name === "starFull" || name === "merge" ? C.gold : C.text), ix + 22, 22));
      ix += 52;
    }
    const line = txt(st.line, 17, { font: "text", weight: "600", wrap: cardW - 40, align: "center", anchor: [0.5, 0] });
    const cardH = 20 + 44 + 14 + line.height + 34;
    const above = y0 > H - y1;
    const cy = above ? Math.max(16, y0 - 18 - cardH) : Math.min(H - 16 - cardH, y1 + 18);
    const card = tappable(new Container(), next, new Rectangle(0, 0, cardW, 0));
    card.addChild(box(cardW, cardH, { fill: C.panel, line: C.gold, lineW: 2, radius: 20 }));
    card.addChild(at(iconRow, (cardW - ix + (st.icons.at(-1) === "arrow" ? 0 : 8)) / 2, 20), at(line, cardW / 2, 78));
    // where in the introduction we are
    const dots = new Graphics();
    steps.forEach((_, i) => dots.circle(cardW / 2 + (i - (steps.length - 1) / 2) * 14, cardH - 16, i === at_ ? 4 : 3).fill(i === at_ ? C.gold : C.line));
    card.addChild(dots);
    (card.hitArea as Rectangle).height = cardH;
    // leave the introduction at once
    card.addChild(at(roundButton("close", 15, close, { fill: C.bg, iconSize: 16 }), cardW - 24, 24));
    root.addChild(at(card, 20, cy));
    root.hitArea = new Rectangle(0, 0, W, H);
  };
  render();
  return {
    root,
    update(dt) {
      pulse += dt;
      if (ring) ring.alpha = 0.65 + 0.35 * Math.sin(pulse * 4);
    },
  };
}
