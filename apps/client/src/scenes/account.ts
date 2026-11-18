/**
 * Account (docs/ux.md P11, ACC-08): the player's data as a file, and deleting the account after a confirmation. Both
 * need the connection; offline a toast says so. Sign-in itself is silent (Game Center / Google Play Games).
 */
import { Container, Rectangle } from "pixi.js";
import type { Game, Scene } from "../game";
import { C, W, H } from "../theme";
import { at, box, dimmer, pillButton, roundButton, tappable, txt } from "../ui";
import { icon } from "../icons";
import { t, upper } from "../i18n";

/** Hands the export to the player: the share sheet where there is one, else a download. */
async function saveFile(name: string, json: string): Promise<void> {
  const file = new File([json], name, { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file] }).catch(() => undefined);
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function confirmDelete(game: Game): Scene {
  const root = new Container();
  root.addChild(dimmer(() => game.closeOverlay(), 0.9));
  const w = W - 40;
  const card = new Container();
  card.addChild(box(w, 340, { fill: C.panel, line: C.bad, lineW: 2, radius: 18 }));
  card.addChild(at(icon("bin", 34, C.bad), w / 2, 44));
  card.addChild(at(txt(upper(t("ui.account.deleteAsk")), 20, { spacing: 1.5, anchor: [0.5, 0] }), w / 2, 76));
  card.addChild(at(txt(t("ui.account.deleteText"), 14, { font: "text", color: C.dim, wrap: w - 48, align: "center", anchor: [0.5, 0] }), w / 2, 112));
  let busy = false;
  const del = pillButton(
    upper(t("ui.account.deleteYes")),
    w - 48,
    50,
    () => {
      if (busy) return;
      busy = true;
      void game.deleteAccount().then((res) => {
        busy = false;
        if (!res.ok) {
          game.toast(t("toast.accountOffline"));
          return;
        }
        game.toast(t("toast.accountDeleted"));
        game.reenter();
      });
    },
    { fill: C.bad, ink: C.text, size: 18 },
  );
  card.addChild(at(del, 24, 222));
  const cancel = txt(upper(t("ui.cancel")), 15, { color: C.dim, spacing: 2, anchor: [0.5, 0.5] });
  card.addChild(
    at(
      tappable(cancel, () => game.closeOverlay(), new Rectangle(-80, -20, 160, 40)),
      w / 2,
      306,
    ),
  );
  root.addChild(at(card, 20, H / 2 - 170));
  return { root };
}

export function accountOverlay(game: Game): Scene {
  const root = new Container();
  const rw = W - 40;
  root.addChild(dimmer(undefined, 0.94));
  root.addChild(at(txt(t("ui.account"), 26, { spacing: 2 }), 20, 28));
  root.addChild(
    at(
      roundButton("back", 22, () => game.closeOverlay(), { iconSize: 18 }),
      W - 42,
      44,
    ),
  );
  root.addChild(at(txt(t("ui.account.signIn"), 14, { font: "text", color: C.dim, wrap: rw }), 24, 92));

  const online = (then: () => void) => () => (game.isOnline ? then() : game.toast(t("toast.accountOffline")));
  const rows: { ic: string; label: string; color: number; tap: () => void }[] = [
    {
      ic: "share",
      label: t("ui.account.export"),
      color: C.text,
      tap: online(
        () =>
          void game.call("accountExport", {}).then((res) => {
            if (!res.ok) game.toast(t("toast.accountOffline"));
            else void saveFile("backpack-space-data.json", JSON.stringify(res.value, null, 2));
          }),
      ),
    },
    { ic: "bin", label: t("ui.account.delete"), color: C.bad, tap: online(() => game.openOverlay(confirmDelete(game))) },
  ];
  let y = 150;
  for (const r of rows) {
    const row = new Container();
    row.addChild(box(rw, 50, { fill: C.panel, line: C.line, radius: 14 }));
    row.addChild(at(icon(r.ic, 22, r.color), 28, 25), at(txt(r.label, 16, { font: "text", weight: "600", color: r.color, anchor: [0, 0.5] }), 54, 25));
    row.addChild(at(icon("arrow", 18, C.dim), rw - 24, 25));
    tappable(row, r.tap, new Rectangle(0, 0, rw, 50));
    root.addChild(at(row, 20, y));
    y += 58;
  }
  return { root };
}
