/**
 * The Credits shop (docs/ux.md V7) and the purchase popup (P12). Structure only: what is on sale, prices and
 * paying are not decided yet (docs/retention.md), so every offer shows "?" as its price and BUY answers with a toast.
 * The list of offers is read from data/meta.json (cosmetics and season heroes the player does not own yet).
 */
import { Container, Graphics, Rectangle } from "pixi.js";
import { ownsHero, type Reward } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, W } from "../theme";
import { icon } from "../icons";
import { at, box, screenFill, dimmer, hudPill, pillButton, placeholder, roundButton, tappable, txt } from "../ui";
import { rewardTile } from "./progress";
import { t, upper } from "../i18n";

export const SECTIONS = ["offers", "skins", "heroes", "backgrounds", "credits"] as const;
export type Section = (typeof SECTIONS)[number];

/** One thing on sale. `pack` is a Credit pack (bought with real money); its size is still open. */
export type Offer = { key: string; reward: Reward } | { key: "premium"; premium: true } | { key: string; pack: number };

/** Everything the shop could sell right now, by section. */
export function offers(game: Game): Record<Section, Offer[]> {
  const meta = game.meta, p = game.profile;
  const notOwned = (kind: string) => meta.cosmetics.filter((c) => c.kind === kind && !p.cosmetics.includes(c.id)).map((c): Offer => ({ key: c.id, reward: { cosmetic: c.id } }));
  const skins = notOwned("skin");
  const heroes = meta.seasons.flatMap((s) => (s.hero && !ownsHero(meta, p, s.hero) ? [{ key: `hero_${s.hero}`, reward: { hero: s.hero } } as Offer] : []));
  const backgrounds = notOwned("grid");
  const packs: Offer[] = [1, 2, 3].map((n) => ({ key: `pack${n}`, pack: n }));
  const premium: Offer[] = p.season.premium ? [] : [{ key: "premium", premium: true }];
  // the shop window: a bit of everything (which offers run when is not decided yet)
  const window = [...premium, ...heroes.slice(0, 1), ...skins.slice(0, 2), ...backgrounds.slice(0, 1)].slice(0, 3);
  return { offers: window, skins, heroes, backgrounds, credits: packs };
}

/** An offer as a tile: its symbol and the price below. Origin top-left. */
export function offerTile(game: Game, o: Offer, size: number, onTap: () => void): Container {
  const c = new Container();
  if ("reward" in o) c.addChild(rewardTile(game, o.reward, size));
  else {
    c.addChild(box(size, size, { fill: C.bg, line: C.gold, lineW: 2, radius: 10 }));
    if ("premium" in o) c.addChild(at(icon("premium", size * 0.5, C.gold), size / 2, size / 2));
    else {
      c.addChild(at(icon("credits", size * 0.42, C.gold), size / 2, size * 0.4));
      c.addChild(at(txt("+".repeat(o.pack), size * 0.22, { color: C.gold, anchor: [0.5, 0.5] }), size / 2, size * 0.78));
    }
  }
  c.addChild(at(price(o, size * 0.24), size / 2, size + size * 0.2));
  return tappable(c, onTap, new Rectangle(0, 0, size, size * 1.36));
}

/** The price under an offer: Credits for game things, real money for packs and the premium pass; the amounts are open. */
function price(o: Offer, size: number): Container {
  const c = new Container();
  const money = !("reward" in o);
  const label = txt(t("ui.priceOpen"), size, { color: money ? C.text : C.gold, anchor: [0, 0.5] });
  if (money) { label.anchor.set(0.5, 0.5); c.addChild(label); return c; }
  const w = size + 4 + label.width;
  c.addChild(at(icon("credits", size, C.gold), -w / 2 + size / 2, 0), at(label, -w / 2 + size + 4, 0));
  return c;
}

/** P12: preview, price and BUY. Every purchase goes through here, for Credits and for real money alike. */
export function purchaseOverlay(game: Game, o: Offer): Scene {
  const root = new Container();
  root.addChild(dimmer(() => game.closeOverlay()));
  const pw = 310, ph = 400;
  const panel = new Container();
  const bg = box(pw, ph, { fill: C.panel, line: C.gold, lineW: 2, radius: 20 });
  bg.eventMode = "static";
  panel.addChild(bg);
  panel.addChild(at(roundButton("close", 18, () => game.closeOverlay(), { iconSize: 16 }), pw - 30, 30));
  // preview: the real look once there is art; for now the offer's symbol, large
  panel.addChild(at(placeholder(200, 200, "", 20), (pw - 200) / 2, 56));
  const big = offerTile(game, o, 120, () => undefined);
  big.eventMode = "none";
  big.removeChildAt(big.children.length - 1);
  panel.addChild(at(big, (pw - 120) / 2, 96));
  panel.addChild(at(txt(t("ui.preview"), 11, { font: "text", color: C.dim, anchor: [0.5, 0.5] }), pw / 2, 238));
  panel.addChild(at(price(o, 22), pw / 2, 284));
  panel.addChild(at(pillButton(t("ui.buy"), pw - 60, 60, () => game.toast(t("toast.purchaseLater"))), 30, ph - 86));
  root.addChild(at(panel, (W - pw) / 2, (H - ph) / 2));
  return { root };
}

/** V7: the Credits shop. `focus` scrolls to a section (the hero choice opens it at the heroes). */
export function storeScene(game: Game, back: () => Scene, focus: Section = "offers"): Scene {
  const root = new Container();
  const all = offers(game);
  const top = 96, viewH = H - top - 10, size = 96, perRow = 3, gap = (W - 40 - perRow * size) / (perRow - 1);
  const list = new Container();
  let y = 0;
  const marks: Partial<Record<Section, number>> = {};
  for (const s of SECTIONS) {
    marks[s] = y;
    list.addChild(at(txt(t(`ui.store.${s}`), 13, { color: C.gold, spacing: 2 }), 0, y));
    y += 28;
    const items = all[s];
    if (!items.length) {
      list.addChild(at(placeholder(W - 40, 64, t("ui.store.empty"), 14), 0, y));
      y += 80;
      continue;
    }
    items.forEach((o, i) => {
      list.addChild(at(offerTile(game, o, size, () => game.openOverlay(purchaseOverlay(game, o))), (i % perRow) * (size + gap), y + Math.floor(i / perRow) * (size * 1.4 + 12)));
    });
    y += Math.ceil(items.length / perRow) * (size * 1.4 + 12) + 8;
  }

  root.addChild(screenFill(C.bg));
  const clip = new Graphics().rect(0, top, W, viewH).fill(0xffffff);
  const holder = new Container();
  holder.addChild(list, clip);
  holder.mask = clip;
  const minY = Math.min(top, top + viewH - y);
  list.position.set(20, Math.max(minY, top - (marks[focus] ?? 0)));
  root.addChild(holder);

  // header over the list
  root.addChild(at(roundButton("back", 22, () => game.show(back()), { iconSize: 20 }), 36, 36));
  root.addChild(at(txt(upper(t("ui.shop")), 24, { spacing: 2, anchor: [0, 0.5] }), 72, 36));
  const cr = hudPill("credits", game.profile.credits, C.line, C.gold, 40);
  root.addChild(at(cr, W - 14 - cr.width, 16));

  let grab: number | null = null;
  root.eventMode = "static";
  root.hitArea = new Rectangle(0, 0, W, H);
  root.on("pointerdown", (e) => { grab = root.toLocal(e.global).y - list.y; });
  root.on("pointermove", (e) => { if (grab !== null) list.y = Math.max(minY, Math.min(top, root.toLocal(e.global).y - grab)); });
  root.on("pointerup", () => { grab = null; });
  root.on("pointerupoutside", () => { grab = null; });
  root.on("wheel", (e) => { list.y = Math.max(minY, Math.min(top, list.y - e.deltaY)); });
  return { root };
}
