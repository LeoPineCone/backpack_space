/** Small drawing helpers shared by all screens. */
import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { artTexture } from "./art";
import { BUTTON, C, COMIC, FONT, SCREEN } from "./theme";
import { icon } from "./icons";

export interface TxtOpts {
  color?: number;
  font?: "display" | "text";
  weight?: "400" | "600" | "700";
  spacing?: number;
  wrap?: number;
  align?: "left" | "center" | "right";
  anchor?: [number, number];
  lineHeight?: number;
  /** ink comic title: black ink outline around the letters and a hard shadow below (no blur) */
  inked?: boolean;
}

export function txt(text: string | number, size: number, o: TxtOpts = {}): Text {
  const font = o.font ?? "display";
  const t = new Text({
    text: String(text),
    style: {
      fontFamily: FONT[font],
      fontSize: size,
      fontWeight: o.weight ?? (font === "display" ? "700" : "400"),
      fill: o.color ?? C.text,
      letterSpacing: o.spacing ?? 0,
      align: o.align ?? "left",
      wordWrap: o.wrap !== undefined,
      wordWrapWidth: o.wrap ?? 100,
      ...(o.lineHeight ? { lineHeight: o.lineHeight } : {}),
      ...(o.inked
        ? {
            stroke: { color: C.ink, width: Math.max(3, size * 0.16), join: "round" as const },
            dropShadow: { color: C.ink, alpha: 1, blur: 0, angle: Math.PI / 2, distance: Math.max(2, size * 0.09) },
          }
        : {}),
    },
  });
  t.resolution = 3;
  if (o.anchor) t.anchor.set(o.anchor[0], o.anchor[1]);
  return t;
}

export interface BoxOpts {
  fill?: number;
  alpha?: number;
  line?: number;
  lineW?: number;
  radius?: number;
  /** black ink outline outside the shape; a `line` then becomes a thin inner edge */
  ink?: boolean;
}

function outline(g: Graphics, o: BoxOpts): Graphics {
  if (o.ink) g.stroke({ width: COMIC.outline, color: C.ink, alignment: 0 });
  if (o.line !== undefined) g.stroke({ width: o.lineW ?? 1.5, color: o.line, alignment: o.ink ? 1 : 0 });
  return g;
}

export function box(w: number, h: number, o: BoxOpts = {}): Graphics {
  const g = new Graphics().roundRect(0, 0, w, h, o.radius ?? 0);
  if (o.fill !== undefined) g.fill({ color: o.fill, alpha: o.alpha ?? 1 });
  return outline(g, o);
}

export function disc(r: number, o: BoxOpts = {}): Graphics {
  const g = new Graphics().circle(0, 0, r);
  if (o.fill !== undefined) g.fill({ color: o.fill, alpha: o.alpha ?? 1 });
  return outline(g, o);
}

/** The hard flat ink shadow under a button or card: the same shape, moved down, no blur. */
export function shadowBox(w: number, h: number, radius = 0, dy: number = COMIC.shadow): Graphics {
  return new Graphics().roundRect(-COMIC.outline, dy - COMIC.outline, w + COMIC.outline * 2, h + COMIC.outline * 2, radius + COMIC.outline).fill(C.ink);
}
export function shadowDisc(r: number, dy: number = COMIC.shadow): Graphics {
  return new Graphics().circle(0, dy, r + COMIC.outline).fill(C.ink);
}

/** Moves `face` into its shadow while the finger is down (no vibration, docs/ux.md). */
export function pressable(btn: Container, face: Container): void {
  const y0 = face.y;
  btn.on("pointerdown", () => (face.y = y0 + COMIC.press));
  for (const ev of ["pointerup", "pointerupoutside", "pointerleave", "pointercancel"] as const) btn.on(ev, () => (face.y = y0));
}

/**
 * A comic panel like a riveted ship plate: hard shadow, ink outline, a thin inner line in `line`, rivets in the
 * corners and, on big panels, a little hand-inked hatching in the lower right corner (docs/theme.md). Origin top-left.
 */
export function plate(
  w: number,
  h: number,
  o: { fill?: number; line?: number; radius?: number; rivets?: boolean; hatch?: boolean; shadow?: boolean } = {},
): Container {
  const c = new Container();
  const r = o.radius ?? 16,
    fill = o.fill ?? C.panel,
    line = o.line ?? C.line;
  if (o.shadow !== false) c.addChild(shadowBox(w, h, r));
  c.addChild(box(w, h, { fill, radius: r, ink: true }));
  const inset = 5;
  c.addChild(
    at(new Graphics().roundRect(0, 0, w - inset * 2, h - inset * 2, Math.max(2, r - inset)).stroke({ width: 1.5, color: line, alpha: 0.75 }), inset, inset),
  );
  if (o.hatch) {
    const g = new Graphics();
    const n = 7,
      step = 6,
      x1 = w - inset - 4,
      y1 = h - inset - 4;
    for (let i = 0; i < n; i++) {
      const d = 18 + i * step;
      g.moveTo(x1 - d, y1).lineTo(x1, y1 - d);
    }
    g.stroke({ width: 1.2, color: C.ink, alpha: 0.55, cap: "round" });
    const mask = new Graphics().roundRect(inset + 2, inset + 2, w - inset * 2 - 4, h - inset * 2 - 4, Math.max(2, r - inset - 2)).fill(0xffffff);
    g.mask = mask;
    c.addChild(mask, g);
  }
  if (o.rivets !== false) {
    const k = inset + 6;
    for (const [x, y] of [
      [k, k],
      [w - k, k],
      [k, h - k],
      [w - k, h - k],
    ] as const)
      c.addChild(
        at(disc(COMIC.rivet, { fill: line, ink: false }), x, y),
        at(new Graphics().circle(0, 0, COMIC.rivet).stroke({ width: 1, color: C.ink }), x, y),
      );
  }
  return c;
}

/** A screen's background colour over the whole display, behind the status bar and the home indicator too. */
export function screenFill(color: number): Graphics {
  return new Graphics().rect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h).fill(color);
}

/** Makes a display object tappable. */
export function tappable<T extends Container>(obj: T, onTap: () => void, hit?: Rectangle): T {
  obj.eventMode = "static";
  obj.cursor = "pointer";
  if (hit) obj.hitArea = hit;
  // keep the press away from a draggable parent
  obj.on("pointerdown", (e) => e.stopPropagation());
  obj.on("pointertap", (e) => {
    e.stopPropagation();
    onTap();
  });
  return obj;
}

export function at<T extends Container>(obj: T, x: number, y: number): T {
  obj.position.set(x, y);
  return obj;
}

/** Round button with a symbol; origin at its centre. */
export function roundButton(name: string, r: number, onTap: () => void, o: { fill?: number; line?: number; tint?: number; iconSize?: number } = {}): Container {
  const c = new Container();
  const face = new Container();
  c.addChild(shadowDisc(r, COMIC.shadow - 1), face);
  face.addChild(disc(r, { fill: o.fill ?? BUTTON.icon.fill, line: o.line ?? BUTTON.icon.line, lineW: 2, ink: true }));
  face.addChild(icon(name, o.iconSize ?? r * 0.9, o.tint ?? BUTTON.icon.ink));
  pressable(c, face);
  return tappable(c, onTap, new Rectangle(-r - 4, -r - 4, r * 2 + 8, r * 2 + 8));
}

/** The round "i" button; origin at its centre. */
export function infoButton(r: number, onTap: () => void, active = false): Container {
  const c = new Container();
  c.addChild(disc(r, { fill: active ? C.cyan : C.panel, line: C.cyan, lineW: 2, ink: true }));
  c.addChild(txt("i", r * 0.95, { color: active ? C.cyanInk : C.cyan, anchor: [0.5, 0.5] }));
  return tappable(c, onTap, new Rectangle(-r - 4, -r - 4, r * 2 + 8, r * 2 + 8));
}

/** Wide pill button; origin top-left. */
export function pillButton(
  label: string,
  w: number,
  h: number,
  onTap: () => void,
  o: { fill?: number; ink?: number; iconName?: string; size?: number; disabled?: boolean } = {},
): Container {
  const c = new Container();
  const ink = o.ink ?? BUTTON.primary.ink;
  const face = new Container();
  c.addChild(shadowBox(w, h, h / 2), face);
  face.addChild(box(w, h, { fill: o.fill ?? BUTTON.primary.fill, radius: h / 2, ink: true }));
  const label_ = txt(label, o.size ?? 24, { color: ink, spacing: 2, anchor: [0.5, 0.5] });
  if (o.iconName) {
    const ic = icon(o.iconName, 26, ink);
    const total = 26 + 10 + label_.width;
    ic.position.set(w / 2 - total / 2 + 13, h / 2);
    label_.anchor.set(0, 0.5);
    label_.position.set(w / 2 - total / 2 + 36, h / 2);
    face.addChild(ic);
  } else label_.position.set(w / 2, h / 2);
  face.addChild(label_);
  if (o.disabled) {
    c.alpha = BUTTON.lockedAlpha;
    return c;
  }
  pressable(c, face);
  return tappable(c, onTap, new Rectangle(0, 0, w, h));
}

/** Small capsule with a symbol and a number (gold, currency); origin top-left. Returns its width through `.width`. */
export function hudPill(name: string, value: string | number, line: number, tint: number, h = 44): Container {
  const c = new Container();
  const label = txt(value, h * 0.42, { anchor: [0, 0.5], inked: true });
  const w = 14 + 22 + 6 + label.width + 14;
  c.addChild(shadowBox(w, h, h / 2, COMIC.shadow - 1), box(w, h, { fill: C.panel, line, radius: h / 2, ink: true }));
  c.addChild(at(icon(name, 24, tint), 25, h / 2));
  c.addChild(at(label, 40, h / 2));
  return c;
}

/** Row of hearts: full for lives left, empty for lost ones. Origin top-left. */
export function hearts(lives: number, max: number, size: number, gap = 4): Container {
  const c = new Container();
  for (let i = 0; i < max; i++)
    c.addChild(at(icon(i < lives ? "heartFull" : "heart", size, i < lives ? C.text : C.line), i * (size + gap) + size / 2, size / 2));
  return c;
}

/** Dashed rounded outline used for art placeholders. */
export function placeholder(w: number, h: number, label: string, radius = 16): Container {
  const c = new Container();
  const g = new Graphics();
  const dash = 7,
    gap = 6;
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1),
      n = Math.floor(len / (dash + gap));
    for (let i = 0; i <= n; i++) {
      const a = (i * (dash + gap)) / len,
        b = Math.min(1, (i * (dash + gap) + dash) / len);
      g.moveTo(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a).lineTo(x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
    }
  };
  seg(radius, 0, w - radius, 0);
  seg(w, radius, w, h - radius);
  seg(w - radius, h, radius, h);
  seg(0, h - radius, 0, radius);
  g.stroke({ width: 2, color: C.dim, alpha: 0.7 });
  c.addChild(g);
  if (label) c.addChild(at(txt(label, 11, { font: "text", color: C.dim, anchor: [0.5, 0.5] }), w / 2, h / 2));
  return c;
}

/** A dark layer over the whole display (status bar area included) that swallows taps; `onTap` usually closes the popup above it. */
export function dimmer(onTap?: () => void, alpha = 0.72): Graphics {
  const g = new Graphics().rect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h).fill({ color: C.bgDeep, alpha });
  g.eventMode = "static";
  if (onTap)
    g.on("pointertap", (e) => {
      e.stopPropagation();
      onTap();
    });
  return g;
}

/** The hero's round head picture inside a circle of radius r (art/heroes/<id>-head), or null while there is none. */
export function heroHead(id: string, r: number): Container | null {
  const tex = artTexture(`heroes/${id}-head`);
  if (!tex) return null;
  const c = new Container();
  const pic = new Sprite(tex);
  pic.anchor.set(0.5);
  pic.width = pic.height = r * 2;
  const mask = new Graphics().circle(0, 0, r).fill(0xffffff);
  pic.mask = mask;
  c.addChild(pic, mask);
  return c;
}

/** The hero's round badge: the head picture in a circle, or the first letter of the name while there is no picture. Origin at the centre. */
export function heroBadge(hero: { id: string; name: string }, r: number, line: number = C.cyan): Container {
  const c = new Container();
  c.addChild(disc(r, { fill: C.panel, line, lineW: 2 }));
  c.addChild(heroHead(hero.id, r) ?? txt(hero.name.replace(/[^\p{L}]/gu, "")[0]!.toLocaleUpperCase(), r * 0.82, { anchor: [0.5, 0.5] }));
  return c;
}
