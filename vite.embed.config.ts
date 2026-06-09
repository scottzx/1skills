import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * Library-mode build for 1skills' embed entry.
 *
 * Produces a single self-contained ESM bundle at
 * `dist-embed/skills-embed.js`. The CSS is inlined into the bundle via
 * the `?inline` import suffix in `frontend/src/embed.tsx`, so the
 * consumer (1agents host) only has to load one file.
 *
 * Run with `yarn build:embed` from the 1skills project root.
 */
export default defineConfig({
  root: "frontend",
  plugins: [react()],
  // Library-mode builds do not automatically replace process.env.NODE_ENV
  // the way app-mode builds do. Dependencies like React and react-dom read
  // it at import time, so we must define it explicitly.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "../dist-embed",
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: "esbuild",
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, "frontend/src/embed.tsx"),
      formats: ["es"],
      fileName: () => "skills-embed.js",
    },
    rollupOptions: {
      external: [],
      output: {
        // App.tsx lazy-loads every feature page. For the embed mode the
        // host has no idea where the chunk files live, so we inline all
        // dynamic imports into the single entry chunk. Trade-off: the
        // embed bundle is one ~1.7 MB JS file instead of a small entry
        // + many tiny route chunks. Acceptable for a desktop tool.
        inlineDynamicImports: true,
        // Keep the asset (CSS, fonts) emission off — everything inlined.
      },
    },
  },
});
