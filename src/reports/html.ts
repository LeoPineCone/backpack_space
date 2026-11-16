/**
 * Static HTML pages for the balancing reports: every report run also writes <name>.html (tables, heatmaps,
 * charts per round, target lights) and <name>.json next to its text, and an index.html that links all reports
 * found in that folder. Plain HTML with inline SVG and CSS: opens from disk in any browser, no server, no scripts.
 */

export type Cell = string | number;

/** Colours the cells of a table by how far their number lies from `center` (diverging blue / red, grey in the middle). */
export interface Heat {
  center: number;
  /** distance from the centre at which the colour is full */
  span: number;
  /** columns to colour (index in the row, 0 = first column); default: all but the first */
  cols?: number[];
  /** true: values above the centre are bad (red) instead of good (blue) */
  highIsBad?: boolean;
}

export interface Series { name: string; values: (number | null)[] }
export interface Chart {
  /** line: one line per series. bar: grouped bars. stack: bars of the series stacked to 100 % per x. */
  type: "line" | "bar" | "stack";
  title: string;
  x: (string | number)[];
  xLabel?: string;
  series: Series[];
  /** "%" for shares given in percent (0–100), "s" for seconds, "" for plain numbers */
  unit?: "%" | "s" | "";
  /** target zone drawn as a band (same unit as the values) */
  band?: { min?: number; max?: number };
  /** a reference line, e.g. 50 % */
  ref?: number;
  yMin?: number;
  yMax?: number;
}

/** A cell checked against a target: "ok" gets a green frame and ✓, "off" a red frame and ✗, "" nothing. */
export type Mark = "ok" | "off" | "";

export interface TargetResult { ok: boolean; what: string; want: string; got: string }

export type Block =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "table"; head: string[]; rows: Cell[][]; heat?: Heat; marks?: Mark[][] }
  | { kind: "chart"; chart: Chart }
  | { kind: "target"; target: TargetResult };

export interface ReportPage {
  kind: "backpack-space-report";
  id: string;
  title: string;
  question: string;
  /** the header lines after the question (accuracy, bots, game data) */
  meta: string[];
  accuracy: string;
  seed: number;
  seconds: number;
  /** ISO time of the run */
  written: string;
  /** file name of the text version next to the page, if any */
  text?: string;
  blocks: Block[];
  /** measured numbers by key, for comparing a later run with this one (--baseline) */
  values?: Record<string, number[]>;
}

const esc = (s: Cell) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** first number in a cell, NaN if there is none ("54 % ±4" → 54, "+3.5" → 3.5, "-" → NaN) */
export const cellNumber = (c: Cell): number => { if (typeof c === "number") return c; const m = /[-+−]?\d+(\.\d+)?/.exec(c); return m ? Number(m[0].replace("−", "-")) : NaN; };
const fmt = (v: number, unit = "") => `${Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}${unit === "%" ? " %" : unit === "s" ? " s" : ""}`;

const STYLE = `
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10);
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300; --s7: #6250d6; --s8: #e34948;
  --pos: #86b6ef; --neg: #f19a99; --mid: #f0efec; --band: rgba(12,163,12,0.10);
  --good: #0ca30c; --good-ink: #006300; --bad: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #0ca30c; --s7: #9085e9; --s8: #e66767;
    --pos: #1c5cab; --neg: #9b3434; --mid: #383835; --band: rgba(12,163,12,0.16);
    --good-ink: #0ca30c; --bad: #e66767;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
a { color: var(--s1); }
h1 { font-size: 26px; margin: 8px 0 4px; }
h2 { font-size: 19px; margin: 36px 0 8px; padding-top: 12px; border-top: 1px solid var(--grid); }
p { margin: 6px 0; max-width: 80ch; }
p.indent { margin-left: 16px; }
.question { font-size: 17px; color: var(--ink2); margin-bottom: 12px; }
.meta { color: var(--muted); font-size: 13px; }
.meta p { margin: 2px 0; }
nav.top { font-size: 14px; margin-bottom: 8px; }
.card { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
th, td { padding: 4px 10px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--grid); }
th { color: var(--ink2); font-weight: 600; position: sticky; top: 0; background: var(--surface); }
th:first-child, td:first-child { text-align: left; }
tbody tr:hover td { outline: 1px solid var(--axis); outline-offset: -1px; }
td.heat { border: 2px solid var(--surface); border-radius: 4px; }
td.mark-ok, td.mark-off { font-weight: 700; }
td.mark-ok { box-shadow: inset 0 0 0 2px var(--good); color: var(--good-ink); }
td.mark-off { box-shadow: inset 0 0 0 2px var(--bad); color: var(--bad); }
td .sym { margin-left: 4px; }
th small { display: block; font-weight: 400; color: var(--good-ink); }
.targets { display: grid; gap: 8px; }
.target { display: flex; gap: 12px; align-items: baseline; }
.light { flex: none; font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 99px; color: #fff; }
.light.ok { background: var(--good); }
.light.off { background: var(--bad); }
.target .got { color: var(--ink2); }
figure { margin: 0; }
figcaption { font-weight: 600; margin-bottom: 4px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--ink2); margin: 4px 0 6px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
svg { display: block; width: 100%; height: auto; }
svg text { fill: var(--muted); font-size: 11px; font-family: inherit; }
svg text.end { fill: var(--ink2); font-size: 12px; }
.charts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: 0 16px; }
.index-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 12px; }
.index-grid .card { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.index-grid h3 { margin: 0; font-size: 17px; }
.index-grid .card.missing { opacity: 0.6; }
.pill { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--ring); color: var(--ink2); margin-right: 4px; }
.pill.ok { color: var(--good-ink); }
.pill.off { color: var(--bad); }
`;

function page(title: string, body: string): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>${STYLE}</style>\n</head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`;
}

// ---------------------------------------------------------------- tables

function heatStyle(v: number, h: Heat): string {
  if (Number.isNaN(v)) return "";
  const d = (v - h.center) / h.span;
  const t = Math.min(1, Math.abs(d));
  if (t < 0.04) return ` class="heat" style="background: var(--mid)"`;
  const good = d > 0 !== !!h.highIsBad;
  return ` class="heat" style="background: color-mix(in oklab, var(${good ? "--pos" : "--neg"}) ${Math.round(t * 100)}%, var(--mid))"`;
}

/** a header "wins all rounds [target 46–54 %]" shows the bracket as a second, green line */
const headCell = (x: string) => { const m = /^(.*?)\s*\[(target [^\]]+)\]$/.exec(x); return m ? `${esc(m[1]!)}<small>${esc(m[2]!)}</small>` : esc(x); };

function renderTable(head: string[], rows: Cell[][], heat?: Heat, marks?: Mark[][]): string {
  const cols = heat ? new Set(heat.cols ?? head.map((_, i) => i).slice(1)) : new Set<number>();
  const th = head.map((x) => `<th>${headCell(x)}</th>`).join("");
  const td = (c: Cell, i: number, m: Mark | undefined) => {
    if (m) return `<td class="mark-${m}" title="${m === "ok" ? "within target" : "outside target"}">${esc(c)}<span class="sym">${m === "ok" ? "✓" : "✗"}</span></td>`;
    return `<td${heat && cols.has(i) ? heatStyle(cellNumber(c), heat) : ""}>${esc(c)}</td>`;
  };
  const body = rows.map((r, k) => `<tr>${r.map((c, i) => td(c, i, marks?.[k]?.[i])).join("")}</tr>`).join("\n");
  return `<div class="card scroll"><table><thead><tr>${th}</tr></thead><tbody>\n${body}\n</tbody></table></div>`;
}

// ---------------------------------------------------------------- charts

const W = 640, PH = 214, M = { l: 44, r: 16, t: 12 };

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function renderChart(c: Chart): string {
  const unit = c.unit ?? "";
  const all = c.series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
  const stacked = c.type === "stack";
  let lo = stacked ? 0 : Math.min(c.type === "bar" ? 0 : Infinity, ...all, c.band?.min ?? Infinity, c.ref ?? Infinity);
  let hi = stacked ? 100 : Math.max(...all, c.band?.max ?? -Infinity, c.ref ?? -Infinity);
  if (c.type === "line" && lo > 0 && lo < hi * 0.5) lo = 0;
  if (c.yMin !== undefined) lo = c.yMin;
  if (c.yMax !== undefined) hi = c.yMax;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (hi === lo) hi = lo + 1;
  const ticks = niceTicks(lo, hi);
  // keep the edge of a target band visible: one more grid step above it
  const last = ticks[ticks.length - 1]!, step = ticks.length > 1 ? last - ticks[ticks.length - 2]! : 1;
  if (!stacked && c.yMax === undefined && c.band?.max !== undefined && c.band.max >= last - step * 1e-6) ticks.push(Math.round((last + step) * 1e6) / 1e6);
  if (!stacked && c.yMin === undefined && c.band?.min !== undefined && c.band.min <= ticks[0]! + step * 1e-6 && ticks[0]! - step >= 0) ticks.unshift(Math.round((ticks[0]! - step) * 1e6) / 1e6);
  lo = Math.min(lo, ticks[0]!); hi = Math.max(hi, ticks[ticks.length - 1]!);
  const endLabels = c.type === "line" && c.series.length > 1 && c.series.length <= 4;
  const right = endLabels ? 90 : M.r;
  // long category names are written at a slant below the axis
  const longest = Math.max(...c.x.map((x) => String(x).length));
  const slant = longest * 6.2 > (W - M.l - right) / c.x.length;
  const L = slant ? M.l + Math.min(80, longest * 4) : M.l;
  const pw = W - L - right, ph = PH;
  const below = slant ? Math.min(150, longest * 5 + 14) : 34;
  const H = M.t + ph + below + (slant && c.xLabel ? 14 : 0);
  const y = (v: number) => M.t + ph - ((v - lo) / (hi - lo)) * ph;
  const n = c.x.length, slot = pw / n;
  const xc = (i: number) => L + slot * (i + 0.5);
  const parts: string[] = [];
  // band and grid
  if (c.band) {
    const top = y(Math.min(hi, c.band.max ?? hi)), bottom = y(Math.max(lo, c.band.min ?? lo));
    parts.push(`<rect x="${L}" y="${top.toFixed(1)}" width="${pw}" height="${Math.max(0, bottom - top).toFixed(1)}" fill="var(--band)"><title>target ${c.band.min !== undefined ? fmt(c.band.min, unit) : ""}–${c.band.max !== undefined ? fmt(c.band.max, unit) : ""}</title></rect>`);
    parts.push(`<text x="${L + pw - 4}" y="${(top + 12).toFixed(1)}" text-anchor="end" style="fill: var(--good-ink)">target</text>`);
  }
  for (const t of ticks) {
    parts.push(`<line x1="${L}" x2="${L + pw}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${t === 0 ? "var(--axis)" : "var(--grid)"}" stroke-width="1"/>`);
    parts.push(`<text x="${L - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(fmt(t, unit))}</text>`);
  }
  if (c.ref !== undefined) parts.push(`<line x1="${L}" x2="${L + pw}" y1="${y(c.ref).toFixed(1)}" y2="${y(c.ref).toFixed(1)}" stroke="var(--ink2)" stroke-dasharray="4 4" stroke-width="1"/>`);
  const every = slant ? 1 : Math.ceil(n / 14);
  const axisY = M.t + ph;
  c.x.forEach((x, i) => {
    if (i % every !== 0) return;
    parts.push(slant
      ? `<text transform="translate(${xc(i).toFixed(1)},${axisY + 12}) rotate(-40)" text-anchor="end">${esc(x)}</text>`
      : `<text x="${xc(i).toFixed(1)}" y="${axisY + 16}" text-anchor="middle">${esc(x)}</text>`);
  });
  if (c.xLabel) parts.push(`<text x="${L + pw / 2}" y="${H - 4}" text-anchor="middle">${esc(c.xLabel)}</text>`);
  const col = (k: number) => `var(--s${(k % 8) + 1})`;
  const tip = (s: Series, i: number, v: number) => `<title>${esc(s.name)}, ${esc(c.xLabel ?? "")} ${esc(c.x[i]!)}: ${esc(fmt(v, unit))}</title>`;
  if (c.type === "line") {
    c.series.forEach((s, k) => {
      let d = "", pen = false;
      s.values.forEach((v, i) => { if (v === null || !Number.isFinite(v)) { pen = false; return; } d += `${pen ? "L" : "M"}${xc(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      parts.push(`<path d="${d}" fill="none" stroke="${col(k)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
      s.values.forEach((v, i) => { if (v !== null && Number.isFinite(v)) parts.push(`<g><circle cx="${xc(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="10" fill="transparent"/><circle cx="${xc(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${col(k)}" stroke="var(--surface)" stroke-width="2"/>${tip(s, i, v)}</g>`); });
    });
    if (endLabels) {
      const ends = c.series.map((s, k) => { let i = s.values.length - 1; while (i >= 0 && (s.values[i] === null || !Number.isFinite(s.values[i]!))) i--; return { k, name: s.name, at: i >= 0 ? y(s.values[i]!) : NaN }; }).filter((e) => Number.isFinite(e.at)).sort((a, b) => a.at - b.at);
      for (let i = 1; i < ends.length; i++) ends[i]!.at = Math.max(ends[i]!.at, ends[i - 1]!.at + 13);
      for (const e of ends) parts.push(`<text class="end" x="${L + pw + 8}" y="${(e.at + 4).toFixed(1)}">${esc(e.name.length > 13 ? e.name.slice(0, 12) + "…" : e.name)}</text>`);
    }
  } else if (c.type === "bar") {
    const k = c.series.length, gap = 2, bw = Math.max(2, Math.min(28, (slot * 0.75 - gap * (k - 1)) / k));
    c.series.forEach((s, j) => s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      const x0 = xc(i) - (k * bw + (k - 1) * gap) / 2 + j * (bw + gap);
      const base = y(Math.max(lo, Math.min(0, hi)));
      const yy = Math.min(y(v), base), h = Math.max(1, Math.abs(y(v) - base));
      parts.push(`<g><rect x="${x0.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${col(j)}"/>${tip(s, i, v)}</g>`);
    }));
  } else {
    const bw = Math.min(36, slot * 0.7);
    c.x.forEach((_, i) => {
      const total = c.series.reduce((t, s) => t + (s.values[i] ?? 0), 0) || 1;
      let acc = 0;
      c.series.forEach((s, j) => {
        const v = s.values[i] ?? 0;
        if (v <= 0) return;
        const share = (100 * v) / total;
        const y0 = y(acc + share), h = y(acc) - y0;
        parts.push(`<g><rect x="${(xc(i) - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h - 2).toFixed(1)}" rx="2" fill="${col(j)}"/><title>${esc(s.name)}, ${esc(c.xLabel ?? "")} ${esc(c.x[i]!)}: ${esc(fmt(share, "%"))}</title></g>`);
        acc += share;
      });
    });
  }
  const legend = c.series.length > 1 ? `<div class="legend">${c.series.map((s, k) => `<span><i style="background:${col(k)}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  return `<figure class="card"><figcaption>${esc(c.title)}</figcaption>${legend}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">${parts.join("")}</svg></figure>`;
}

// ---------------------------------------------------------------- pages

function renderTargets(ts: TargetResult[]): string {
  return `<div class="card targets">${ts.map((t) => `<div class="target"><span class="light ${t.ok ? "ok" : "off"}">${t.ok ? "✓ OK" : "✗ OFF"}</span><span>${esc(t.what)}<br><span class="got">target ${esc(t.want)}, measured ${esc(t.got)}</span></span></div>`).join("")}</div>`;
}

export function renderReport(r: ReportPage): string {
  const out: string[] = [];
  out.push(`<nav class="top"><a href="index.html">← All reports</a>${r.text ? ` · <a href="${esc(r.text)}">text version</a>` : ""}</nav>`);
  out.push(`<h1>${esc(r.title)}</h1>`);
  out.push(`<p class="question">${esc(r.question)}</p>`);
  out.push(`<div class="meta">${r.meta.map((m) => `<p>${esc(m)}</p>`).join("")}<p>Run ${esc(r.written.slice(0, 16).replace("T", " "))} UTC, ${r.seconds} s.</p></div>`);
  const targets = r.blocks.filter((b): b is Extract<Block, { kind: "target" }> => b.kind === "target").map((b) => b.target);
  if (targets.length) {
    const off = targets.filter((t) => !t.ok).length;
    out.push(`<p><span class="pill ok">✓ ${targets.length - off} OK</span>${off ? `<span class="pill off">✗ ${off} OFF</span>` : ""} <a href="#targets">targets</a></p>`);
  }
  let charts: string[] = [], tgs: TargetResult[] = [], targetsAnchor = false;
  const flush = () => {
    if (charts.length) out.push(`<div class="charts">${charts.join("")}</div>`);
    if (tgs.length) { out.push(`${targetsAnchor ? "" : '<a id="targets"></a>'}${renderTargets(tgs)}`); targetsAnchor = true; }
    charts = []; tgs = [];
  };
  for (const b of r.blocks) {
    if (b.kind === "chart") { if (tgs.length) flush(); charts.push(renderChart(b.chart)); continue; }
    if (b.kind === "target") { if (charts.length) flush(); tgs.push(b.target); continue; }
    flush();
    if (b.kind === "h") out.push(`<h2>${esc(b.text)}</h2>`);
    else if (b.kind === "p") out.push(`<p${b.text.startsWith("  ") ? ' class="indent"' : ""}>${esc(b.text.trim())}</p>`);
    else out.push(renderTable(b.head, b.rows, b.heat, b.marks));
  }
  flush();
  return page(`${r.title} – Backpack Space report`, out.join("\n"));
}

export interface IndexEntry { id: string; file: string; page?: ReportPage }

export function renderIndex(entries: IndexEntry[]): string {
  const cards = entries.map((e) => {
    const r = e.page;
    if (!r) return `<div class="card missing"><h3>${esc(e.id)}</h3><p class="meta">Not run yet: <code>npm run report:${esc(e.id)}</code></p></div>`;
    const ts = r.blocks.filter((b): b is Extract<Block, { kind: "target" }> => b.kind === "target").map((b) => b.target);
    const off = ts.filter((t) => !t.ok).length;
    const pills = ts.length ? `<div><span class="pill ok">✓ ${ts.length - off} OK</span>${off ? `<span class="pill off">✗ ${off} OFF</span>` : ""}</div>` : "";
    return `<div class="card"><h3><a href="${esc(e.file)}">${esc(r.title)}</a></h3><p>${esc(r.question)}</p>${pills}<p class="meta">${esc(r.written.slice(0, 16).replace("T", " "))} UTC · ${esc(r.accuracy)}, seed ${r.seed} · ${r.seconds} s${r.text ? ` · <a href="${esc(r.text)}">text</a>` : ""}</p></div>`;
  });
  const all = entries.flatMap((e) => (e.page ? e.page.blocks.filter((b): b is Extract<Block, { kind: "target" }> => b.kind === "target").map((b) => ({ id: e.id, file: e.file, t: b.target })) : []));
  const offList = all.filter((x) => !x.t.ok);
  const summary = all.length
    ? `<div class="card"><p><span class="pill ok">✓ ${all.length - offList.length} targets OK</span>${offList.length ? `<span class="pill off">✗ ${offList.length} OFF</span>` : ""}</p>${offList.map((x) => `<p>✗ <a href="${esc(x.file)}#targets">${esc(x.id)}</a>: ${esc(x.t.what)} (target ${esc(x.t.want)}, measured ${esc(x.t.got)})</p>`).join("")}</div>`
    : "";
  return page("Backpack Space reports", `<h1>Balancing reports</h1>\n<p class="question">Backpack Space. Every report run writes its page here; targets come from data/sim/targets.json.</p>\n${summary}\n<div class="index-grid">${cards.join("\n")}</div>`);
}
