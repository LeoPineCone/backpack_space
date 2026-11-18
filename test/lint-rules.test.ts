import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

// The lint setup guards the core's design rules (CLAUDE.md): deterministic, no clock, no Node APIs.
const eslint = new ESLint();
const lintCore = async (code: string) => {
  const [result] = await eslint.lintText(code, { filePath: "packages/core/src/lint-probe.ts" });
  return result!.messages.map((m) => m.ruleId);
};

describe("lint rules for the core", () => {
  it("refuses Math.random in the core", async () => {
    expect(await lintCore("export const r = Math.random();\n")).toContain("no-restricted-properties");
  });

  it("refuses clock reads in the core", async () => {
    expect(await lintCore("export const a = Date.now();\n")).toContain("no-restricted-properties");
    expect(await lintCore("export const b = new Date();\n")).toContain("no-restricted-syntax");
  });

  it("refuses Node imports in the core", async () => {
    expect(await lintCore('import { readFileSync } from "fs";\nexport const f = readFileSync;\n')).toContain("no-restricted-imports");
    expect(await lintCore('import { join } from "node:path";\nexport const j = join;\n')).toContain("no-restricted-imports");
  });

  it("accepts plain deterministic core code", async () => {
    expect(await lintCore("export const add = (a: number, b: number): number => a + b;\n")).toEqual([]);
  });

  it("allows Math.random outside the core", async () => {
    const [result] = await eslint.lintText("export const r = Math.random();\n", { filePath: "src/cli/probe.ts" });
    expect(result!.messages).toEqual([]);
  });
});
