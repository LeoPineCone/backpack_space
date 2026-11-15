import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { fs: { allow: ["../.."] }, host: true },
  // one script file: simpler to host and to wrap with Capacitor later
  build: { chunkSizeWarningLimit: 2000, rollupOptions: { output: { inlineDynamicImports: true } } },
});
