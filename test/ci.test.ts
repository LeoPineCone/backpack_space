import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI workflow", () => {
  it("runs the browser job in the Playwright image of the installed Playwright version", () => {
    const workflow = readFileSync(".github/workflows/check.yml", "utf8");
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as { packages: Record<string, { version?: string }> };
    const installed = lock.packages["node_modules/@playwright/test"]?.version;
    expect(installed).toBeDefined();
    expect(workflow).toContain(`mcr.microsoft.com/playwright:v${installed}-noble`);
  });
});
