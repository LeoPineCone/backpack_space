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
  overlays: number;
}

/** The buttons on screen, as the client's dev tools list them (apps/client/src/devtools.ts). */
const targets = (page: Page) => page.evaluate(() => (window as unknown as { __tapTargets?: () => Target[] }).__tapTargets?.() ?? []);

const probe = (page: Page) =>
  page.evaluate((): Probe => {
    const g = (
      window as unknown as {
        __game?: { isOnline: boolean; runId: string | null; run: { round: number; results: unknown[] } | null; overlays?: unknown[] };
      }
    ).__game;
    return {
      online: !!g?.isOnline,
      runId: g?.runId ?? null,
      round: g?.run?.round ?? null,
      fought: g?.run?.results.length ?? null,
      overlays: g?.overlays?.length ?? 0,
    };
  });

/** Waits until a button with this name shows, then taps it where it is on the page. */
async function tap(page: Page, name: string, timeout = 30_000): Promise<void> {
  await shows(page, name, timeout);
  // Pixi hit-tests with the transforms of the last drawn frame: a button that just appeared is tappable once a frame
  // has been drawn with it (a finger is never that fast; a slow engine in CI is)
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const found = (await targets(page)).find((t) => t.name === name)!;
  (requests.get(page) ?? []).push(`tap ${name} at ${Math.round(found.x)},${Math.round(found.y)}`);
  await page.mouse.click(found.x, found.y);
}

/** Waits until `check` holds; a failure lists what is on screen, the run state and the backend requests. */
async function until(page: Page, what: string, check: (seen: string[], state: Probe) => boolean, timeout = 30_000): Promise<void> {
  let seen: string[] = [];
  let state: Probe | null = null;
  await expect
    .poll(
      async () => {
        seen = (await targets(page)).map((t) => t.name);
        state = await probe(page);
        return check(seen, state);
      },
      { timeout, message: what },
    )
    .toBe(true)
    .catch(async (e: Error) => {
      const events = await page.evaluate(() => (window as unknown as { __events?: string[] }).__events?.slice(-24) ?? []);
      throw new Error(
        [
          e.message,
          `on screen: ${JSON.stringify(seen)}`,
          `state: ${JSON.stringify(state)}`,
          `requests and taps: ${JSON.stringify(requests.get(page) ?? [])}`,
          `pointer events: ${JSON.stringify(events)}`,
        ].join("\n"),
      );
    });
}

const shows = (page: Page, name: string, timeout?: number) => until(page, `button "${name}"`, (seen) => seen.includes(name), timeout);
const inRound = (page: Page, round: number, timeout?: number) => until(page, `round ${round}`, (_, s) => s.round === round, timeout);

/** The backend requests of each page with their outcome, for the failure message. */
const requests = new WeakMap<Page, string[]>();

/** Opens the app as a fresh development player, without the first-run introduction. */
async function open(page: Page, player: string): Promise<void> {
  const log: string[] = [];
  requests.set(page, log);
  page.on("response", (r) => {
    if (r.url().includes(":3100/")) log.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`);
  });
  page.on("requestfailed", (r) => log.push(`${r.method()} ${r.url()} failed: ${r.failure()?.errorText ?? "?"}`));
  await page.addInitScript(() => {
    // the pointer events the page receives, for the failure message
    const events: string[] = [];
    Object.assign(window, { __events: events });
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click"])
      window.addEventListener(type, (e) => events.push(`${type} ${Math.round((e as MouseEvent).clientX)},${Math.round((e as MouseEvent).clientY)}`), {
        capture: true,
      });
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
  await inRound(page, 1);
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
  await inRound(page, 2);
  expect(await probe(page)).toMatchObject({ runId, fought: 1 });
  await shows(page, "FIGHT");
  // the server holds the same run: after a reload the copy on this device continues in round 2
  await page.reload();
  await inRound(page, 2, 60_000);
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
