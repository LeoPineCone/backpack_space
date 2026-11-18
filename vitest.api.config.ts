import { defineConfig } from "vitest/config";

// Level 2 (docs/testing.md): interface tests over HTTP against the local backend and DynamoDB Local.
// The global setup starts both and stops them afterwards; with API_URL set it uses that backend instead.
export default defineConfig({
  test: {
    include: ["apps/backend/test/api/**/*.api.test.ts"],
    globalSetup: ["apps/backend/test/api/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
