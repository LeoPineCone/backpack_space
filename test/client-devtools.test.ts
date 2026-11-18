import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { ROOT } from "@backpack-space/core/node";

// UX-06: development helpers are in the dev server and the devtools build, never in the production build.
const out = mkdtempSync(join(tmpdir(), "client-build-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

async function bundle(mode: string): Promise<string> {
  const dir = join(out, mode);
  // Vitest runs with NODE_ENV=test, which Vite would take as a development build; build as `npm run client:build` does
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  await build({ root: join(ROOT, "apps", "client"), mode, logLevel: "silent", build: { outDir: dir, emptyOutDir: true } }).finally(() => {
    process.env.NODE_ENV = env;
  });
  const assets = join(dir, "assets");
  return readdirSync(assets)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(assets, f), "utf8"))
    .join("\n");
}

describe("client development helpers", () => {
  it("are left out of the production build", async () => {
    const js = await bundle("production");
    expect(js).not.toContain("__game");
    expect(js).not.toContain("simVersion ");
    expect(js).not.toMatch(/get\(["'`]safe["'`]\)/);
  });

  it("are in the build made for checks", async () => {
    const js = await bundle("devtools");
    expect(js).toContain("__game");
    expect(js).toMatch(/get\(["'`]safe["'`]\)/);
  });
});
