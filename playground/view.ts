/** Shared DOM helpers of the preview: element builder, item tiles, the backpack board, item info. Display only – no rules here. */
import { boardOf, describeItem, sellPrice, type Board, type GameData, type ItemDef, type Placement } from "@backpack-space/core";

type Kid = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

/** replaceChildren that skips null/false entries. */
export function setKids(el: HTMLElement, ...kids: Kid[]): void {
  el.replaceChildren(...kids.filter((k): k is Node | string | number => k !== null && k !== undefined && k !== false).map((k) => (k instanceof Node ? k : String(k))));
}

const TAG_ICON: Record<string, string> = { weapon: "⚔️", armor: "🛡️", accessory: "🔧", pet: "🐾", food: "🍎", mechanical: "⚙️", organic: "🌿", bag: "🎒", crafted: "✨" };
export const tagIcon = (tag: string): string => TAG_ICON[tag] ?? "•";
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** 2–3 letters standing in for the missing item art. */
export function abbr(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s-]/gu, "").split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map((w) => w.charAt(0).toUpperCase()).join("");
  const w = words[0] ?? "?";
  return w.charAt(0).toUpperCase() + w.slice(1, 3).toLowerCase();
}

export const itemName = (data: GameData, id: string): string => data.items.get(id)?.name ?? id;
const at = (x: number, y: number) => `left:calc(var(--cell)*${x});top:calc(var(--cell)*${y});`;

/** An item (or bag) as a tile made of its cells; with `stars` the star cells are drawn too. */
export function pieceEl(data: GameData, id: string, rot: number, o: { label?: boolean; stars?: boolean } = {}): HTMLElement {
  const def = data.items.get(id)!;
  const s = data.shape(id, rot);
  const pts = o.stars ? [...s.cells, ...s.stars] : s.cells;
  const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
  const w = Math.max(...pts.map((p) => p[0])) - minX + 1, hh = Math.max(...pts.map((p) => p[1])) - minY + 1;
  const root = h("div", { class: `piece r-${def.isBag ? "bag" : def.rarity}`, style: `width:calc(var(--cell)*${w});height:calc(var(--cell)*${hh});` });
  const set = new Set(s.cells.map((c) => `${c[0]},${c[1]}`));
  const cx = s.cells.reduce((a, c) => a + c[0], 0) / s.cells.length, cy = s.cells.reduce((a, c) => a + c[1], 0) / s.cells.length;
  let labelCell = s.cells[0]!, best = Infinity;
  for (const c of s.cells) { const d = (c[0] - cx) ** 2 + (c[1] - cy) ** 2; if (d < best - 1e-9) { best = d; labelCell = c; } }
  for (const c of s.cells) {
    const edges = (set.has(`${c[0]},${c[1] - 1}`) ? "" : " et") + (set.has(`${c[0] + 1},${c[1]}`) ? "" : " er") + (set.has(`${c[0]},${c[1] + 1}`) ? "" : " eb") + (set.has(`${c[0] - 1},${c[1]}`) ? "" : " el");
    const cell = h("div", { class: "pc" + edges, style: at(c[0] - minX, c[1] - minY) });
    if (o.label && c === labelCell) cell.append(h("span", { class: "lab" }, h("i", null, tagIcon(def.tags[0] ?? "")), h("b", null, abbr(def.name))));
    root.append(cell);
  }
  if (o.stars) for (const st of s.stars) root.append(h("div", { class: "ps", style: at(st[0] - minX, st[1] - minY) }, "★"));
  return root;
}

export interface BoardView { root: HTMLElement; items: HTMLElement[]; overlay: HTMLElement; board: Board }

/** The backpack: every grid cell, the bags as tinted pockets, the items on top and an empty overlay for previews. Throws on an invalid layout. */
export function boardView(data: GameData, bags: readonly Placement[], items: readonly Placement[], o: { labels?: boolean; selBag?: number } = {}): BoardView {
  const { w, h: gh } = data.rules.grid;
  const board = boardOf(w, gh, bags, items, data.shape);
  const root = h("div", { class: "board", style: `--cols:${w};--rows:${gh};` });
  const marked = new Set<number>();
  for (let y = 0; y < gh; y++) for (let x = 0; x < w; x++) {
    const b = board.bag[y * w + x]!;
    if (b < 0) { root.append(h("div", { class: "cell", style: at(x, y) })); continue; }
    const same = (px: number, py: number) => px >= 0 && py >= 0 && px < w && py < gh && board.bag[py * w + px] === b;
    const edges = (same(x, y - 1) ? "" : " et") + (same(x + 1, y) ? "" : " er") + (same(x, y + 1) ? "" : " eb") + (same(x - 1, y) ? "" : " el");
    const def = data.items.get(bags[b]!.item)!;
    const cell = h("div", { class: "cell pocket" + edges + (o.selBag === b ? " sel" : ""), style: `${at(x, y)}--hue:${(b * 67 + 205) % 360};` });
    if (def.effects.length && !marked.has(b)) { marked.add(b); cell.append(h("span", { class: "bagmark", title: `${def.name}: ${describeItem(def, data).join(" ")}` }, "✦")); }
    root.append(cell);
  }
  const els = items.map((p) => {
    const el = pieceEl(data, p.item, p.rot, { label: o.labels });
    el.classList.add("placed");
    el.setAttribute("style", `${el.getAttribute("style") ?? ""}${at(p.x, p.y)}`);
    el.title = itemName(data, p.item);
    root.append(el);
    return el;
  });
  const overlay = h("div", { class: "overlay" });
  root.append(overlay);
  return { root, items: els, overlay, board };
}

export function recipeLines(data: GameData, id: string): { made: string | null; uses: string[] } {
  const made = data.recipes.find((r) => r.out === id);
  return {
    made: made ? made.in.map((i) => itemName(data, i)).join(" + ") : null,
    uses: (data.recipesWith.get(id) ?? []).map((r) => `${r.in.map((i) => itemName(data, i)).join(" + ")} → ${itemName(data, r.out)}`),
  };
}

export function searchText(data: GameData, def: ItemDef): string {
  const r = recipeLines(data, def.id);
  return [def.name, def.id, def.rarity, def.tags.join(" "), describeItem(def, data).join(" "), r.made ?? "", r.uses.join(" ")].join(" ").toLowerCase();
}

/** Name, rarity, tags, price, rules text and recipes of an item. */
export function itemInfo(data: GameData, id: string, o: { rot?: number; price?: number; sale?: boolean } = {}): HTMLElement {
  const def = data.items.get(id)!;
  const r = recipeLines(data, id);
  const lines = describeItem(def, data);
  const price = o.price !== undefined ? `${o.price} gold${o.sale ? " (SALE)" : ""}` : def.rarity === "artifact" ? "free pick" : def.crafted ? "crafted" : `${def.cost} gold`;
  const hero = def.hero ? data.heroes.get(def.hero)?.name ?? def.hero : null;
  return h("div", { class: "info" },
    h("div", { class: "info-pic mini" }, pieceEl(data, id, o.rot ?? 0, { stars: true })),
    h("div", { class: "info-body" },
      h("div", { class: "info-head" }, h("b", { class: `name t-${def.isBag ? "bag" : def.rarity}` }, def.name), h("span", { class: `badge b-${def.rarity}` }, def.isBag ? `${cap(def.rarity)} bag` : cap(def.rarity))),
      h("div", { class: "info-meta" },
        def.tags.map((t) => `${tagIcon(t)} ${cap(t)}`).join("  ·  "), `  ·  ${price}  ·  sells for ${sellPrice(data, id)}`,
        hero ? `  ·  ${hero} only` : "", !def.inShop && !def.crafted && def.rarity !== "artifact" ? "  ·  not in the shop" : ""),
      lines.length ? h("ul", { class: "lines" }, ...lines.map((l) => h("li", null, l))) : h("div", { class: "dim" }, def.isBag ? `Holds items on its ${def.size} cell${def.size === 1 ? "" : "s"}.` : "No effect of its own."),
      r.made || r.uses.length ? h("div", { class: "recipes" },
        h("b", null, "Recipes"),
        r.made ? h("div", null, `Made of: ${r.made}`) : null,
        ...r.uses.map((u) => h("div", null, u))) : null,
    ));
}
