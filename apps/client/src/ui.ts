/** Small drawing helpers shared by all screens. */
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { BUTTON, C, FONT } from "./theme";
import { icon } from "./icons";

export interface TxtOpts { color?: number; font?: "display" | "text"; weight?: "400" | "600" | "700"; spacing?: number; wrap?: number; align?: "left" | "center" | "right"; anchor?: [number, number]; lineHeight?: number }

export function txt(text: string | number, size: number, o: TxtOpts = {}): Text {
  const font = o.font ?? "display";
  const t = new Text({
    text: String(text),
    style: {
      fontFamily: FONT[font], fontSize: size, fontWeight: o.weight ?? (font === "display" ? "700" : "400"), fill: o.color ?? C.text,
      letterSpacing: o.spacing ?? 0, align: o.align ?? "left", wordWrap: o.wrap !== undefined, wordWrapWidth: o.wrap ?? 100,
      ...(o.lineHeight ? { lineHeight: o.lineHeight } : {}),
    },
  });
  t.resolution = 3;
  if (o.anchor) t.anchor.set(o.anchor[0], o.anchor[1]);
  return t;
}

export interface BoxOpts { fill?: number; alpha?: number; line?: number; lineW?: number; radius?: number }

export function box(w: number, h: number, o: BoxOpts = {}): Graphics {
  const g = new Graphics().roundRect(0, 0, w, h, o.radius ?? 0);
  if (o.fill !== undefined) g.fill({ color: o.fill, alpha: o.alpha ?? 1 });
  if (o.line !== undefined) g.stroke({ width: o.lineW ?? 1.5, color: o.line, alignment: 1 });
  return g;
}

export function disc(r: number, o: BoxOpts = {}): Graphics {
  const g = new Graphics().circle(0, 0, r);
  if (o.fill !== undefined) g.fill({ color: o.fill, alpha: o.alpha ?? 1 });
  if (o.line !== undefined) g.stroke({ width: o.lineW ?? 1.5, color: o.line, alignment: 1 });
  return g;
}

/** Makes a display object tappable. */
export function tappable<T extends Container>(obj: T, onTap: () => void, hit?: Rectangle): T {
  obj.eventMode = "static";
  obj.cursor = "pointer";
  if (hit) obj.hitArea = hit;
  // keep the press away from a draggable parent
  obj.on("pointerdown", (e) => e.stopPropagation());
  obj.on("pointertap", (e) => { e.stopPropagation(); onTap(); });
  return obj;
}

export function at<T extends Container>(obj: T, x: number, y: number): T { obj.position.set(x, y); return obj; }

/** Round button with a symbol; origin at its centre. */
export function roundButton(name: string, r: number, onTap: () => void, o: { fill?: number; line?: number; tint?: number; iconSize?: number } = {}): Container {
  const c = new Container();
  c.addChild(disc(r, { fill: o.fill ?? BUTTON.icon.fill, line: o.line ?? BUTTON.icon.line, lineW: 2 }));
  c.addChild(icon(name, o.iconSize ?? r * 0.9, o.tint ?? BUTTON.icon.ink));
  return tappable(c, onTap, new Rectangle(-r - 4, -r - 4, r * 2 + 8, r * 2 + 8));
}

/** The round "i" button; origin at its centre. */
export function infoButton(r: number, onTap: () => void, active = false): Container {
  const c = new Container();
  c.addChild(disc(r, { fill: active ? C.cyan : C.panel, alpha: active ? 1 : 0.001, line: C.cyan, lineW: 2 }));
  c.addChild(txt("i", r * 0.95, { color: active ? C.cyanInk : C.cyan, anchor: [0.5, 0.5] }));
  return tappable(c, onTap, new Rectangle(-r - 4, -r - 4, r * 2 + 8, r * 2 + 8));
}

/** Wide pill button; origin top-left. */
export function pillButton(label: string, w: number, h: number, onTap: () => void, o: { fill?: number; ink?: number; iconName?: string; size?: number; disabled?: boolean } = {}): Container {
  const c = new Container();
  const ink = o.ink ?? BUTTON.primary.ink;
  c.addChild(box(w, h, { fill: o.fill ?? BUTTON.primary.fill, radius: h / 2 }));
  const label_ = txt(label, o.size ?? 24, { color: ink, spacing: 2, anchor: [0.5, 0.5] });
  if (o.iconName) {
    const ic = icon(o.iconName, 26, ink);
    const total = 26 + 10 + label_.width;
    ic.position.set(w / 2 - total / 2 + 13, h / 2);
    label_.anchor.set(0, 0.5);
    label_.position.set(w / 2 - total / 2 + 36, h / 2);
    c.addChild(ic);
  } else label_.position.set(w / 2, h / 2);
  c.addChild(label_);
  if (o.disabled) { c.alpha = BUTTON.lockedAlpha; return c; }
  return tappable(c, onTap, new Rectangle(0, 0, w, h));
}

/** Small capsule with a symbol and a number (gold, currency); origin top-left. Returns its width through `.width`. */
export function hudPill(name: string, value: string | number, line: number, tint: number, h = 44): Container {
  const c = new Container();
  const label = txt(value, h * 0.42, { anchor: [0, 0.5] });
  const w = 14 + 20 + 6 + label.width + 14;
  c.addChild(box(w, h, { fill: C.panel, line, radius: h / 2 }));
  c.addChild(at(icon(name, 20, tint), 24, h / 2));
  c.addChild(at(label, 40, h / 2));
  return c;
}

/** Row of hearts: full for lives left, empty for lost ones. Origin top-left. */
export function hearts(lives: number, max: number, size: number, gap = 4): Container {
  const c = new Container();
  for (let i = 0; i < max; i++) c.addChild(at(icon(i < lives ? "heartFull" : "heart", size, i < lives ? C.text : C.line), i * (size + gap) + size / 2, size / 2));
  return c;
}

/** Dashed rounded outline used for art placeholders. */
export function placeholder(w: number, h: number, label: string, radius = 16): Container {
  const c = new Container();
  const g = new Graphics();
  const dash = 7, gap = 6;
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(len / (dash + gap));
    for (let i = 0; i <= n; i++) {
      const a = (i * (dash + gap)) / len, b = Math.min(1, (i * (dash + gap) + dash) / len);
      g.moveTo(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a).lineTo(x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
    }
  };
  seg(radius, 0, w - radius, 0); seg(w, radius, w, h - radius); seg(w - radius, h, radius, h); seg(0, h - radius, 0, radius);
  g.stroke({ width: 2, color: C.dim, alpha: 0.7 });
  c.addChild(g);
  if (label) c.addChild(at(txt(label, 11, { font: "text", color: C.dim, anchor: [0.5, 0.5] }), w / 2, h / 2));
  return c;
}

/** A full-screen dark layer that swallows taps; `onTap` usually closes the popup above it. */
export function dimmer(w: number, h: number, onTap?: () => void, alpha = 0.72): Graphics {
  const g = new Graphics().rect(0, 0, w, h).fill({ color: C.bgDeep, alpha });
  g.eventMode = "static";
  if (onTap) g.on("pointertap", (e) => { e.stopPropagation(); onTap(); });
  return g;
}

/** The hero's round badge (placeholder until there is a portrait): the first letter of the name in a circle. Origin at the centre. */
export function heroBadge(name: string, r: number, line: number = C.cyan): Container {
  const c = new Container();
  c.addChild(disc(r, { fill: C.panel, line, lineW: 2 }), txt(name.replace(/[^\p{L}]/gu, "")[0]!.toLocaleUpperCase(), r * 0.82, { anchor: [0.5, 0.5] }));
  return c;
}
