import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "@backpack-space/core/node";

const client = join(ROOT, "apps", "client");
const html = readFileSync(join(client, "index.html"), "utf8");
const css = readFileSync(join(client, "src", "fonts.css"), "utf8");
const theme = JSON.parse(readFileSync(join(ROOT, "data", "theme.json"), "utf8")) as { fonts: Record<string, string> };

// UX-05: the client shows its fonts without network and asks no other server for them.
describe("client fonts", () => {
  it("loads no font from another server", () => {
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(html).not.toMatch(/<link[^>]+(preconnect|stylesheet)[^>]+https?:/);
    expect(css).not.toMatch(/url\(["']?https?:/);
  });

  it("bundles every font file it declares, with its licence", () => {
    const files = [...css.matchAll(/url\("\.\/(fonts\/[^"]+)"\)/g)].map((m) => m[1]!);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(existsSync(join(client, "src", f)), f).toBe(true);
    for (const family of new Set([...css.matchAll(/font-family: "([^"]+)"/g)].map((m) => m[1]!))) {
      const licence = join(client, "src", "fonts", `${family.toLowerCase().replace(/ /g, "-")}-OFL.txt`);
      expect(existsSync(licence), licence).toBe(true);
    }
  });

  it("declares the first font of each theme font stack", () => {
    for (const stack of Object.values(theme.fonts)) {
      const first = stack.split(",")[0]!.trim().replace(/"/g, "");
      expect(css, first).toContain(`font-family: "${first}"`);
    }
  });
});
