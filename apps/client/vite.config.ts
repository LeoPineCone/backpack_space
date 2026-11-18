import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  base: "./",
  // the app version the backend checks against its minimum version (x-app-version)
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { fs: { allow: ["../.."] }, host: true },
  // one script file: simpler to host and to wrap with Capacitor later
  build: { chunkSizeWarningLimit: 2000, rollupOptions: { output: { inlineDynamicImports: true } } },
});
