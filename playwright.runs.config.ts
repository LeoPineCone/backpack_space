import { defineConfig, devices } from "@playwright/test";

/**
 * Browser runs (QA-05, docs/testing.md "Browser runs"): the client in Chromium and WebKit against the local backend
 * on a throwaway database, signed in as development players. Needs Docker, or `TEST_DB_ENDPOINT` (CI).
 */
const backend = "http://127.0.0.1:3100";
export default defineConfig({
  testDir: "e2e",
  testMatch: "runs.e2e.ts",
  forbidOnly: !!process.env.CI,
  retries: 0,
  // a fight is played back in real time; the runs wait for the result screen
  timeout: 180_000,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5181", trace: "off" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      // run directly (not through npm), so the stop signal reaches it and it removes its database container
      command: "npx tsx apps/backend/local/test-server.ts",
      url: `${backend}/config`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    {
      command: "npx vite apps/client --port 5181 --strictPort",
      url: "http://localhost:5181",
      reuseExistingServer: false,
      env: { VITE_BACKEND_URL: backend },
    },
  ],
});
