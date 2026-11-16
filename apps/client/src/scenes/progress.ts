/**
 * Progress between runs, one popup with five tabs: hero levels, planet track, season pass, leagues, profile.
 * Symbols first; the "i" button explains them. Every number comes from the core and data/meta.json.
 * Rewards are placeholders (a symbol for the kind of cosmetic) until the cosmetics are designed.
 */
import { Container, Graphics, Rectangle } from "pixi.js";
import { equip, heroLevel, leagueOf, passLevel, seasonData, type Profile, type Reward } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, W } from "../theme";
import { icon } from "../icons";
import { at, box, dimmer, disc, heroBadge, infoButton, roundButton, tappable, txt } from "../ui";
import { keywordRow } from "./popup";
import { t, upper } from "../i18n";

export const TABS = [
  { id: "hero", icon: "xp" },
  { id: "planets", icon: "planet" },
  { id: "pass", icon: "pass" },
  { id: "leagues", icon: "league" },
  { id: "profile", icon: "hero" },
] as const;
export type Tab = (typeof TABS)[number]["id"];

/** symbols of the progress terms, in the order the legend explains them (data/glossary.json, group "meta") */
export const PROGRESS_ICONS = ["galaxy", "credits", "xp", "planet", "pass", "premium", "league", "patch", "skin"];

const KIND_ICON: Record<string, string> = { background: "planet", grid: "cell", skin: "skin", heroCosmetic: "skin", patch: "patch" };

/** A reward as a tile: its symbol, and the amount or the hero it belongs to. Origin top-left. */
export function rewardTile(game: Game, r: Reward, size: number, on = true): Container {
  const c = new Container();
  const col = on ? C.text : C.dim;
  c.addChild(box(size, size, { fill: C.bg, line: on ? C.cyan : C.line, lineW: 2, radius: 10 }));
  if ("credits" in r) {
    c.addChild(at(icon("credits", size * 0.42, col), size / 2, size * 0.36), at(txt(r.credits, size * 0.26, { color: col, anchor: [0.5, 0.5] }), size / 2, size * 0.76));
  } else if ("hero" in r) {
    c.addChild(at(heroBadge(game.data.heroes.get(r.hero)!.name, size * 0.36, on ? C.cyan : C.dim), size / 2, size / 2));
  } else {
    const cos = game.meta.cosmeticById.get(r.cosmetic);
    c.addChild(at(icon(KIND_ICON[cos?.kind ?? ""] ?? "skin", size * 0.5, col), size / 2, size / 2));
    if (cos?.hero) c.addChild(at(heroBadge(game.data.heroes.get(cos.hero)!.name, size * 0.17, on ? C.cyan : C.dim), size - size * 0.17, size * 0.17));
  }
  return c;
}

/** A thin bar; origin top-left. */
function bar(w: number, h: number, part: number, color: number = C.cyan): Container {
  const c = new Container();
  c.addChild(box(w, h, { fill: C.bg, line: C.line, radius: h / 2 }));
  if (part > 0) c.addChild(box(Math.max(h, w * Math.min(1, part)), h, { fill: color, radius: h / 2 }));
  return c;
}

/** One step of a track: a round marker with the step's number on the left, tiles on the right. */
function stepRow(label: string | number, reached: boolean, tiles: Container[], width: number, h = 66): Container {
  const c = new Container();
  c.addChild(at(disc(18, { fill: reached ? C.cyan : C.panel, line: reached ? C.cyan : C.line, lineW: 2 }), 22, h / 2));
  c.addChild(at(txt(label, 13, { color: reached ? C.cyanInk : C.dim, anchor: [0.5, 0.5] }), 22, h / 2));
  let x = 56;
  for (const tl of tiles) { c.addChild(at(tl, x, (h - tl.height) / 2)); x += tl.width + 10; }
  if (reached && tiles.length) c.addChild(at(icon("check", 18, C.cyan), width - 16, h / 2));
  return c;
}

function legend(game: Game): Scene {
  const root = new Container();
  root.addChild(dimmer(W, H, () => game.closeOverlay(), 0.85));
  const panel = new Container();
  let y = 16;
  for (const ic of PROGRESS_ICONS) {
    const kw = game.keywords.get(ic);
    if (!kw) continue;
    const k = keywordRow(kw, 298);
    panel.addChild(at(k.node, 16, y));
    y += k.h + 6;
  }
  const bg = box(330, y + 10, { fill: C.panel, line: C.cyan, lineW: 2, radius: 20 });
  bg.eventMode = "static";
  panel.addChildAt(bg, 0);
  const h = y + 10;
  root.addChild(at(panel, 30, Math.max(20, (H - h) / 2)));
  // taller than the screen: drag to scroll
  if (h > H - 40) {
    let grab: number | null = null;
    bg.on("pointerdown", (e) => { grab = root.toLocal(e.global).y - panel.y; });
    root.eventMode = "static";
    root.on("pointermove", (e) => { if (grab !== null) panel.y = Math.max(H - 20 - h, Math.min(20, root.toLocal(e.global).y - grab)); });
    root.on("pointerup", () => { grab = null; });
    root.on("pointerupoutside", () => { grab = null; });
    root.on("wheel", (e) => { panel.y = Math.max(H - 20 - h, Math.min(20, panel.y - e.deltaY)); });
  }
  return { root };
}

export function progressOverlay(game: Game, first: Tab = "hero", onClose?: () => void): Scene {
  const root = new Container();
  let tab: Tab = first;
  const top = 160, viewH = H - top - 16, LW = W - 40;
  let list = new Container(), minY = top;

  const render = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    const p = game.profile;
    root.addChild(dimmer(W, H, undefined, 0.96));
    const title = txt(upper(t(`ui.tab.${tab}`, { n: p.season.id })), 24, { spacing: 2 });
    root.addChild(at(title, 20, 30), at(infoButton(16, () => game.openOverlay(legend(game))), 20 + title.width + 24, 44));
    root.addChild(at(roundButton("close", 22, () => { game.closeOverlay(); onClose?.(); }, { iconSize: 18 }), W - 42, 44));
    // tabs
    TABS.forEach((tb, i) => {
      const on = tb.id === tab;
      root.addChild(at(roundButton(tb.icon, 24, () => { tab = tb.id; render(); }, { fill: on ? C.cyan : C.panel, line: on ? C.cyan : C.line, tint: on ? C.cyanInk : C.text, iconSize: 22 }), 47 + i * 74, 104));
    });

    list = new Container();
    let y = 0;
    const add = (node: Container, h: number) => { list.addChild(at(node, 0, y)); y += h; };
    if (tab === "hero") heroTab(game, p, add, LW);
    else if (tab === "planets") planetTab(game, p, add, LW);
    else if (tab === "pass") passTab(game, p, add, LW);
    else if (tab === "leagues") leagueTab(game, p, add, LW);
    else profileTab(game, p, add, LW, render);

    const clip = new Graphics().rect(0, top, W, viewH).fill(0xffffff);
    const holder = new Container();
    holder.addChild(list, clip);
    holder.mask = clip;
    list.position.set(20, top);
    root.addChild(holder);
    minY = Math.min(top, top + viewH - y);
  };

  let grab: number | null = null;
  root.eventMode = "static";
  root.hitArea = new Rectangle(0, 0, W, H);
  root.on("pointerdown", (e) => { grab = root.toLocal(e.global).y - list.y; });
  root.on("pointermove", (e) => { if (grab !== null) list.y = Math.max(minY, Math.min(top, root.toLocal(e.global).y - grab)); });
  root.on("pointerup", () => { grab = null; });
  root.on("pointerupoutside", () => { grab = null; });
  root.on("wheel", (e) => { list.y = Math.max(minY, Math.min(top, list.y - e.deltaY)); });
  render();
  return { root };
}

type Add = (node: Container, h: number) => void;

function heroTab(game: Game, p: Profile, add: Add, w: number): void {
  const meta = game.meta, hero = game.hero;
  const lv = heroLevel(meta, p.heroXp[hero] ?? 0);
  const head = new Container();
  head.addChild(at(heroBadge(game.data.heroes.get(hero)!.name, 30), 30, 34));
  head.addChild(at(txt(`${t("ui.level")} ${lv.level}`, 26), 76, 6));
  head.addChild(at(bar(w - 76, 12, lv.need ? lv.into / lv.need : 1), 76, 44));
  head.addChild(at(icon("xp", 16, C.dim), w - 8, 22), at(txt(lv.need ? `${lv.into} / ${lv.need}` : t("ui.max"), 12, { font: "text", color: C.dim, anchor: [1, 0.5] }), w - 22, 22));
  add(head, 84);
  for (let l = 2; l <= lv.max; l++) {
    const tiles = meta.heroLevels.cosmeticAt.includes(l) ? [rewardTile(game, { cosmetic: `${hero}_lv${l}` }, 56, l <= lv.level)] : [];
    add(stepRow(l, l <= lv.level, tiles, w, tiles.length ? 66 : 44), tiles.length ? 66 : 44);
  }
}

function planetTab(game: Game, p: Profile, add: Add, w: number): void {
  const head = new Container();
  head.addChild(at(icon("galaxy", 30, C.text), 22, 24), at(txt(p.galaxies, 26, { anchor: [0, 0.5] }), 46, 24));
  const next = game.meta.planetTrack.find((s) => s.galaxies > p.galaxies);
  if (next) head.addChild(at(bar(w, 12, p.galaxies / next.galaxies), 0, 56));
  add(head, 84);
  for (const s of game.meta.planetTrack) {
    const on = p.galaxies >= s.galaxies;
    const row = stepRow(s.galaxies, on, [rewardTile(game, s.reward, 56, on)], w);
    if ("cosmetic" in s.reward) row.addChild(at(txt(t(`cosmetic.${s.reward.cosmetic}`), 13, { font: "text", color: on ? C.text : C.dim, anchor: [0, 0.5] }), 124, 32));
    add(row, 66);
  }
}

function passTab(game: Game, p: Profile, add: Add, w: number): void {
  const season = seasonData(game.meta, p.season.id);
  const lv = passLevel(game.meta, p.season), per = season.pass.galaxiesPerLevel;
  const head = new Container();
  head.addChild(at(icon("galaxy", 30, C.text), 22, 24), at(txt(p.season.galaxies, 26, { anchor: [0, 0.5] }), 46, 24));
  head.addChild(at(txt(`${t("ui.level")} ${lv}`, 20, { anchor: [1, 0.5] }), w, 24));
  head.addChild(at(bar(w, 12, lv >= season.pass.levels.length ? 1 : (p.season.galaxies % per) / per), 0, 56));
  // column heads: free, premium (locked until bought; buying is not built)
  head.addChild(at(txt(t("ui.free"), 12, { color: C.dim, spacing: 2, anchor: [0.5, 0.5] }), 84, 92));
  const prem = new Container();
  prem.addChild(at(icon(p.season.premium ? "premium" : "lock", 16, C.gold), -38, 0), at(txt(t("ui.premium"), 12, { color: C.gold, spacing: 2, anchor: [0, 0.5] }), -26, 0));
  if (!p.season.premium) tappable(prem, () => game.toast(t("toast.premiumLater")), new Rectangle(-50, -14, 120, 28));
  head.addChild(at(prem, 160, 92));
  add(head, 112);
  season.pass.levels.forEach((l, i) => {
    const n = i + 1, on = n <= lv;
    const row = stepRow(n, on, [], w);
    if (l.free) row.addChild(at(rewardTile(game, l.free, 56, on), 56, 4));
    if (l.premium) {
      const tl = rewardTile(game, l.premium, 56, on && p.season.premium);
      if (!p.season.premium) tl.addChild(at(icon("lock", 16, C.gold), 50, 50));
      row.addChild(at(tl, 132, 4));
    }
    add(row, 66);
  });
}

function leagueTab(game: Game, p: Profile, add: Add, w: number): void {
  const L = game.meta.leagues, cur = leagueOf(game.meta, p.season.points);
  for (let i = L.ids.length - 1; i >= 0; i--) {
    const on = i === cur, reached = i <= p.season.peak;
    const row = new Container();
    row.addChild(box(w, 56, { fill: on ? C.panel : C.bg, line: on ? C.gold : C.line, lineW: on ? 2 : 1, radius: 14 }));
    row.addChild(at(icon("league", 26, reached ? C.gold : C.dim), 30, 28));
    row.addChild(at(txt(upper(t(`league.${L.ids[i]}`)), 16, { color: reached ? C.text : C.dim, anchor: [0, 0.5] }), 56, on ? 20 : 28));
    if (on) {
      const into = p.season.points - i * L.pointsPerLeague;
      row.addChild(at(bar(w - 140, 8, i === L.ids.length - 1 ? 1 : into / L.pointsPerLeague, C.gold), 56, 36));
      row.addChild(at(txt(into, 14, { anchor: [1, 0.5] }), w - 14, 28));
    }
    add(row, 64);
  }
}

function profileTab(game: Game, p: Profile, add: Add, w: number, rerender: () => void): void {
  const meta = game.meta;
  const set = (slot: "background" | "patch", id: string | null) => { const q = equip(meta, p, slot, id); if (q) { game.setProfile(q); rerender(); } };
  // the worn patch, league and totals
  const head = new Container();
  head.addChild(box(w, 96, { fill: C.panel, line: C.line, radius: 16 }));
  head.addChild(at(disc(32, { fill: C.bg, line: p.equipped.patch ? C.gold : C.line, lineW: 2 }), 48, 48), at(icon("patch", 30, p.equipped.patch ? C.gold : C.line), 48, 48));
  const stats: [string, number][] = [["swords", p.runs], ["galaxy", p.galaxies], ["credits", p.credits]];
  stats.forEach(([ic, n], i) => { const x = 110 + i * 78; head.addChild(at(icon(ic, 20, C.dim), x + 10, 34), at(txt(n, 18, { anchor: [0.5, 0.5] }), x + 10, 62)); });
  add(head, 112);

  add(at(txt(t("ui.patches"), 13, { color: C.gold, spacing: 2 }), 4, 0), 28);
  const patches = p.cosmetics.filter((c) => meta.cosmeticById.get(c)?.kind === "patch");
  if (!patches.length) add(at(txt(t("ui.noPatch"), 13, { font: "text", color: C.dim }), 4, 0), 36);
  else {
    const grid = new Container();
    patches.forEach((id, i) => {
      const on = p.equipped.patch === id;
      const c = meta.cosmeticById.get(id)!;
      const tl = rewardTile(game, { cosmetic: id }, 64, true);
      if (on) tl.addChild(at(icon("check", 18, C.cyan), 54, 54));
      tl.addChild(at(txt(t("ui.seasonShort", { n: c.season ?? 0 }), 10, { color: C.dim, anchor: [0, 0] }), 6, 4));
      tl.addChild(at(txt(upper(t(`league.${c.league}`)), 10, { font: "text", weight: "600", color: C.dim, anchor: [0.5, 0] }), 32, 70));
      tappable(tl, () => set("patch", on ? null : id), new Rectangle(0, 0, 64, 64));
      grid.addChild(at(tl, (i % 4) * 82, Math.floor(i / 4) * 96));
    });
    add(grid, Math.ceil(patches.length / 4) * 96 + 4);
  }

  add(at(txt(t("ui.backgrounds"), 13, { color: C.gold, spacing: 2 }), 4, 0), 28);
  for (const id of p.cosmetics.filter((c) => meta.cosmeticById.get(c)?.kind === "background")) {
    const on = p.equipped.background === id;
    const row = new Container();
    row.addChild(box(w, 52, { fill: C.panel, line: on ? C.cyan : C.line, lineW: on ? 2 : 1, radius: 14 }));
    row.addChild(at(icon("planet", 24, on ? C.cyan : C.dim), 28, 26), at(txt(t(`cosmetic.${id}`), 15, { font: "text", weight: "600", anchor: [0, 0.5] }), 54, 26));
    if (on) row.addChild(at(icon("check", 20, C.cyan), w - 24, 26));
    tappable(row, () => set("background", id), new Rectangle(0, 0, w, 52));
    add(row, 60);
  }
}
