// One ESLint setup for every workspace (root src/, packages/*, apps/*, playground/).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

const nodeModules = ["fs", "path", "os", "child_process", "crypto", "url", "util", "process", "worker_threads", "module", "stream", "buffer"];

export default tseslint.config(
  { ignores: ["**/node_modules/**", "out/**", "dist/**", "apps/client/android/**", "apps/client/ios/**", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      // style rules that flag working code; not worth churn
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
    },
  },
  {
    // The core is deterministic and runs in the client and on the server (CLAUDE.md):
    // no Math.random, no clock reads, no Node APIs.
    files: ["packages/core/src/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "The core is deterministic: use Rng with a seed." },
        { object: "Date", property: "now", message: "The core reads no clock: pass the time in." },
        { object: "performance", property: "now", message: "The core reads no clock: pass the time in." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "The core reads no clock: pass the time in." },
        { selector: "Identifier[name='process']", message: "The core runs in the client too: no Node APIs." },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["node:*"], message: "The core runs in the client too: Node helpers go to packages/core/node/." }],
          paths: nodeModules.map((name) => ({ name, message: "The core runs in the client too: Node helpers go to packages/core/node/." })),
        },
      ],
    },
  },
  prettier,
);
