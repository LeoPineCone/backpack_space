/**
 * Browser preview of Backpack Space: hero pick, shop + backpack, fight playback, run end, catalog.
 * A design tool: every rule decision is made by @backpack-space/core (run.ts, battle.ts); this file only calls it and draws.
 */
import {
  Rng, benchItem, buildOf, buy, combine, compile, describeHero, findCombos, finishRound, moveBag, moveItem, newRun, placeBench, reroll, toggleFreeze,
  sellBag, sellBench, sellItem, sellPrice, takeSpecial,
  type Build, type Combo, type ItemDef, type RunState, type Spot,
} from "@backpack-space/core";
import { DATA as data, GHOSTS } from "./data";
import { mountFight } from "./fight";
import { boardView, h, setKids, itemInfo, itemName, pieceEl, searchText, type BoardView } from "./view";

type Src = { kind: "offer"; i: number } | { kind: "bench"; i: number } | { kind: "item"; i: number } | { kind: "bag"; i: number };
interface Drag {
  src: Src | null; item: string; rot: number; pointerId: number; touch: boolean;
  startX: number; startY: number; x: number; y: number; active: boolean;
  /** where the pointer holds the piece, in cells from its top-left corner */
  grab: { x: number; y: number };
  cell: { x: number; y: number } | null;
  float: HTMLElement | null; spot: Spot | null; ok: boolean;
}

const app = document.getElementById("app")!;
const rules = data.rules;
const { w: GW, h: GH } = rules.grid;

// ---- state ----
let seed = 0;
let rng = new Rng(0);
let run: RunState | null = null;
let screen: "hero" | "shop" | "fight" | "end" = "hero";
let sel: Src | null = null;
let selRot = 0;
let bagMode = false;
let hover: Src | null = null;
let hoverCell: { x: number; y: number } | null = null;
let drag: Drag | null = null;
let view: BoardView | null = null;
let infoEl: HTMLElement | null = null;
let sellEl: HTMLElement | null = null;
let combos: Combo[] = [];
let stopFight: (() => void) | null = null;
let catalogOpen = false;
let catalogQuery = "";

const sameSrc = (a: Src | null, b: Src | null) => !!a && !!b && a.kind === b.kind && a.i === b.i;
function srcItem(s: Src): string {
  const r = run!;
  return s.kind === "offer" ? r.offers[s.i]!.item : s.kind === "bench" ? r.bench[s.i]! : s.kind === "item" ? r.items[s.i]!.item : r.bags[s.i]!.item;
}
const srcPlaced = (s: Src) => (s.kind === "item" ? run!.items[s.i]! : s.kind === "bag" ? run!.bags[s.i]! : null);
const srcExists = (s: Src) => (s.kind === "offer" ? !!run!.offers[s.i] : s.kind === "bench" ? s.i < run!.bench.length : s.kind === "item" ? s.i < run!.items.length : s.i < run!.bags.length);

/** The one place a piece is put somewhere: the rules in run.ts decide whether it works. */
function applyTo(s: RunState, src: Src, at: Spot): boolean {
  switch (src.kind) {
    case "offer": return buy(s, data, src.i, at);
    case "bench": return placeBench(s, data, src.i, at);
    case "item": return moveItem(s, data, src.i, at);
    case "bag": return moveBag(s, data, src.i, at);
  }
}
const canPlace = (src: Src, at: Spot): boolean => { try { return applyTo(structuredClone(run!), src, at); } catch { return false; } };
/** A spot that puts some cell of the piece on the tapped cell. */
function spotAt(src: Src, rot: number, cx: number, cy: number): { spot: Spot; ok: boolean } {
  const cells = data.shape(srcItem(src), rot).cells;
  for (const c of cells) { const spot = { x: cx - c[0], y: cy - c[1], rot }; if (canPlace(src, spot)) return { spot, ok: true }; }
  const c = cells[0]!;
  return { spot: { x: cx - c[0], y: cy - c[1], rot }, ok: false };
}
function whyNot(src: Src): string {
  const r = run!;
  if (src.kind === "offer" && r.gold < (r.offers[src.i]?.price ?? 0)) return "Not enough gold";
  const def = data.items.get(srcItem(src))!;
  if (def.isBag) return src.kind === "bag" && selRotDiffers(src) ? "A bag can only be turned while it is empty" : "A bag needs free cells without another bag";
  return "Does not fit there — items must lie on free bag cells";
}
const selRotDiffers = (src: Src) => { const p = srcPlaced(src); return !!p && (drag?.active ? drag.rot : selRot) !== p.rot; };

let toastTimer = 0;
function toast(msg: string): void {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast" }); document.body.append(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("show"), 1800);
}

// ---- run flow ----
function startRun(hero: string): void {
  const fromHash = /seed=(\d+)/.exec(location.hash);
  seed = fromHash ? Number(fromHash[1]) >>> 0 : Math.floor(Math.random() * 2 ** 31);
  rng = new Rng(seed);
  run = newRun(data, hero, rng);
  sel = null; hover = null; bagMode = false;
  screen = "shop";
  render();
}
function select(s: Src | null): void {
  sel = s;
  selRot = s ? srcPlaced(s)?.rot ?? 0 : 0;
  hoverCell = null;
  render();
}
/** Places `src` at the spot for real and keeps the placed piece selected. */
function commitPlace(src: Src, at: Spot): boolean {
  const r = run!;
  const isBag = data.items.get(srcItem(src))!.isBag;
  if (!applyTo(r, src, at)) return false;
  if (src.kind === "item" || src.kind === "bag") sel = src;
  else sel = isBag ? { kind: "bag", i: r.bags.length - 1 } : { kind: "item", i: r.items.length - 1 };
  selRot = at.rot;
  return true;
}
function toBench(src: Src): void {
  const r = run!;
  if (src.kind === "offer") { if (!buy(r, data, src.i)) toast(r.gold < r.offers[src.i]!.price ? "Not enough gold" : "The bench is full"); }
  else if (src.kind === "item") { if (!benchItem(r, data, src.i)) toast("The bench is full"); }
  else if (src.kind === "bag") toast("A placed bag cannot go back to the bench — move it or sell it empty");
  else return;
  sel = null;
  render();
}
function sell(src: Src): void {
  const r = run!;
  if (src.kind === "offer") { toast("Not yours yet"); return; }
  if (src.kind === "item") sellItem(r, data, src.i);
  else if (src.kind === "bench") sellBench(r, data, src.i);
  else if (!sellBag(r, data, src.i)) { toast("Only an empty bag can be sold"); return; }
  sel = null;
  render();
}
function rotateSel(): void {
  if (drag?.active) return; // a second finger on the button already turned the dragged piece
  if (!sel || screen !== "shop") return;
  const next = (selRot + 1) & 3;
  const p = srcPlaced(sel);
  if (p) {
    // turn in place when the rules allow it; otherwise keep the turn for the next tap on a cell
    if (canPlace(sel, { x: p.x, y: p.y, rot: next })) { commitPlace(sel, { x: p.x, y: p.y, rot: next }); render(); return; }
    toast(sel.kind === "bag" ? "Turned — tap a free spot (a bag only turns while empty)" : "Turned — tap a cell to place it");
  }
  selRot = next;
  render();
}

function pickGhost(player: Build): { ghost: Build; note?: string } {
  const round = player.round;
  const order: number[] = [];
  for (let r = round - 1; r >= 0; r--) order.push(r);
  for (let r = round; r < GHOSTS.length; r++) order.push(r);
  for (const r of order) {
    const pool = [...(GHOSTS[r] ?? [])];
    while (pool.length) {
      const g = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
      try { compile(g, data); return { ghost: g, note: r === round - 1 ? undefined : `No stored ghost for round ${round}: fighting one from round ${r + 1}.` }; } catch { /* stale ghost: data changed since it was stored */ }
    }
  }
  return { ghost: { ...player }, note: "No usable ghosts (run `npm run play:ghosts`): fighting a copy of your own build." };
}
function startFight(): void {
  const r = run!;
  if (r.bench.length > rules.shop.benchSlots || r.special) return;
  const player = buildOf(r);
  const { ghost, note } = pickGhost(player);
  screen = "fight"; sel = null; hover = null;
  app.className = "screen-fight";
  window.scrollTo(0, 0);
  stopFight = mountFight(app, data, { player, ghost, seed: rng.int(2 ** 31), note }, (won) => {
    stopFight = null;
    finishRound(r, data, won, rng);
    screen = r.over ? "end" : "shop";
    window.scrollTo(0, 0);
    render();
  });
}

// ---- screens ----
function render(): void {
  if (stopFight && screen !== "fight") { stopFight(); stopFight = null; }
  view = null; infoEl = null; sellEl = null;
  app.className = `screen-${screen}`;
  if (screen === "hero") renderHeroPick();
  else if (screen === "shop") renderShop();
  else if (screen === "end") renderEnd();
  document.getElementById("catalog")?.remove();
  if (catalogOpen) document.body.append(catalogEl());
}

function renderHeroPick(): void {
  app.replaceChildren(
    h("h1", { class: "title" }, "Backpack Space"),
    h("p", { class: "sub" }, `Preview build · ${rules.rounds} rounds · ${rules.lives} lives · pick your hero`),
    ...data.heroList.map((hero) => h("button", { class: "hero-card", "data-hero": hero.id, onclick: () => startRun(hero.id) },
      h("div", { class: "hero-name" }, hero.name),
      h("div", { class: "hero-title" }, hero.title),
      h("div", { class: "hero-focus" }, hero.focus),
      h("ul", { class: "lines" }, ...describeHero(hero, data).map((l) => h("li", null, l))),
      h("div", { class: "hero-start" }, `Starts with: ${[...hero.bags, ...hero.start].map((p) => itemName(data, p.item)).join(", ")}`))),
    h("div", { class: "footer" }, h("button", { class: "btn small", onclick: () => { catalogOpen = true; render(); } }, "Catalog")),
  );
}

function header(r: RunState): HTMLElement {
  const hero = data.heroes.get(r.hero)!;
  return h("div", { class: "topbar" },
    h("div", { class: "stat" }, h("small", null, "Round"), h("b", null, `${r.round}/${rules.rounds}`)),
    h("div", { class: "stat" }, h("small", null, "Lives"), h("b", { class: "lives" }, "♥".repeat(Math.max(0, r.lives)) || "–")),
    h("div", { class: "stat" }, h("small", null, "Wins"), h("b", null, r.wins)),
    h("div", { class: "stat" }, h("small", null, "Gold"), h("b", { class: "gold", id: "gold" }, r.gold)),
    h("span", { class: "spacer" }),
    h("div", { class: "stat heroname" }, h("small", null, hero.title), h("b", null, hero.name)),
    h("button", { class: "btn small", id: "open-catalog", onclick: () => { catalogOpen = true; render(); } }, "Catalog"));
}

function renderShop(): void {
  const r = run!;
  if (sel && !srcExists(sel)) sel = null;
  combos = findCombos(data, r.bags, r.items);
  view = boardView(data, r.bags, r.items, { labels: true, selBag: sel?.kind === "bag" ? sel.i : undefined });
  view.root.id = "grid";
  view.root.classList.add("live");
  if (bagMode) view.root.classList.add("bagmode");
  const inCombo = new Set(combos.flatMap((c) => c.idxs));
  view.items.forEach((el, i) => { if (inCombo.has(i)) el.classList.add("combo"); });

  const offers = r.offers.map((o, i) => {
    if (!o) return h("div", { class: "offer sold" }, "sold");
    const def = data.items.get(o.item)!;
    return h("div", { class: `offer o-${def.isBag ? "bag" : def.rarity}${sameSrc(sel, { kind: "offer", i }) ? " sel" : ""}${r.gold < o.price ? " poor" : ""}${o.frozen ? " frozen" : ""}`, "data-src": `offer:${i}` },
      h("div", { class: "offer-name" }, def.name),
      h("div", { class: "offer-pic mini" }, pieceEl(data, o.item, 0, { stars: true })),
      h("div", { class: "offer-price" }, o.frozen ? h("span", { class: "sale ice" }, "PINNED") : null, o.sale ? h("span", { class: "sale" }, "SALE") : null, h("span", { class: "gold" }, o.price), def.isBag && !o.sale ? " · bag" : ""));
  });
  const slots = Math.max(rules.shop.benchSlots, r.bench.length);
  const bench = Array.from({ length: slots }, (_, i) => {
    const id = r.bench[i];
    if (!id) return h("div", { class: "bslot empty" });
    return h("div", { class: `bslot${i >= rules.shop.benchSlots ? " over" : ""}${sameSrc(sel, { kind: "bench", i }) ? " sel" : ""}`, "data-src": `bench:${i}`, title: itemName(data, id) },
      h("div", { class: "mini" }, pieceEl(data, id, 0)), h("small", null, itemName(data, id)));
  });
  const overBench = r.bench.length > rules.shop.benchSlots;
  sellEl = h("div", { class: "sellzone", "data-drop": "sell" }, h("b", null, "Sell"), h("small", { id: "sellprice" }, "drop here"));
  infoEl = h("div", { class: "infopanel" });

  setKids(app,
    header(r),
    h("div", { class: "shoprow" }, ...offers),
    h("div", { class: "row" },
      h("button", { class: "btn", id: "reroll", disabled: r.gold < rules.shop.rerollCost, onclick: () => { if (reroll(r, data, rng)) { if (sel?.kind === "offer") sel = null; render(); } } }, `Reroll (${rules.shop.rerollCost})`),
      h("div", { class: "seg" },
        h("button", { class: "btn small" + (bagMode ? "" : " on"), id: "mode-items", onclick: () => { bagMode = false; if (sel?.kind === "bag") sel = null; render(); } }, "Move items"),
        h("button", { class: "btn small" + (bagMode ? " on" : ""), id: "mode-bags", onclick: () => { bagMode = true; if (sel?.kind === "item") sel = null; render(); } }, "Move bags")),
      h("button", { class: "btn", id: "rotate", onclick: rotateSel }, "⟳ Rotate")),
    combos.length ? h("div", { class: "combos" }, ...combos.map((c, ci) => h("button", { class: "btn combine", "data-combo": ci, onclick: () => { combine(r, data, c); sel = null; render(); } },
      `Combine: ${c.recipe.in.map((i) => itemName(data, i)).join(" + ")} → ${itemName(data, c.recipe.out)}`))) : null,
    h("div", { class: "boardwrap" }, view.root),
    h("div", { class: "benchrow" },
      h("div", { class: "bench", "data-drop": "bench" }, h("small", { class: "benchlabel" }, `Bench ${r.bench.length}/${rules.shop.benchSlots}`), h("div", { class: "bslots" }, ...bench)),
      sellEl),
    h("div", { class: "row" },
      overBench ? h("div", { class: "warn" }, `The bench holds ${r.bench.length} of ${rules.shop.benchSlots}: place or sell something before the fight.`) : h("span", { class: "spacer" }),
      h("button", { class: "btn primary", id: "fight", disabled: overBench || !!r.special, onclick: startFight }, "Fight ▶")),
    infoEl,
    h("div", { class: "footer" }, `Seed ${seed} · drag pieces or tap one and then a cell · R / second finger rotates`),
  );
  if (r.special) app.append(specialModal(r));
  refresh();
}

function specialModal(r: RunState): HTMLElement {
  return h("div", { class: "modal" }, h("div", { class: "modal-box" },
    h("h2", null, "Pick a free special item"),
    h("p", { class: "dim" }, "It goes to your bench."),
    ...r.special!.map((id, i) => h("button", { class: "special", "data-special": i, onclick: () => { takeSpecial(r, i); render(); } }, itemInfo(data, id)))));
}

/** Info panel, star highlights and the placement preview – everything that changes without a rule action. */
function refresh(): void {
  const r = run;
  if (!r || !view || !infoEl || screen !== "shop") return;
  const focus = drag?.active ? drag.src : sel ?? hover;
  // info
  if (focus && srcExists(focus)) {
    const id = srcItem(focus);
    const offer = focus.kind === "offer" ? r.offers[focus.i]! : null;
    const isSel = !drag?.active && sameSrc(focus, sel);
    const rot = drag?.active ? drag.rot : isSel ? selRot : srcPlaced(focus)?.rot ?? 0;
    const buttons = isSel ? h("div", { class: "info-actions" },
      h("button", { class: "btn small", id: "act-rotate", onclick: rotateSel }, "⟳ Rotate"),
      focus.kind === "offer" ? h("button", { class: "btn small", id: "act-bench", onclick: () => toBench(focus) }, `Buy to bench (${offer!.price})`) : null,
      focus.kind === "offer" ? h("button", { class: "btn small", id: "act-freeze", onclick: () => { toggleFreeze(r, focus.i); render(); } }, offer!.frozen ? "Unpin" : "Pin for later") : null,
      focus.kind === "item" ? h("button", { class: "btn small", id: "act-bench", onclick: () => toBench(focus) }, "To bench") : null,
      focus.kind !== "offer" ? h("button", { class: "btn small danger", id: "act-sell", onclick: () => sell(focus) }, `Sell (+${sellPrice(data, id)})`) : null,
      h("button", { class: "btn small", id: "act-close", onclick: () => select(null) }, "✕"),
      h("span", { class: "hint" }, srcPlaced(focus) ? "Tap a cell to move it." : "Tap a cell to place it.")) : null;
    setKids(infoEl, itemInfo(data, id, { rot, price: offer?.price, sale: offer?.sale }), buttons);
  } else {
    infoEl.replaceChildren(h("div", { class: "dim pad" }, "Tap or hover an item to see what it does. Drag from the shop into a bag to buy; drop on the bench to keep it for later; drop on Sell to sell."));
  }
  if (sellEl) {
    const s = drag?.active ? drag.src : sel;
    const can = !!s && s.kind !== "offer" && srcExists(s);
    sellEl.classList.toggle("armed", can);
    sellEl.querySelector("#sellprice")!.textContent = can ? `+${sellPrice(data, srcItem(s))} gold` : "drop here";
  }
  // selection + star highlights
  view.items.forEach((el, i) => { el.classList.toggle("sel", !drag?.active && sel?.kind === "item" && sel.i === i); el.classList.remove("starhit", "dragsrc"); });
  if (drag?.active && drag.src?.kind === "item") view.items[drag.src.i]?.classList.add("dragsrc");
  view.overlay.replaceChildren();
  const occ = (x: number, y: number) => (x < 0 || y < 0 || x >= GW || y >= GH ? -1 : view!.board.occ[y * GW + x]!);
  const stars = (id: string, x: number, y: number, rot: number, self: number) => {
    for (const st of data.shape(id, rot).stars) {
      const px = x + st[0], py = y + st[1];
      if (px < 0 || py < 0 || px >= GW || py >= GH) continue;
      const o = occ(px, py);
      const hit = o >= 0 && o !== self;
      if (hit) view!.items[o]?.classList.add("starhit");
      view!.overlay.append(h("div", { class: "star" + (hit ? " hit" : ""), style: `left:calc(var(--cell)*${px});top:calc(var(--cell)*${py});` }, "★"));
    }
  };
  // preview of the piece being dragged, or of the selected piece under the mouse
  let preview: { src: Src; spot: Spot; ok: boolean } | null = null;
  if (drag?.active && drag.src && drag.spot) preview = { src: drag.src, spot: drag.spot, ok: drag.ok };
  else if (!drag?.active && sel && hoverCell && srcExists(sel)) {
    const own = sel.kind === "item" && occ(hoverCell.x, hoverCell.y) === sel.i;
    if (!own) preview = { src: sel, ...spotAt(sel, selRot, hoverCell.x, hoverCell.y) };
  }
  if (preview) {
    const id = srcItem(preview.src), { spot } = preview;
    for (const c of data.shape(id, spot.rot).cells) {
      const px = spot.x + c[0], py = spot.y + c[1];
      if (px < 0 || py < 0 || px >= GW || py >= GH) continue;
      view.overlay.append(h("div", { class: `ghost ${preview.ok ? "ok" : "bad"}`, style: `left:calc(var(--cell)*${px});top:calc(var(--cell)*${py});` }));
    }
    stars(id, spot.x, spot.y, spot.rot, preview.src.kind === "item" ? preview.src.i : -1);
  } else if (focus?.kind === "item" && srcExists(focus)) {
    const p = r.items[focus.i]!;
    stars(p.item, p.x, p.y, p.rot, focus.i);
  }
}

function renderEnd(): void {
  const r = run!;
  let board: HTMLElement;
  try { board = boardView(data, r.bags, r.items, { labels: true }).root; } catch { board = h("div", { class: "dim" }, "(layout unavailable)"); }
  const survived = r.lives > 0;
  app.replaceChildren(
    h("h1", { class: "title" }, survived ? "Run complete" : "Run over"),
    h("p", { class: "sub" }, `${data.heroes.get(r.hero)!.name} · seed ${seed}`),
    h("div", { class: "endstats" },
      h("div", { class: "stat" }, h("small", null, "Rounds played"), h("b", null, `${r.round}/${rules.rounds}`)),
      h("div", { class: "stat" }, h("small", null, "Wins"), h("b", null, r.wins)),
      h("div", { class: "stat" }, h("small", null, "Lives left"), h("b", { class: "lives" }, r.lives > 0 ? "♥".repeat(r.lives) : "0"))),
    h("div", { class: "panel-title" }, "Final build"),
    h("div", { class: "boardwrap" }, board),
    h("p", { class: "buildlist" }, r.items.map((p) => itemName(data, p.item)).join(" · ") || "No items"),
    h("div", { class: "row center" }, h("button", { class: "btn primary", id: "newrun", onclick: () => { run = null; screen = "hero"; history.replaceState(null, "", location.pathname + location.search); render(); } }, "New run")),
  );
}

// ---- catalog ----
function catalogEl(): HTMLElement {
  const groups: { title: string; items: ItemDef[] }[] = [
    { title: "General", items: data.itemList.filter((i) => !i.isBag && !i.crafted && i.rarity !== "artifact" && !i.hero) },
    ...data.heroList.map((hero) => ({ title: hero.name, items: data.itemList.filter((i) => !i.isBag && !i.crafted && i.rarity !== "artifact" && i.hero === hero.id) })),
    { title: "Crafted", items: data.itemList.filter((i) => i.crafted) },
    { title: "Artifacts", items: data.itemList.filter((i) => i.rarity === "artifact" && !i.crafted && !i.isBag) },
    { title: "Bags", items: data.itemList.filter((i) => i.isBag) },
  ];
  const body = h("div", { class: "cat-body" });
  const count = h("span", { class: "dim" });
  const fill = () => {
    const words = catalogQuery.toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    body.replaceChildren(...groups.flatMap((g) => {
      const list = g.items.filter((it) => { const t = searchText(data, it); return words.every((wd) => t.includes(wd)); });
      n += list.length;
      return list.length ? [h("h3", null, `${g.title} (${list.length})`), ...list.map((it) => itemInfo(data, it.id))] : [];
    }));
    count.textContent = `${n} of ${data.itemList.length} items`;
  };
  const input = h("input", { type: "search", id: "cat-search", placeholder: "Search name, tag, rarity, effect text…", value: catalogQuery });
  input.addEventListener("input", () => { catalogQuery = input.value; fill(); });
  fill();
  return h("div", { id: "catalog", class: "modal" }, h("div", { class: "modal-box cat" },
    h("div", { class: "cat-head" }, h("h2", null, "Catalog"), count, h("span", { class: "spacer" }), h("button", { class: "btn small", id: "cat-close", onclick: () => { catalogOpen = false; render(); } }, "Close ✕")),
    input, body));
}

// ---- pointer interaction (mouse and touch) ----
const cellPx = () => (view ? view.root.getBoundingClientRect().width / GW : 40);
function gridCell(x: number, y: number): { x: number; y: number } | null {
  if (!view) return null;
  const rect = view.root.getBoundingClientRect(), c = rect.width / GW;
  const cx = Math.floor((x - rect.left) / c), cy = Math.floor((y - rect.top) / c);
  return cx >= 0 && cy >= 0 && cx < GW && cy < GH ? { x: cx, y: cy } : null;
}
/** What a press on this grid cell grabs: an item, or the bag under it (always the bag in "Move bags"). */
function hitAt(cx: number, cy: number): Src | null {
  if (!view) return null;
  const item = view.board.occ[cy * GW + cx]!, bag = view.board.bag[cy * GW + cx]!;
  if (!bagMode && item >= 0) return { kind: "item", i: item };
  return bag >= 0 ? { kind: "bag", i: bag } : null;
}
function parseSrc(el: Element | null): Src | null {
  const raw = el?.closest("[data-src]")?.getAttribute("data-src");
  if (!raw) return null;
  const [kind, i] = raw.split(":");
  return kind === "offer" || kind === "bench" ? { kind, i: Number(i) } : null;
}

function buildFloat(d: Drag): void {
  d.float?.remove();
  const f = pieceEl(data, d.item, d.rot, { label: true });
  f.classList.add("float");
  f.style.setProperty("--cell", `${cellPx()}px`);
  document.body.append(f);
  d.float = f;
}
function moveDrag(d: Drag): void {
  if (!d.float || !view) return;
  const c = cellPx(), lift = d.touch ? c * 1.3 : 0;
  const left = d.x - d.grab.x * c, top = d.y - lift - d.grab.y * c;
  d.float.style.left = `${left}px`; d.float.style.top = `${top}px`;
  const rect = view.root.getBoundingClientRect();
  const s = data.shape(d.item, d.rot);
  const mx = left + (s.w * c) / 2, my = top + (s.h * c) / 2;
  const prev = d.spot ? `${d.spot.x},${d.spot.y},${d.spot.rot}` : "";
  if (d.src && mx >= rect.left - c / 2 && mx <= rect.right + c / 2 && my >= rect.top - c / 2 && my <= rect.bottom + c / 2) {
    const spot = { x: Math.round((left - rect.left) / c), y: Math.round((top - rect.top) / c), rot: d.rot };
    if (`${spot.x},${spot.y},${spot.rot}` !== prev) { d.spot = spot; d.ok = canPlace(d.src, spot); refresh(); }
  } else if (d.spot) { d.spot = null; refresh(); }
  const zone = d.spot ? null : document.elementFromPoint(d.x, d.y)?.closest("[data-drop]");
  document.querySelectorAll("[data-drop]").forEach((el) => el.classList.toggle("over", el === zone));
}
function rotateDrag(): void {
  const d = drag;
  if (!d?.active) return;
  d.rot = (d.rot + 1) & 3;
  const s = data.shape(d.item, d.rot);
  d.grab = { x: s.w / 2, y: s.h / 2 };
  d.spot = null;
  buildFloat(d);
  moveDrag(d);
  refresh();
}
function endDrag(): void {
  drag?.float?.remove();
  drag = null;
  document.body.classList.remove("dragging");
  document.querySelectorAll("[data-drop].over, .dragsrc").forEach((el) => el.classList.remove("over", "dragsrc"));
}

document.addEventListener("pointerdown", (e) => {
  if (screen !== "shop" || !run || run.special || catalogOpen) return;
  if (drag) { if (drag.active && e.pointerId !== drag.pointerId) { rotateDrag(); e.preventDefault(); } return; }
  if (e.button !== 0) return;
  const target = e.target as Element;
  let src = parseSrc(target);
  let cell: { x: number; y: number } | null = null;
  let grab: { x: number; y: number } | null = null;
  if (!src) {
    if (!view || !view.root.contains(target)) return;
    cell = gridCell(e.clientX, e.clientY);
    if (!cell) return;
    src = hitAt(cell.x, cell.y);
    const p = src ? srcPlaced(src) : null;
    if (p) { const rect = view.root.getBoundingClientRect(), c = rect.width / GW; grab = { x: (e.clientX - rect.left) / c - p.x, y: (e.clientY - rect.top) / c - p.y }; }
  }
  if (src && !srcExists(src)) return;
  const item = src ? srcItem(src) : "";
  const rot = src ? srcPlaced(src)?.rot ?? (sameSrc(src, sel) ? selRot : 0) : 0;
  const shape = src ? data.shape(item, rot) : null;
  drag = {
    src, item, rot, pointerId: e.pointerId, touch: e.pointerType !== "mouse", startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false,
    grab: grab ?? { x: (shape?.w ?? 1) / 2, y: (shape?.h ?? 1) / 2 }, cell, float: null, spot: null, ok: false,
  };
  if (e.pointerType === "mouse") e.preventDefault();
});

document.addEventListener("pointermove", (e) => {
  const d = drag;
  if (!d) {
    // mouse hover: info for the item under the pointer, preview for a selected piece
    if (e.pointerType !== "mouse" || screen !== "shop" || !view || !run || run.special) return;
    const target = e.target as Element;
    const cell = view.root.contains(target) ? gridCell(e.clientX, e.clientY) : null;
    const h2 = cell ? hitAt(cell.x, cell.y) : parseSrc(target);
    const nextHover = h2 && srcExists(h2) && (h2.kind !== "bag" || bagMode) ? h2 : null;
    const changed = !(sameSrc(nextHover, hover) || (!nextHover && !hover)) || (cell?.x !== hoverCell?.x || cell?.y !== hoverCell?.y);
    hover = nextHover; hoverCell = cell;
    if (changed) refresh();
    return;
  }
  if (e.pointerId !== d.pointerId) return;
  d.x = e.clientX; d.y = e.clientY;
  if (!d.active) {
    if (!d.src || Math.hypot(d.x - d.startX, d.y - d.startY) < 8) return;
    d.active = true;
    hoverCell = null;
    document.body.classList.add("dragging");
    if (d.src.kind === "offer" || d.src.kind === "bench") document.querySelector(`[data-src="${d.src.kind}:${d.src.i}"]`)?.classList.add("dragsrc");
    buildFloat(d);
    refresh();
  }
  moveDrag(d);
  e.preventDefault();
});

function finishPointer(e: PointerEvent, cancelled: boolean): void {
  const d = drag;
  if (!d || e.pointerId !== d.pointerId) return;
  if (cancelled) { endDrag(); refresh(); return; }
  if (!d.active) {
    endDrag();
    if (d.cell) tapCell(d.cell.x, d.cell.y);
    else if (d.src) select(sameSrc(d.src, sel) ? null : d.src);
    return;
  }
  const src = d.src!;
  const zone = d.spot ? null : document.elementFromPoint(d.x, d.y)?.closest("[data-drop]")?.getAttribute("data-drop");
  const spot = d.spot, ok = d.ok, rot = d.rot;
  endDrag();
  if (spot) {
    if (ok) commitPlace(src, spot);
    else { if (sameSrc(src, sel)) selRot = rot; toast(whyNotAt(src, rot)); }
    render();
  } else if (zone === "bench") {
    if (src.kind === "bench") render(); else toBench(src);
  } else if (zone === "sell") sell(src);
  else render();
}
const whyNotAt = (src: Src, rot: number): string => { const p = srcPlaced(src); return src.kind === "bag" && p && p.rot !== rot ? "A bag can only be turned while it is empty" : whyNot(src); };
document.addEventListener("pointerup", (e) => finishPointer(e, false));
document.addEventListener("pointercancel", (e) => finishPointer(e, true));

/** Tap on a grid cell: place the selected piece there, or select what lies there. */
function tapCell(cx: number, cy: number): void {
  const hit = hitAt(cx, cy);
  if (!sel || !srcExists(sel)) { select(hit); return; }
  if (sameSrc(hit, sel)) { select(null); return; }
  if (hit?.kind === "item") { select(hit); return; }
  const { spot, ok } = spotAt(sel, selRot, cx, cy);
  if (ok) { commitPlace(sel, spot); render(); return; }
  if (hit) { select(hit); return; }
  toast(whyNot(sel));
}

document.addEventListener("keydown", (e) => {
  if ((e.target as Element).tagName === "INPUT") return;
  if (e.key === "r" || e.key === "R") { if (drag?.active) rotateDrag(); else rotateSel(); e.preventDefault(); }
  else if (e.key === "Escape") { if (catalogOpen) { catalogOpen = false; render(); } else if (drag) { endDrag(); refresh(); } else if (sel) select(null); }
});
document.addEventListener("wheel", (e) => { if (drag?.active) { rotateDrag(); e.preventDefault(); } }, { passive: false });
document.addEventListener("contextmenu", (e) => { if (drag?.active) { rotateDrag(); e.preventDefault(); } else if ((e.target as Element).closest("#grid, [data-src]")) e.preventDefault(); });
document.addEventListener("pointerleave", () => { if (!drag && (hover || hoverCell)) { hover = null; hoverCell = null; refresh(); } });

render();
