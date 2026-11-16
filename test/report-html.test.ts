import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cellNumber, renderReport, type ReportPage } from "../src/reports/html";
import { targetResult, writeReportPage } from "../src/reports/common";

const page = (blocks: ReportPage["blocks"]): ReportPage => ({
  kind: "backpack-space-report", id: "heroes", title: "Heroes", question: "Even <heroes>?", meta: ["Accuracy: quick"],
  accuracy: "quick", seed: 1, seconds: 3, written: "2026-11-15T12:00:00.000Z", blocks,
});

describe("report pages", () => {
  it("reads the number in a table cell", () => {
    expect(cellNumber("54 % ±4")).toBe(54);
    expect(cellNumber("+3.5 pts")).toBe(3.5);
    expect(cellNumber("−2")).toBe(-2);
    expect(cellNumber("-")).toBeNaN();
  });

  it("checks targets", () => {
    expect(targetResult({ min: 0.45, max: 0.55, what: "w" }, [0.47, 0.6], true)).toEqual({ ok: false, what: "w", want: "45 %–55 %", got: "47 %–60 %" });
    expect(targetResult({ max: 45, what: "w" }, [40], false).ok).toBe(true);
    expect(targetResult({ min: 0.48, max: 0.52, what: "w" }, [0.4791], true).ok).toBe(true); // printed as 48 %
    expect(targetResult({ min: 0.02, what: "w", unit: "pts" }, [-0.03, 0.04], true)).toMatchObject({ ok: false, want: "at least +2 pts", got: "−3 pts to +4 pts" });
  });

  it("renders headings, heat tables, charts and target lights as escaped static HTML", () => {
    const html = renderReport(page([
      { kind: "h", text: "Hero against hero" },
      { kind: "table", head: ["", "A", "B"], rows: [["A", "-", "70 %"], ["B", "30 %", "-"]], heat: { center: 50, span: 20 } },
      { kind: "chart", chart: { type: "line", title: "Win share", x: [1, 2, 3], unit: "%", band: { min: 45, max: 55 }, series: [{ name: "A", values: [50, 52, null] }, { name: "B", values: [48, 47, 46] }] } },
      { kind: "chart", chart: { type: "stack", title: "Damage", x: [1], series: [{ name: "weapon", values: [3] }, { name: "burn", values: [1] }] } },
      { kind: "target", target: { ok: false, what: "win share", want: "45 %–55 %", got: "30 %–70 %" } },
    ]));
    expect(html).toContain("Even &lt;heroes&gt;?");
    expect(html).toContain("<h2>Hero against hero</h2>");
    expect(html).toContain("var(--pos) 100%"); // 70 % is a full blue cell
    expect(html).toContain("var(--neg) 100%");
    expect((html.match(/<svg /g) ?? []).length).toBe(2);
    expect(html).toContain("✗ OFF");
    const marked = renderReport(page([{ kind: "table", head: ["path", "wins [target 46–54 %]"], rows: [["A", "58 %"], ["B", "50 %"]], marks: [["", "off"], ["", "ok"]] }]));
    expect(marked).toContain('class="mark-off"');
    expect(marked).toContain('class="mark-ok"');
    expect(marked).toContain("<small>target 46–54 %</small>");
    expect(html).not.toContain("<script");
  });

  it("writes the page and an index that links it and lists reports that never ran", () => {
    const dir = mkdtempSync(join(tmpdir(), "reports-"));
    writeFileSync(join(dir, "other.json"), "{}");
    writeReportPage(dir, "heroes", page([{ kind: "target", target: { ok: true, what: "x", want: "1", got: "1" } }]));
    expect(readFileSync(join(dir, "heroes.html"), "utf8")).toContain("<h1>Heroes</h1>");
    const index = readFileSync(join(dir, "index.html"), "utf8");
    expect(index).toContain('href="heroes.html"');
    expect(index).toContain("npm run report:battles");
    expect(index).toContain("1 targets OK");
  });
});
