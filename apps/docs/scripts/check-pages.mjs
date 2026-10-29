// File: apps/docs/scripts/check-pages.mjs
// Checks the built docs (apps/docs/dist/docs/**/*.html) against the standard page layout.
//
// Every docs page about CSS must end with two sections (src/lib/transform.mjs, step 3c' and 3c''):
//   content -> <section> "Browser support" (exactly one, one compat table) -> <section id="source"> "Source & Further Reading".
// It also flags footers that still contain Dutch text (the site is in English),
// and pages that miss a CSS feature they are expected to show in their browser support table.
//
// Usage:  npm run docs:build  &&  node apps/docs/scripts/check-pages.mjs
// Exit code 1 when a check fails, so it can run in CI.
//
// Map: collect pages -> per page: support block + footer + Dutch words + required features -> report

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "docs");

// Same list as NON_CSS_PAGES in src/lib/transform.mjs: these pages have no browser support block.
const NON_CSS_PAGES = new Set(["index.html", "configuration.html", "migrate.html", "editor.html", "css-catalog.html"]);

// Page (relative to dist/docs) -> MDN feature names that must appear in its browser support table.
// The names are matched against the feature labels in the table (the <code> text of each row).
const REQUIRED_FEATURES = {
  "images/index.html": ["object-view-box", "image-set"],
  "lists/index.html": ["@counter-style", "::marker"],
  "svg/index.html": ["paint-order", "vector-effect"],
  "sizing/index.html": ["dvh", "svh", "lvh"],
  "flex-grid/index.html": ["subgrid", "display: contents"],
  "selectors/index.html": [":target", ":focus-visible", ":user-valid", ":user-invalid"],
  "functions/index.html": ["progress()", "sibling-index()", "clamp()"],
  "units/index.html": ["lh", "svh", "dvh"],
  "colors/functions.html": ["alpha()", "color-mix()"],
  "at-rules/index.html": ["@supports", "@layer", "@property"],
};

// Common Dutch words. Two or more in one footer means the text was not translated.
const DUTCH = /\b(de|het|een|zijn|voor|met|niet|deze|wordt|worden|ook|naar|bij|alle)\b/gi;

/** All .html files under a folder (recursive). */
function htmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

/** Checks one page. Returns a list of problems (empty = page is fine). */
function checkPage(rel, html) {
  const problems = [];
  const { document } = parseHTML(html);
  // Redirect stubs (meta refresh) have no content: skip them.
  if (document.querySelector('meta[http-equiv="refresh"]')) return problems;

  // Non-CSS pages (overview, configuration, migrate, catalog) have no footer and no support block.
  if (NON_CSS_PAGES.has(rel)) return problems;

  // The page's own sections (demo sections inside .oc-demo are not counted).
  const sections = [...document.querySelectorAll("section.oc-docs-section")].filter((s) => !s.closest(".oc-demo"));
  const footers = sections.filter((s) => s.id === "source");
  if (footers.length !== 1) problems.push(`${footers.length} source sections (expected 1)`);

  // Exactly one browser support section, directly before the source section.
  const isSupport = (s) => /^browser support$/i.test(s.querySelector(":scope > .oc-section-header > h2")?.textContent.trim() || "");
  const blocks = sections.filter(isSupport);
  if (blocks.length !== 1) problems.push(`${blocks.length} browser support sections (expected 1)`);
  const tables = document.querySelectorAll(".oc-compat");
  if (tables.length !== 1) problems.push(`${tables.length} compat tables (expected 1)`);
  const block = blocks[0];
  if (block && footers[0] && block.nextElementSibling !== footers[0]) {
    problems.push("browser support is not directly above the source section");
  }

  // Footer text in English.
  const footerText = footers[0]?.textContent || "";
  const dutch = [...new Set((footerText.match(DUTCH) || []).map((w) => w.toLowerCase()))];
  if (dutch.length >= 2) problems.push(`footer looks Dutch (${dutch.join(", ")})`);

  // Required features in the support table.
  const labels = [...document.querySelectorAll(".oc-compat__feature")].map((th) => th.textContent.trim());
  for (const feature of REQUIRED_FEATURES[rel] || []) {
    if (!labels.some((l) => l.includes(feature))) problems.push(`browser support misses "${feature}"`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------------------
if (!fs.existsSync(DIST)) {
  console.error(`[check-pages] ${DIST} not found. Run "npm run docs:build" first.`);
  process.exit(1);
}

let failed = 0;
const files = htmlFiles(DIST);
for (const file of files) {
  const rel = path.relative(DIST, file).split(path.sep).join("/");
  const problems = checkPage(rel, fs.readFileSync(file, "utf8"));
  if (problems.length) {
    failed++;
    console.log(`✕ docs/${rel}\n    - ${problems.join("\n    - ")}`);
  }
}
console.log(`[check-pages] ${files.length - failed}/${files.length} pages OK`);
process.exit(failed ? 1 : 0);
