import { expect, test } from "@playwright/test";

// QA-06: the reference fights give the same results in the browser engines as in Node (test/reference-fights.test.ts).
test("reference fights come out as stored", async ({ page }) => {
  await page.goto("/");
  const handle = await page.waitForFunction(() => (window as unknown as { __reference?: unknown }).__reference, undefined, { timeout: 60_000 });
  const result = (await handle.jsonValue()) as { fights: number; problems: string[] };
  expect(result.fights).toBeGreaterThan(0);
  expect(result.problems).toEqual([]);
});
