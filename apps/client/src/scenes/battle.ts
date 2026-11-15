/** The fight: computed once by the core, then played back. Enemy on top, your backpack below, the ageing star between. */
import { Container, Graphics, Rectangle, type Text } from "pixi.js";
import { BUFFS, DEBUFFS, Replay, buildOf, compile, simulate, type BattleEvent, type Build, type CSide, type Status } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { GHOSTS } from "../data";
import { C, W } from "../theme";
import { icon } from "../icons";
import { at, box, disc, tappable, txt } from "../ui";
import { piece } from "../pieces";
import { resultScene } from "./results";
import { t, tr, upper } from "../i18n";

const CELL = 34, BX = 42;
const STATUSES: Status[] = [...BUFFS, ...DEBUFFS];

/** A stored bot build of this round (or the nearest round that has one). */
function pickGhost(game: Game, player: Build): Build {
  const order: number[] = [];
  for (let r = player.round - 1; r >= 0; r--) order.push(r);
  for (let r = player.round; r < GHOSTS.length; r++) order.push(r);
  for (const r of order) {
    const pool = [...(GHOSTS[r] ?? [])];
    while (pool.length) {
      const g = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
      try { compile(g, game.data); return g; } catch { /* stale ghost: the data changed since it was stored */ }
    }
  }
  return { ...player };
}

interface SideView { hpFill: Graphics; hpText: Text; chips: Container; chipKey: string; flashes: Graphics[]; barY: number }

export function battleScene(game: Game): Scene {
  const root = new Container();
  const data = game.data, rules = data.rules, B = rules.battle;
  const player = buildOf(game.run!);
  const ghost = pickGhost(game, player);
  const sides: [CSide, CSide] = [compile(player, data), compile(ghost, data)];
  const result = simulate(sides[0], sides[1], rules, (Math.random() * 0x7fffffff) | 0, { log: true });
  const replay = new Replay(sides, result, rules);
  let speed = 1, endWait = 0.9, left = false;

  root.addChild(box(W, 844, { fill: C.bg }));
  const fx = new Container();

  // side 1 (enemy) on top, side 0 (you) below
  const gridY = [384, 82], barY = [634, 14];
  const builds = [player, ghost];
  const views: SideView[] = [0, 1].map((i) => {
    const b = builds[i]!, hero = sides[i]!.hero;
    const bar = new Container();
    bar.addChild(at(disc(28, { fill: C.panel, line: i === 0 ? C.cyan : C.dim, lineW: 2 }), 28, 28), at(txt(hero.name.replace(/[^A-Za-z]/g, "")[0]!.toUpperCase(), 22, { anchor: [0.5, 0.5] }), 28, 28));
    bar.addChild(at(box(250, 22, { fill: C.panel, line: C.dim, radius: 11 }), 66, 6));
    const hpFill = new Graphics();
    const hpText = txt("", 15, { anchor: [0, 0.5] });
    const chips = new Container();
    bar.addChild(at(hpFill, 66, 6), at(hpText, 324, 17), at(chips, 66, 34));
    root.addChild(at(bar, 15, barY[i]!));
    // the backpack
    const g = new Graphics();
    for (let y = 0; y < rules.grid.h; y++) for (let x = 0; x < rules.grid.w; x++) g.rect(BX + x * CELL + 0.5, gridY[i]! + y * CELL + 0.5, CELL - 1, CELL - 1);
    g.stroke({ width: 1, color: C.gridLine });
    root.addChild(g);
    for (const p of b.bags) root.addChild(at(piece(data, p.item, p.rot, CELL, { label: false }), BX + p.x * CELL, gridY[i]! + p.y * CELL));
    const flashes = b.items.map((p) => {
      root.addChild(at(piece(data, p.item, p.rot, CELL), BX + p.x * CELL, gridY[i]! + p.y * CELL));
      const f = new Graphics();
      for (const [cx, cy] of data.shape(p.item, p.rot).cells) f.rect(cx * CELL + 2, cy * CELL + 2, CELL - 4, CELL - 4);
      f.fill(0xffffff);
      f.alpha = 0;
      root.addChild(at(f, BX + p.x * CELL, gridY[i]! + p.y * CELL));
      return f;
    });
    return { hpFill, hpText, chips, chipKey: "?", flashes, barY: barY[i]! };
  });

  // the star clock
  const novaAt = B.phases.reduce((a, p) => a + p.seconds, 0);
  const phaseStart = B.phases.map((_, i) => B.phases.slice(0, i).reduce((a, p) => a + p.seconds, 0));
  const sizes = [5, 7, 9, 11, 15];
  const clock = new Graphics();
  const phaseLabel = txt("", 11, { color: C.dim, spacing: 1.5, anchor: [0.5, 0] });
  const lineL = new Graphics().rect(15, 345, 90, 2).fill(C.line), lineR = new Graphics().rect(W - 105, 345, 90, 2).fill(C.line);
  root.addChild(lineL, lineR, clock, at(phaseLabel, W / 2, 364));
  const drawClock = () => {
    clock.clear();
    let x = W / 2 - 62;
    sizes.forEach((r, i) => {
      const nova = i === sizes.length - 1, col = nova ? C.bad : C.gold;
      const cx = x + r;
      const p = i < replay.phaseIdx ? 1 : i > replay.phaseIdx ? 0 : nova ? 1 : Math.max(0, Math.min(1, (replay.time - phaseStart[i]!) / B.phases[i]!.seconds));
      if (p > 0) clock.circle(cx, 346, r * (0.35 + 0.65 * p)).fill({ color: col, alpha: 0.35 + 0.65 * p });
      clock.circle(cx, 346, r).stroke({ width: 2, color: col });
      x += r * 2 + 8;
    });
    phaseLabel.text = upper(tr().term(replay.phaseIdx >= B.phases.length ? B.supernova.id : B.phases[replay.phaseIdx]?.id ?? ""));
    phaseLabel.style.fill = replay.time > novaAt ? C.bad : C.dim;
  };

  // speed
  const speedBtns = [1, 2, 4].map((v, i) => {
    const b = new Container();
    const paint = () => {
      b.removeChildren().forEach((c) => c.destroy());
      b.addChild(box(52, 44, { fill: speed === v ? C.cyan : C.bg, line: speed === v ? C.cyan : C.line, lineW: 2, radius: 22 }), at(txt(`×${v}`, 16, { color: speed === v ? C.cyanInk : C.text, anchor: [0.5, 0.5] }), 26, 22));
    };
    paint();
    tappable(b, () => { speed = v; speedBtns.forEach((s) => s.paint()); }, new Rectangle(0, 0, 52, 44));
    root.addChild(at(b, W - 15 - (3 - i) * 60 + 8, 786));
    return { paint };
  });
  root.addChild(at(txt(t("ui.round", { n: player.round }), 13, { color: C.dim, spacing: 2 }), 15, 800));
  root.addChild(fx);

  const paint = () => {
    for (const i of [0, 1] as const) {
      const v = views[i]!, s = replay.sides[i], max = result.maxHp[i], hp = Math.max(0, Math.round(s.hp));
      v.hpFill.clear().roundRect(2, 2, Math.max(0, (250 - 4) * Math.min(1, hp / max)), 18, 9).fill(i === 0 ? C.text : C.dim);
      const label = String(hp);
      if (v.hpText.text !== label) v.hpText.text = label;
      const key = STATUSES.map((k) => s.st[k]).join(",");
      if (key !== v.chipKey) {
        v.chipKey = key;
        v.chips.removeChildren().forEach((c) => c.destroy({ children: true }));
        let x = 0;
        for (const k of STATUSES) {
          if (s.st[k] <= 0) continue;
          const buff = (BUFFS as readonly string[]).includes(k);
          const n = txt(s.st[k], 13, { color: buff ? C.bg : C.text, anchor: [0, 0.5] });
          const w = 4 + 15 + 3 + n.width + 6;
          v.chips.addChild(at(box(w, 24, { fill: buff ? C.text : C.bg, line: C.text, radius: 7 }), x, 0), at(icon(k, 15, buff ? C.bg : C.text), x + 11.5, 12), at(n, x + 22, 12));
          x += w + 5;
        }
      }
    }
    drawClock();
  };

  const float = (side: number, text: string, color: number) => {
    if (fx.children.length > 40) return;
    const t = txt(text, 20, { color, anchor: [0.5, 0.5] });
    t.position.set(100 + Math.random() * 210, views[side]!.barY + 17);
    (t as Text & { life: number }).life = 0.9;
    fx.addChild(t);
  };
  const show = (e: BattleEvent) => {
    const foe = 1 - e.s;
    switch (e.k) {
      case "attack": flash(e.s, e.i, 0xffffff); if (e.v > 0) float(foe, `-${e.v}${e.crit ? "!" : ""}`, e.crit ? C.gold : C.bad); break;
      case "use": flash(e.s, e.i, 0xffffff); break;
      case "miss": flash(e.s, e.i, C.bad); break;
      case "damage": case "tick": if (e.v > 0) float(foe, `-${e.v}`, C.bad); break;
      case "nova": if (e.v > 0) float(e.s, `-${e.v}`, C.bad); break;
      case "heal": if (e.v > 0) float(e.s, `+${e.v}`, C.good); break;
      default: break;
    }
  };
  const flash = (side: number, i: number, tint: number) => { const f = views[side]!.flashes[i]; if (f) { f.tint = tint; f.alpha = 0.75; } };

  for (const e of replay.start()) show(e);
  paint();

  return {
    root,
    update(dt) {
      if (left) return;
      if (!replay.done) for (const e of replay.advance(dt * speed)) show(e);
      for (const v of views) for (const f of v.flashes) if (f.alpha > 0) f.alpha = Math.max(0, f.alpha - dt * speed * 3.5);
      for (const c of [...fx.children]) {
        const t = c as Text & { life: number };
        t.life -= dt;
        t.y -= dt * 34;
        t.alpha = Math.max(0, Math.min(1, t.life / 0.4));
        if (t.life <= 0) { fx.removeChild(t); t.destroy(); }
      }
      paint();
      if (replay.done) {
        endWait -= dt;
        if (endWait <= 0) { left = true; game.show(resultScene(game, { result, sides, player })); }
      }
    },
  };
}
