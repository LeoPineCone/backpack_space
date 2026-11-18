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
  /** a frame in a darker tone of the fill (or the theme line on dark fills) when no `line` is given */
  framed?: boolean;
}

/** Direction of the ink strokes (x per y; 1 = 45°, smaller = steeper) and how much the shading edge rises to the right. */
const HATCH = { slant: COMIC.hatchSlant, tilt: COMIC.hatchTilt };

/** A darker tone of a colour (k < 1). */
function shade(c: number, k: number): number {
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
}

const luma = (c: number): number => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);

/** The frame colour of a surface: a darker tone on a light fill, the theme's line colour on a dark one. */
function frameOf(fill: number): number {
  return luma(fill) > 110 ? shade(fill, 0.62) : C.line;
}

function outline(g: Graphics, o: BoxOpts): Graphics {
  if (o.framed && o.line === undefined) g.stroke({ width: COMIC.frame, color: frameOf(o.fill ?? C.panel), alignment: 0 });
  if (o.line !== undefined) g.stroke({ width: o.lineW ?? 1.5, color: o.line, alignment: 0 });
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

/**
 * Hand-inked shading on a surface (docs/theme.md): diagonal ink strokes over the lower part of the shape, in a darker
 * tone of the surface colour, like comic shading. `shape` draws the outline the strokes are cut to. Origin top-left.
 */
export function inkShade(w: number, h: number, fill: number, shape: (g: Graphics) => Graphics, share = 0.3): Container {
  const c = new Container();
  const g = new Graphics();
  const step = COMIC.hatchStep;
  const slant = HATCH.slant,
    tilt = HATCH.tilt;
  // the shading edge rises to the right, away from the light: a sliver on the left, share * (0.3 + tilt) of the
  // height on the right, with a little jitter for uneven pen ends
  const edge = (x: number) => h - share * h * (0.3 + tilt * (x / w)) + (((Math.round(x) * 37) % 9) - 4) * 0.6;
  // strokes x = k + slant * y, from the shading edge down to the bottom
  for (let k = -h * slant; k < w; k += step) {
    const yb = Math.min(h, (w - k) / slant);
    const ya = Math.max(0, -k / slant, edge(Math.min(w, Math.max(0, k + slant * h * (1 - share)))));
    if (yb - ya > 2) g.moveTo(k + slant * ya, ya).lineTo(k + slant * yb, yb);
  }
  // cross-hatching in the darkest strip at the bottom: x = k - slant * y
  const deep = (x: number) => h - share * h * 0.45 * tilt * (x / w);
  for (let k = 0; k < w + h * slant; k += step * 1.5) {
    const ya = Math.max(deep(Math.min(w, Math.max(0, k - slant * h))) + (((Math.round(k) * 53) % 7) - 3) * 0.7, (k - w) / slant),
      yb = Math.min(h, k / slant);
    if (yb - ya > 2) g.moveTo(k - slant * ya, ya).lineTo(k - slant * yb, yb);
  }
  const lum = luma(fill);
  g.stroke({ width: COMIC.hatchWidth, color: lum > 110 ? shade(fill, 0.72) : C.ink, alpha: lum > 110 ? 0.8 : 0.5, cap: "round" });
  const mask = shape(new Graphics()).fill(0xffffff);
  g.mask = mask;
  c.addChild(mask, g);
  return c;
}

/** Shrinks `face` a little around its centre while the finger is down (no vibration, docs/ux.md). */
export function pressable(btn: Container, face: Container): void {
  const x0 = face.x,
    y0 = face.y;
  const b = face.getLocalBounds(),
    cx = b.x + b.width / 2,
    cy = b.y + b.height / 2;
  const set = (k: number) => {
    face.scale.set(k);
    face.position.set(x0 + cx * (1 - k), y0 + cy * (1 - k));
  };
  btn.on("pointerdown", () => set(COMIC.press));
  for (const ev of ["pointerup", "pointerupoutside", "pointerleave", "pointercancel"] as const) btn.on(ev, () => set(1));
}

/**
 * A comic panel like a riveted ship plate: a frame, a thin inner line in `line`, rivets in the corners and hand-inked
 * shading low on the surface (docs/theme.md). `hatch` marks a big panel, which gets a smaller share of shading. Origin top-left.
 */
export function plate(w: number, h: number, o: { fill?: number; line?: number; radius?: number; rivets?: boolean; hatch?: boolean } = {}): Container {
  const c = new Container();
  const r = o.radius ?? 16,
    fill = o.fill ?? C.panel,
    line = o.line ?? C.line;
  c.addChild(box(w, h, { fill, radius: r, framed: true }));
  const inset = 5;
  c.addChild(
    at(new Graphics().roundRect(0, 0, w - inset * 2, h - inset * 2, Math.max(2, r - inset)).stroke({ width: 1.5, color: line, alpha: 0.75 }), inset, inset),
  );
  c.addChild(inkShade(w, h, fill, (g) => g.roundRect(3, 3, w - 6, h - 6, Math.max(2, r - 3)), o.hatch ? 0.16 : 0.28));
  if (o.rivets !== false) {
    const k = inset + 6;
    for (const [x, y] of [
      [k, k],
      [w - k, k],
      [k, h - k],
      [w - k, h - k],
    ] as const)
      c.addChild(
        at(disc(COMIC.rivet, { fill: line, framed: false }), x, y),
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
  const c = new Container({ label: name });
  const face = new Container();
  c.addChild(face);
  face.addChild(disc(r, { fill: o.fill ?? BUTTON.icon.fill, line: o.line ?? BUTTON.icon.line, lineW: 2, framed: true }));
  face.addChild(
    at(
      inkShade(r * 2, r * 2, o.fill ?? BUTTON.icon.fill, (g) => g.circle(r, r, r - 2)),
      -r,
      -r,
    ),
  );
  face.addChild(icon(name, o.iconSize ?? r * 0.9, o.tint ?? BUTTON.icon.ink));
  pressable(c, face);
  return tappable(c, onTap, new Rectangle(-r - 4, -r - 4, r * 2 + 8, r * 2 + 8));
}

/** The round "i" button; origin at its centre. */
export function infoButton(r: number, onTap: () => void, active = false): Container {
  const c = new Container();
  c.addChild(disc(r, { fill: active ? C.cyan : C.panel, line: C.cyan, lineW: 2, framed: true }));
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
  c.addChild(face);
  face.addChild(box(w, h, { fill: o.fill ?? BUTTON.primary.fill, radius: h / 2, framed: true }));
  face.addChild(inkShade(w, h, o.fill ?? BUTTON.primary.fill, (g) => g.roundRect(2, 2, w - 4, h - 4, h / 2 - 2)));
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
  c.addChild(
    box(w, h, { fill: C.panel, line, radius: h / 2, framed: true }),
    inkShade(w, h, C.panel, (g) => g.roundRect(2, 2, w - 4, h - 4, h / 2 - 2), 0.3),
  );
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
