import { expect, test, type Page } from "@playwright/test";

/**
 * QA-05 browser runs 1 to 3 against the local backend (playwright.runs.config.ts). Every run signs in as its own
 * development player, so the engines and runs never share a server run. The runs wait for visible buttons, never
 * for a fixed time, and accept a won and a lost fight alike.
 */

interface Target {
  name: string;
  x: number;
  y: number;
}
interface Probe {
  online: boolean;
  runId: string | null;
  round: number | null;
  fought: number | null;
}

/** The buttons on screen, as the client's dev tools list them (apps/client/src/devtools.ts). */
const targets = (page: Page) => page.evaluate(() => (window as unknown as { __tapTargets?: () => Target[] }).__tapTargets?.() ?? []);

const probe = (page: Page) =>
  page.evaluate((): Probe => {
    const g = (window as unknown as { __game?: { isOnline: boolean; runId: string | null; run: { round: number; results: unknown[] } | null } }).__game;
    return { online: !!g?.isOnline, runId: g?.runId ?? null, round: g?.run?.round ?? null, fought: g?.run?.results.length ?? null };
  });

/** Waits until a button with this name shows, then taps it where it is on the page. */
async function tap(page: Page, name: string, timeout = 30_000): Promise<void> {
  let found: Target | undefined;
  await expect
    .poll(
      async () => {
        found = (await targets(page)).find((t) => t.name === name);
        return !!found;
      },
      { timeout, message: `button "${name}"` },
    )
    .toBe(true);
  await page.mouse.click(found!.x, found!.y);
}

async function shows(page: Page, name: string, timeout = 30_000): Promise<void> {
  await expect.poll(async () => (await targets(page)).some((t) => t.name === name), { timeout, message: `button "${name}"` }).toBe(true);
}

/** Opens the app as a fresh development player, without the first-run introduction. */
async function open(page: Page, player: string): Promise<void> {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e.started")) {
      localStorage.clear();
      localStorage.setItem("backpack-space.intro", "1");
      sessionStorage.setItem("e2e.started", "1");
    }
  });
  await page.goto(`/?player=${player}`);
  await shows(page, "FIGHT", 60_000);
  expect((await probe(page)).online).toBe(true);
}

/** From the start screen through the hero choice into the shop of round 1; the server hands out the run. */
async function startRun(page: Page): Promise<void> {
  await tap(page, "FIGHT");
  await tap(page, "START");
  await expect.poll(async () => (await probe(page)).round).toBe(1);
  expect((await probe(page)).runId).toBeTruthy();
}

const player = (name: string, browser: string) => `e2e-${browser}-${name}-${Date.now().toString(36)}`;

test("1: the app starts online to the start screen", async ({ page, browserName }) => {
  await open(page, player("start", browserName));
  expect(await probe(page)).toMatchObject({ online: true, runId: null, round: null });
});

test("2: one whole round: shop, fight from the server, result, next shop", async ({ page, browserName }) => {
  await open(page, player("round", browserName));
  await startRun(page);
  const runId = (await probe(page)).runId;
  // FIGHT in the shop: the server picks the opponent and decides; the fight is played back
  await tap(page, "FIGHT");
  await tap(page, "×4", 30_000);
  await tap(page, "CONTINUE", 120_000);
  await expect.poll(async () => (await probe(page)).round).toBe(2);
  expect(await probe(page)).toMatchObject({ runId, fought: 1 });
  await shows(page, "FIGHT");
  // the server holds the same run: after a reload the copy on this device continues in round 2
  await page.reload();
  await expect.poll(async () => (await probe(page)).round, { timeout: 60_000 }).toBe(2);
  expect((await probe(page)).runId).toBe(runId);
});

test("3: the end of a run is booked by the server", async ({ page, browserName }) => {
  await open(page, player("end", browserName));
  await startRun(page);
  await tap(page, "menu");
  await tap(page, "GIVE UP");
  await tap(page, "TAP AGAIN TO GIVE UP");
  await shows(page, "NEW RUN", 30_000);
  expect((await probe(page)).runId).toBeNull();
  // nothing is open on the server any more: the start screen offers a new fight, not CONTINUE
  await page.reload();
  await shows(page, "FIGHT", 60_000);
  expect((await probe(page)).round).toBeNull();
});
