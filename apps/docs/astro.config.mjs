// File: apps/docs/astro.config.mjs
// Static documentation site. Pages keep their legacy URLs (build.format "preserve").
// Dev: assets (css/js/data/fonts) are served from the repository's public/ folder.
// Build: output to dist/, then scripts/sync-site.mjs copies the HTML into public/ (served by Herd).
import { defineConfig } from "astro/config";

const isDev = process.argv.includes("dev");

export default defineConfig({
  site: "https://omniacss.test",
  outDir: "./dist",
  publicDir: isDev ? "../../public" : "./public-build",
  build: { format: "preserve" },
  compressHTML: false,
  devToolbar: { enabled: false },
});
