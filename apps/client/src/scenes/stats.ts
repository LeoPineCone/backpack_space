/** The running numbers of the backpack in the shop. The core estimates them (buildStats); this screen only shows them. */
import { Container } from "pixi.js";
import { DEBUFFS, buildOf, buildStats, compile } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, W } from "../theme";
import { icon } from "../icons";
import { at, box, dimmer, roundButton, txt } from "../ui";
import { t, tr } from "../i18n";

/** one decimal below 10, whole numbers above */
export const fmt = (n: number) => tr().num(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

export function statsOverlay(game: Game): Scene {
  const root = new Container();
  const data = game.data;
  const s = buildStats(compile(buildOf(game.run!), data), data.rules);
  root.addChild(dimmer(W, H, () => game.closeOverlay(), 0.94));
  root.addChild(at(txt(t("ui.stats.title"), 26, { spacing: 2 }), 20, 28));
  root.addChild(at(roundButton("close", 22, () => game.closeOverlay(), { iconSize: 18 }), W - 42, 44));

  const short = s.energy.need > s.energy.income + 1e-9;
  const rows: { icon: string; label: string; value: string; color?: number; tint?: number; gap?: boolean }[] = [
    { icon: "maxHp", label: t("ui.stats.health"), value: String(s.maxHp), tint: C.good },
    { icon: "energy", label: t("ui.stats.energyNeed"), value: fmt(s.energy.need), color: short ? C.bad : C.text, tint: C.gold, gap: true },
    { icon: "energyRegen", label: t("ui.stats.energyIncome", { refill: fmt(s.energy.refill), items: fmt(s.energy.fromItems) }), value: fmt(s.energy.income), tint: C.gold },
    { icon: "clock", label: t("ui.stats.wait"), value: `${Math.round(s.energy.wait * 100)} %`, color: s.energy.wait > 0 ? C.bad : C.text },
    { icon: "weapon", label: t("ui.stats.weaponDps"), value: fmt(s.dps.weapons), gap: true },
    ...(s.dps.direct > 0 ? [{ icon: "damage", label: t("ui.stats.directDps"), value: fmt(s.dps.direct) }] : []),
    ...DEBUFFS.filter((d) => (s.inflict[d] ?? 0) > 0).map((d) => ({ icon: d, label: t("ui.stats.inflict", { status: tr().term(d) }), value: fmt(s.inflict[d]!) })),
    { icon: "heal", label: t("ui.stats.heal"), value: fmt(s.healPerSec), gap: true },
    { icon: "shield", label: t("ui.stats.shieldStart"), value: fmt(s.shieldStart) },
    { icon: "shield", label: t("ui.stats.shieldPerSec"), value: fmt(s.shieldPerSec) },
    { icon: "melee", label: tr().term("melee"), value: String(s.melee), gap: true },
    { icon: "ranged", label: tr().term("ranged"), value: String(s.ranged) },
  ];
  const list = new Container();
  let y = 0;
  const RW = W - 40;
  for (const r of rows) {
    if (r.gap) y += 10;
    const label = txt(r.label, 13, { font: "text", color: C.dim, wrap: RW - 120, lineHeight: 16 });
    const h = Math.max(40, label.height + 16);
    list.addChild(at(box(RW, h, { fill: C.panel, radius: 12 }), 0, y));
    list.addChild(at(icon(r.icon, 20, r.tint ?? C.text), 24, y + h / 2), at(label, 46, y + (h - label.height) / 2));
    list.addChild(at(txt(r.value, 18, { color: r.color ?? C.text, anchor: [1, 0.5] }), RW - 14, y + h / 2));
    y += h + 6;
  }
  const note = txt(t("ui.stats.note"), 12, { font: "text", color: C.dim, wrap: RW, lineHeight: 16 });
  list.addChild(at(note, 0, y + 8));
  root.addChild(at(list, 20, 84));
  return { root };
}
