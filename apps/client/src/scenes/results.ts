/** After a fight: the result of the round, and at the end of a run the summary with its reward. */
import { Container, Graphics } from "pixi.js";
import { finishRound, heroLevel, newRun, type BattleResult, type Build, type CSide, type RunBooking } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, W } from "../theme";
import { icon } from "../icons";
import { at, box, dimmer, disc, heroBadge, hearts, pillButton, roundButton, screenFill, txt } from "../ui";
import { piece, pieceFit, starMarks } from "../pieces";
import { itemPopup } from "./popup";
import { shopScene } from "./shop";
import { homeScene } from "./home";
import { rewardTile } from "./progress";
import { t, tr, upper } from "../i18n";

const SOURCES = ["weapon", "direct", "burn", "toxin", "spikes"] as const;
const SOURCE_ICON: Record<string, string> = { weapon: "weapon", direct: "damage", burn: "burn", toxin: "toxin", spikes: "spikes" };

export interface Fought { result: BattleResult; sides: [CSide, CSide]; player: Build }

/** Damage by source for both sides, behind the chart button. */
function details(game: Game, f: Fought): Scene {
  const root = new Container();
  root.addChild(dimmer(() => game.closeOverlay()));
  const st = f.result.stats;
  const rows: { ic: string; a: number; b: number }[] = [
    ...SOURCES.map((k) => ({ ic: SOURCE_ICON[k]!, a: st[0][k], b: st[1][k] })),
    { ic: "phase", a: st[1].nova, b: st[0].nova },
    { ic: "heal", a: st[0].healed, b: st[1].healed },
    { ic: "shield", a: st[0].shielded, b: st[1].shielded },
  ];
  const h = 76 + rows.length * 40 + 16;
  const panel = new Container();
  const bg = box(330, h, { fill: C.panel, line: C.cyan, lineW: 2, radius: 20 });
  bg.eventMode = "static";
  panel.addChild(bg);
  panel.addChild(at(disc(18, { fill: C.bg, line: C.cyan, lineW: 2 }), 76, 38), at(txt(f.sides[0].hero.name.replace(/[^A-Za-z]/g, "")[0]!.toUpperCase(), 15, { anchor: [0.5, 0.5] }), 76, 38));
  panel.addChild(at(disc(18, { fill: C.bg, line: C.dim, lineW: 2 }), 254, 38), at(txt(f.sides[1].hero.name.replace(/[^A-Za-z]/g, "")[0]!.toUpperCase(), 15, { anchor: [0.5, 0.5] }), 254, 38));
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  rows.forEach((r, i) => {
    const y = 76 + i * 40;
    panel.addChild(at(disc(15, { fill: C.bg, line: C.line }), 165, y + 15), at(icon(r.ic, 16, C.text), 165, y + 15));
    const wa = (r.a / max) * 86, wb = (r.b / max) * 86;
    panel.addChild(new Graphics().roundRect(142 - wa, y + 8, wa, 14, 4).fill(C.text), new Graphics().roundRect(188, y + 8, wb, 14, 4).fill(C.dim));
    panel.addChild(at(txt(Math.round(r.a), 14, { anchor: [0, 0.5] }), 16, y + 15), at(txt(Math.round(r.b), 14, { color: C.dim, anchor: [1, 0.5] }), 314, y + 15));
  });
  root.addChild(at(panel, 30, (H - h) / 2));
  return { root };
}

export function resultScene(game: Game, f: Fought): Scene {
  const root = new Container();
  const data = game.data, run = game.run!, st = f.result.stats;
  const won = f.result.winner === 0;
  const livesAfter = run.lives - (won ? 0 : 1);
  const col = won ? C.gold : C.dim;

  root.addChild(screenFill(C.bg));
  root.addChild(at(new Graphics().circle(0, 0, 160).fill(C.backdrop).stroke({ width: 1.5, color: col }), W / 2, -30));
  root.addChild(at(txt(t("ui.round", { n: run.round }), 14, { color: C.dim, spacing: 3, anchor: [0.5, 0] }), W / 2, 62));
  root.addChild(at(txt(t(won ? "ui.victory" : "ui.defeat"), 52, { color: col, spacing: 3, anchor: [0.5, 0] }), W / 2, 82));
  const hs = hearts(livesAfter, data.rules.lives, 34, 8);
  root.addChild(at(hs, (W - hs.width) / 2, 166));

  const last = livesAfter <= 0 || run.round >= data.rules.rounds;
  if (!last) {
    const income = data.rules.goldPerRound[run.round] ?? 0;
    const pill = new Container();
    const label = txt(`+${income}`, 22, { anchor: [0, 0.5] });
    const pw = 20 + label.width + 8 + 22 + 20;
    pill.addChild(box(pw, 48, { fill: C.panel, line: C.gold, radius: 24 }), at(label, 20, 24), at(icon("coin", 22, C.gold), 20 + label.width + 8 + 11, 24));
    root.addChild(at(pill, (W - pw) / 2, 222));
  }

  const dealt = SOURCES.reduce((a, k) => a + st[0][k], 0), taken = SOURCES.reduce((a, k) => a + st[1][k], 0) + st[0].nova;
  [["weapon", dealt], ["strip", taken], ["heal", st[0].healed]].forEach(([ic, n], i) => {
    const x = 20 + i * 120;
    root.addChild(at(box(110, 84, { fill: C.panel, line: C.line, radius: 16 }), x, 292), at(icon(ic as string, 26, C.dim), x + 55, 318), at(txt(Math.round(n as number), 24, { anchor: [0.5, 0.5] }), x + 55, 352));
  });

  // the three items that did the most
  const best = f.player.items.map((p, i) => ({ id: p.item, dmg: st[0].itemDamage[i] ?? 0, uses: st[0].uses[i] ?? 0 })).sort((a, b) => b.dmg - a.dmg || b.uses - a.uses).slice(0, 3);
  const order = best.length === 3 ? [best[1]!, best[0]!, best[2]!] : best;
  let x = (W - order.reduce((a, b) => a + (b === best[0] ? 72 : 56) + 14, -14)) / 2;
  for (const b of order) {
    const top = b === best[0], size = top ? 72 : 56;
    const y = 410 + (72 - size);
    root.addChild(at(box(size, size, { fill: C.panel, line: top ? C.gold : C.dim, lineW: 2, radius: 10 }), x, y), at(pieceFit(data, b.id, size - 10, size - 10, 26, { label: size > 60 }), x + 5, y + 5));
    root.addChild(at(txt(Math.round(b.dmg > 0 ? b.dmg : b.uses), 16, { color: top ? C.gold : C.dim, anchor: [0.5, 0] }), x + size / 2, 488));
    x += size + 14;
  }

  root.addChild(at(roundButton("chart", 32, () => game.openOverlay(details(game, f)), { iconSize: 26 }), 52, H - 52));
  root.addChild(at(pillButton(t("ui.continue"), W - 116, 64, () => {
    finishRound(run, data, won, game.rng);
    // the stored run ends before the reward is booked, so a reload cannot book it twice
    if (run.over) { game.dropSave(); game.show(runEndScene(game, game.bookRun(run))); }
    else {
      game.show(shopScene(game));
      // what merged after this fight is shown once
      if (run.merged.length) {
        game.openOverlay(itemPopup(game, run.merged[0]!.out, { action: { label: t("ui.continue"), onTap: () => game.closeOverlay() } }));
        game.toast(t("toast.merged", { items: tr().list(run.merged.map((m) => tr().item(m.out))) }));
      }
    }
  }), 96, H - 84));
  return { root };
}

export function runEndScene(game: Game, b: RunBooking): Scene {
  const root = new Container();
  const data = game.data, run = game.run!;
  root.addChild(screenFill(C.bg));
  root.addChild(at(disc(55, { fill: C.panel, line: C.gold, lineW: 3 }), W / 2, 95), at(txt(run.wins, 48, { color: C.gold, anchor: [0.5, 0.5] }), W / 2, 86), at(txt(t("ui.wins"), 12, { color: C.dim, spacing: 2, anchor: [0.5, 0.5] }), W / 2, 122));

  const pips = new Graphics();
  const n = data.rules.rounds, x0 = (W - (n * 20 + (n - 1) * 5)) / 2;
  for (let i = 0; i < n; i++) {
    const res = run.results[i];
    pips.circle(x0 + i * 25 + 10, 180, 9);
    if (res === true) pips.fill(C.gold); else pips.stroke({ width: 2, color: res === false ? C.dim : C.gridLine });
  }
  root.addChild(pips);

  // Galaxies: wins + lives left
  const lives = Math.max(0, run.lives);
  const sum = new Container();
  const a = txt(run.wins, 18, { color: C.dim, anchor: [0, 0.5] });
  const bl = txt(`+  ${lives}`, 18, { color: C.dim, anchor: [0, 0.5] });
  sum.addChild(at(a, 0, 28), at(icon("swords", 18, C.dim), a.width + 14, 28), at(bl, a.width + 32, 28), at(icon("heart", 18, C.dim), a.width + 32 + bl.width + 14, 28));
  const sw = a.width + 32 + bl.width + 26;
  const total = txt(`+${b.galaxies}`, 28, { anchor: [0, 0.5] });
  const pw = 22 + total.width + 8 + 24 + 22;
  sum.addChild(at(box(pw, 56, { fill: C.panel, line: C.cyan, lineW: 2, radius: 28 }), sw + 14, 0), at(total, sw + 36, 28), at(icon("galaxy", 24, C.text), sw + 36 + total.width + 20, 28));
  root.addChild(at(sum, (W - (sw + 14 + pw)) / 2, 216));

  // the final backpack
  // the rows below are anchored to the bottom of the safe area; the backpack shrinks a little on short screens
  const rowsY = H - 236;
  const gy = 290, cell = Math.min(36, Math.floor((rowsY - 10 - gy) / data.rules.grid.h)), gx = (W - data.rules.grid.w * cell) / 2;
  const g = new Graphics();
  for (let y = 0; y < data.rules.grid.h; y++) for (let x = 0; x < data.rules.grid.w; x++) g.rect(gx + x * cell + 0.5, gy + y * cell + 0.5, cell - 1, cell - 1);
  g.stroke({ width: 1, color: C.gridLine });
  root.addChild(g);
  for (const p of run.bags) root.addChild(at(piece(data, p.item, p.rot, cell, { label: false }), gx + p.x * cell, gy + p.y * cell));
  for (const p of run.items) root.addChild(at(piece(data, p.item, p.rot, cell), gx + p.x * cell, gy + p.y * cell));
  root.addChild(at(starMarks(data, run.bags, run.items, cell), gx, gy));

  // hero XP and level, league points, what was unlocked
  const meta = game.meta, p = game.profile;
  const lv = heroLevel(meta, p.heroXp[run.hero] ?? 0);
  const xpRow = new Container();
  xpRow.addChild(at(heroBadge(data.heroes.get(run.hero)!.name, 18), 18, 18));
  xpRow.addChild(at(txt(b.level[1] > b.level[0] ? `${t("ui.level")} ${b.level[0]} → ${b.level[1]}` : `${t("ui.level")} ${b.level[1]}`, 15, { color: b.level[1] > b.level[0] ? C.gold : C.text, anchor: [0, 0.5] }), 46, 18));
  xpRow.addChild(at(box(110, 8, { fill: C.bg, line: C.line, radius: 4 }), 150, 14), at(box(Math.max(8, 110 * (lv.need ? lv.into / lv.need : 1)), 8, { fill: C.cyan, radius: 4 }), 150, 14));
  xpRow.addChild(at(txt(`+${b.xp}`, 15, { anchor: [0, 0.5] }), 272, 18), at(icon("xp", 16, C.dim), 334, 18));
  root.addChild(at(xpRow, 20, rowsY));
  const lgRow = new Container();
  lgRow.addChild(at(icon("league", 26, C.gold), 18, 18), at(txt(upper(t(`league.${meta.leagues.ids[b.league[1]]}`)), 15, { color: b.league[1] > b.league[0] ? C.gold : C.text, anchor: [0, 0.5] }), 46, 18));
  lgRow.addChild(at(txt(b.points > 0 ? `+${b.points}` : `${b.points}`, 16, { color: b.points > 0 ? C.good : b.points < 0 ? C.bad : C.dim, anchor: [1, 0.5] }), 350, 18));
  root.addChild(at(lgRow, 20, rowsY + 42));
  const shown = b.rewards.slice(0, 6);
  shown.forEach((r, i) => root.addChild(at(rewardTile(game, r, 48), (W - (shown.length * 58 - 10)) / 2 + i * 58, rowsY + 88)));

  root.addChild(at(roundButton("share", 32, () => game.toast(t("toast.shareLater")), { iconSize: 26 }), 52, H - 52));
  root.addChild(at(pillButton(t("ui.newRun"), W - 192, 64, () => { game.newSeed(); game.run = newRun(data, run.hero, game.rng); game.show(shopScene(game)); }), 96, H - 84));
  root.addChild(at(roundButton("home", 32, () => { game.run = null; game.dropSave(); game.show(homeScene(game)); }, { iconSize: 26 }), W - 52, H - 52));
  return { root };
}
