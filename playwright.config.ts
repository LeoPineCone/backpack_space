import { defineConfig, devices } from "@playwright/test";

/** Browser checks (docs/testing.md, levels 3 and 4): the reference fights (QA-06). The runs against the backend have their own config (playwright.runs.config.ts). */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  testIgnore: "runs.e2e.ts",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5180" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npx vite e2e/reference --port 5180 --strictPort",
    url: "http://localhost:5180",
    reuseExistingServer: !process.env.CI,
  },
});
