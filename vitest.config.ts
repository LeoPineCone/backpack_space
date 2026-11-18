import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Some balance tests play whole bot runs and take several seconds; the 5 s default made them flaky under load.
    testTimeout: 30_000,
    include: ["test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
  },
});
