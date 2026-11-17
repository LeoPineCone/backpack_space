/**
 * The equipped menu background over the whole screen: star field, the background's planet turning slowly, a few
 * twinkling stars, and dark bands at the top and bottom so the buttons stay readable. Without pictures it falls
 * back to the plain placeholder.
 */
import { Container, Graphics, Sprite } from "pixi.js";
import type { Game } from "./game";
import { artTexture } from "./art";
import { planetView, type PlanetView } from "./planet";
import { C, H, SCREEN, W } from "./theme";
import { at, box } from "./ui";

export interface Backdrop { view: Container; hasArt: boolean; update(dt: number): void }

/** Small star cross; origin at its centre. */
function star(size: number, color: number): Graphics {
  return new Graphics().moveTo(-size, 0).lineTo(size, 0).moveTo(0, -size).lineTo(0, size).stroke({ width: Math.max(1, size / 3), color, cap: "round" });
}

/** Dark band that fades out: stacked strips (a flat, stepped fade suits the ink look). `down`: dark at the top. */
function fade(h: number, w: number, down: boolean): Container {
  const c = new Container(), steps = 10;
  for (let i = 0; i < steps; i++) {
    const a = 0.7 * (1 - i / steps);
    c.addChild(at(box(w, h / steps + 1, { fill: C.bgDeep, alpha: a }), 0, down ? (i * h) / steps : h - ((i + 1) * h) / steps));
  }
  return c;
}

export function backdrop(game: Game, layout: { x: number; y: number; r: number } = { x: W * 0.58, y: H * 0.5, r: 255 }): Backdrop {
  const view = new Container();
  const bg = game.meta.cosmeticById.get(game.profile.equipped.background);
  const sky = artTexture("space");
  const surface = bg?.planet ? artTexture(`planets/${bg.planet}`) : null;
  if (!sky && !surface) {
    view.addChild(at(box(SCREEN.w, SCREEN.h, { fill: C.backdrop }), SCREEN.x, SCREEN.y));
    return { view, hasArt: false, update: () => undefined };
  }
  // the whole display, behind the status bar and the home indicator too
  const { x: sx, y: sy, w: sw, h: sh } = SCREEN;
  view.addChild(at(box(sw, sh, { fill: C.bgDeep }), sx, sy));
  if (sky) {
    // cover the display, centred
    const s = new Sprite(sky), k = Math.max(sw / sky.width, sh / sky.height);
    s.scale.set(k);
    s.position.set(sx + (sw - sky.width * k) / 2, sy + (sh - sky.height * k) / 2);
    view.addChild(s);
  }
  // a few stars that twinkle; fixed places, so the picture is the same every time
  const twinkles: { g: Graphics; speed: number; phase: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const g = at(star(1.5 + rnd() * 2.5, rnd() < 0.3 ? C.gold : C.text), sx + rnd() * sw, sy + rnd() * sh);
    twinkles.push({ g, speed: 0.6 + rnd() * 1.2, phase: rnd() * Math.PI * 2 });
    view.addChild(g);
  }
  let planet: PlanetView | null = null;
  if (surface) {
    planet = planetView(surface, layout.r);
    view.addChild(at(planet.view, layout.x, layout.y));
  }
  view.addChild(at(fade(190 - sy, sw, true), sx, sy), at(fade(230 + (sy + sh - H), sw, false), sx, H - 230));
  let time = 0;
  return {
    view,
    hasArt: true,
    update(dt) {
      time += dt;
      planet?.update(dt);
      for (const t of twinkles) t.g.alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * t.speed + t.phase));
    },
  };
}
