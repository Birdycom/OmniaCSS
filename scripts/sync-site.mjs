// scripts/sync-site.mjs
// After "astro build": copy the generated pages into public/ (served by Herd) and build the site's
// utility CSS on demand with @birdycom/omniacss — the docs use exactly the engine they document.
// Map: copy dist HTML -> copy redirect stubs -> search index -> on-demand public/css/omnia-site.css
// Run: "npm run docs:build".

import fs from "node:fs/promises";
import path from "node:path";
import { buildCss } from "../packages/core/src/engine.mjs";
import { buildSearchIndex } from "./lib/search-index.mjs";

const root = process.cwd();
const dist = path.join(root, "apps/docs/dist");
const statics = path.join(root, "apps/docs/static");
const out = path.join(root, "public");

async function copyHtml(from) {
  let n = 0;
  for await (const rel of fs.glob("**/*.html", { cwd: from })) {
    const target = path.join(out, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(from, rel), target);
    n++;
  }
  return n;
}

const pages = await copyHtml(dist);
const redirects = await copyHtml(statics);
console.log(`[site] ${pages} pages + ${redirects} redirects → public/`);

// Search index for the Ctrl K dialog (public/js/oc-docs-v2.js)
const indexed = await buildSearchIndex(dist, path.join(out, "data/search-index.json"), {
  siteName: "OmniaCSS",
  featured: ["/docs/index.html", "/docs/colors/system.html", "/docs/functions/index.html", "/docs/selectors/index.html", "/docs/at-rules/index.html", "/docs/creative/index.html", "/docs/migrate.html"],
});
console.log(`[site] data/search-index.json ${indexed} pages`);

// Site CSS: only the utilities used by the generated pages and the remaining page scripts.
// Tokens (var(--color-…)) used by the component and site stylesheets must stay in the utility build.
const siteSheets = ["oc-components.css", "oc-code-syntax.css", "oc-blocks.css", "omnia_site.css", "oc-docs-shell.css", "oc-docs-v2.css", "oc-layout-module.css"];
const referencedBy = await Promise.all(siteSheets.map((f) => fs.readFile(path.join(out, "css", f), "utf8").catch(() => "")));
const { css, stats } = await buildCss({
  content: ["apps/docs/dist/**/*.html", "public/js/**/*.js"],
  cwd: root,
  layer: false,
  referencedBy,
});
await fs.writeFile(path.join(out, "css/omnia-site.css"), css);
console.log(`[site] css/omnia-site.css ${(stats.outputBytes / 1024).toFixed(0)} KB (full build ${(stats.inputBytes / 1024 / 1024).toFixed(1)} MB)`);
