// File: scripts/sync-omniaui.mjs
// Refreshes the vendored OmniaUI stylesheets that the CSS docs site uses for its shell and demos.
// Map: find ../omniaUI/public/css -> copy oc-components.css, oc-blocks.css, oc-code-syntax.css -> public/css
// Run: "npm run sync:omniaui" (build OmniaUI first: "npm run build" in ../omniaUI).
//
// The files in public/css are committed, so "npm run build" here never needs ../omniaUI.

import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.resolve(root, "../omniaUI/public/css");
const target = path.join(root, "public/css");

// Built site stylesheets of OmniaUI (components incl. docs-ui, blocks, code-block colors).
const FILES = ["oc-components.css", "oc-blocks.css", "oc-code-syntax.css"];

const exists = (p) => fs.stat(p).then(() => true, () => false);

if (!(await exists(source))) {
  console.log(`[sync:omniaui] ${path.relative(root, source)} not found.`);
  console.log("[sync:omniaui] Clone the OmniaUI repo next to this one (../omniaUI) and run \"npm run build\" there.");
  console.log("[sync:omniaui] Nothing changed: the committed copies in public/css are still used.");
  process.exit(0);
}

for (const name of FILES) {
  const from = path.join(source, name);
  if (!(await exists(from))) {
    console.error(`[sync:omniaui] ${name} is missing in ../omniaUI/public/css. Run "npm run build" in ../omniaUI first.`);
    process.exit(1);
  }
  await fs.copyFile(from, path.join(target, name));
  console.log(`[sync:omniaui] ${name} -> public/css/${name}`);
}
console.log("[sync:omniaui] Done. Run \"npm run docs:build\" to rebuild the site CSS (omnia-site.css) and the cache-busting hashes.");
