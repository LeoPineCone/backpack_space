/** Builds the image generation prompt for one item from docs/style.md and data/item-art.json (Node only). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ItemDef } from "@backpack-space/core";
import { ROOT, type ItemArt } from "@backpack-space/core/node";

/** The style part of the prompt base in docs/style.md (everything before its "Background:" sentence, which is meant for hero pictures). */
export function styleBase(): string {
  const md = readFileSync(join(ROOT, "docs", "style.md"), "utf8");
  const section = md.split("## Prompt base for image generation")[1] ?? "";
  const quote = section.split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, "")).join(" ").trim();
  if (!quote) throw new Error("docs/style.md: no prompt base found");
  return quote.split(" Background:")[0]!.trim();
}

/** Width × height of the item's box in backpack cells. */
export function boxOf(it: ItemDef): { w: number; h: number } {
  const cells = it.shape.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? [x, y] : null)).filter((p): p is number[] => p !== null));
  const xs = cells.map((c) => c[0]!), ys = cells.map((c) => c[1]!);
  return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
}

/** Names the cells inside the item's box that are not part of its shape, e.g. "lower right". */
export function emptyCells(it: ItemDef): string[] {
  const rows = it.shape.map((r) => r.replace(/\*/g, "."));
  const ys = rows.map((r, y) => (r.includes("#") ? y : -1)).filter((y) => y >= 0);
  const xs = [...(rows[0] ?? "")].map((_, x) => (rows.some((r) => r[x] === "#") ? x : -1)).filter((x) => x >= 0);
  const [y0, y1, x0, x1] = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)];
  const h = y1 - y0 + 1, w = x1 - x0 + 1;
  const rowName = (y: number) => (h === 1 ? "" : y === 0 ? "top" : y === h - 1 ? (h === 2 ? "lower" : "bottom") : "middle");
  const colName = (x: number) => (w === 1 ? "" : x === 0 ? "left" : x === w - 1 ? "right" : w === 3 ? "middle" : x === 1 ? "inner left" : "inner right");
  const out: string[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (rows[y]![x] !== "#") out.push(`${rowName(y - y0)} ${colName(x - x0)}`.trim());
  return out;
}

export function itemPrompt(it: ItemDef, art: ItemArt, base = styleBase()): string {
  const accent = /Accent: ([a-z ]+)\.$/.exec(art.brief)?.[1] ?? "";
  const { w, h } = boxOf(it);
  const free = emptyCells(it);
  const empty = free.length
    ? ` The shape is not a full rectangle: the ${free.join(" and the ")} ${free.length === 1 ? "cell is not part of the item and stays" : "cells are not part of the item and stay"} plain background; no part of the item, not even a tip, tail, tendril or wing, reaches into ${free.length === 1 ? "it" : "them"}. Fill all other cells right up to their edges.`
    : "";
  return [
    base,
    `Subject: ${it.isBag ? "a bag for a backpack game, seen from above as an open area that other items lie on" : "a single game item icon for a strange, inventive space game"}: ${it.name}. ${art.description} It should feel clearly made in outer space or on a strange alien planet, not like an ordinary earth object or animal.`,
    `Colour: ${accent} as the main accent; everything else in cream, warm grey, teal and copper, with black outlines.`,
    `Composition: the item fills a ${w}:${h} frame (${w}×${h} backpack cells, drawn at 176 px per cell) and must stay readable at 40 px per cell, so bold simple shapes, large flat colour areas, little texture and no fine scratches.${empty}`,
    "Background: perfectly flat, even light grey (#c8c8c8), nothing else, no shadow on the ground, so the item can be cut out cleanly. No text, no letters, no logos, no frame, no stars, no glow.",
  ].join("\n");
}
