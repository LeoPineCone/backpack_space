/** The free pick after certain rounds (rules.specials): one of the hero's own items, or a general artifact. */
import { Container, Rectangle } from "pixi.js";
import { takeSpecial } from "@backpack-space/core";
import type { Game, Scene } from "../game";
import { C, H, RARITY, W } from "../theme";
import { icon } from "../icons";
import { at, box, dimmer, heroBadge, infoButton, pillButton, tappable, txt } from "../ui";
import { pieceFit, symbolRow } from "../pieces";
import { itemRows } from "../symbols";
import { itemPopup } from "./popup";
import { t, tr, upper } from "../i18n";

export function specialOverlay(game: Game, onDone: () => void): Scene {
  const root = new Container();
  const data = game.data;
  const options = game.run!.special ?? [];
  let chosen = 0;
  // the pick belongs to the round just fought
  const heroPick = data.rules.specials.find((sp) => sp.afterRound === game.run!.round - 1)?.pool === "hero";

  const render = () => {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
    root.addChild(dimmer(undefined, 0.96));
    // the hero's badge over a pick from the hero's own items, a star over a general artifact
    if (heroPick) root.addChild(at(heroBadge(data.heroes.get(game.run!.hero)!.name, 26, C.gold), W / 2, 56));
    else root.addChild(at(icon("starFull", 44, C.gold), W / 2, 56));
    root.addChild(at(txt(t("ui.chooseOne"), 28, { spacing: 1.7, anchor: [0.5, 0] }), W / 2, 86));
    const cardH = options.length > 2 ? 150 : 180,
      gap = 14,
      top = 150;
    options.forEach((id, i) => {
      const def = data.items.get(id)!;
      const card = new Container();
      card.addChild(box(W - 40, cardH, { fill: C.panel, line: i === chosen ? C.gold : C.line, lineW: i === chosen ? 3 : 2, radius: 20 }));
      card.addChild(
        at(box(104, cardH - 28, { fill: C.bg, line: RARITY[def.rarity], radius: 16 }), 14, 14),
        at(pieceFit(data, id, 88, cardH - 44, 30, { stars: true }), 22, 22),
      );
      const name = txt(upper(tr().item(id)), 17, { spacing: 0.5, wrap: W - 40 - 132 - 52 });
      card.addChild(at(name, 132, 16));
      let y = 16 + name.height + 6;
      for (const r of itemRows(def, data).slice(0, 2)) {
        const row = symbolRow(r, 200, 26);
        if (y + row.h > cardH - 8) break;
        card.addChild(at(row.node, 132, y));
        y += row.h + 8;
      }
      tappable(
        card,
        () => {
          chosen = i;
          render();
        },
        new Rectangle(0, 0, W - 40, cardH),
      );
      card.addChild(
        at(
          infoButton(16, () => game.openOverlay(itemPopup(game, id))),
          W - 40 - 26,
          26,
        ),
      );
      root.addChild(at(card, 20, top + i * (cardH + gap)));
    });
    root.addChild(
      at(
        pillButton(t("ui.take"), W - 40, 64, () => {
          takeSpecial(game.run!, chosen);
          game.closeOverlay();
          onDone();
        }),
        20,
        H - 84,
      ),
    );
  };
  render();
  return { root };
}
