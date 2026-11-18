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

  it("gives the browser runs the same database image as `npm run db`", () => {
    const workflow = readFileSync(".github/workflows/check.yml", "utf8");
    const compose = readFileSync("apps/backend/local/compose.yaml", "utf8");
    const image = /image:\s*(\S+)/.exec(compose)?.[1];
    expect(image).toBeDefined();
    expect(workflow).toContain(`image: ${image}`);
  });
});
