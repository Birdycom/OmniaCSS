// File: scripts/sync-omniaui.mjs
// Refreshes the vendored OmniaUI stylesheets that the CSS docs site uses for its shell and demos.
// Map: find ../omniaUI/public/css -> copy the component, block and code sheets and the shared site sheets -> public/css
// Run: "npm run sync:omniaui", also the first step of "npm run docs:build" (build OmniaUI first: "npm run build" in ../omniaUI).
//
// The files in public/css are committed, so "npm run build" here never needs ../omniaUI.

import fs from "node:fs/promises";
import path from "node:path";
import { transform } from "lightningcss";

const root = process.cwd();
const source = path.resolve(root, "../omniaUI/public/css");
const target = path.join(root, "public/css");

// Built site stylesheets of OmniaUI (components incl. docs-ui, blocks, code-block colors) and the site sheets both
// sites share (docs shell, layout, site styles): OmniaUI is their only source, so the two sites never drift apart.
const FILES = ["oc-components.css", "oc-blocks.css", "oc-code-syntax.css", "oc-docs-shell.css", "oc-docs-v2.css", "oc-layout-module.css", "omnia_site.css"];

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
  // Strict parse first: broken CSS (an unclosed comment, a stray brace) must stop the build instead of silently
  // dropping the rule after it in the browser (that once cost the docs their fonts).
  const css = await fs.readFile(from);
  // A comment opened inside another one ends at its "*/", so the text after it becomes a selector that matches
  // nothing (valid CSS, the parser below does not see it); its own "*/" is then left outside any comment.
  // Strings are skipped, so "*/" inside content: "…" is fine.
  const text = css.toString("utf8");
  const stray = (() => {
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"' || c === "'") { const e = text.indexOf(c, i + 1); i = e === -1 ? text.length : e; continue; }
      if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2); if (e === -1) return ["unclosed comment", i]; i = e + 1; continue; }
      if (c === "*" && text[i + 1] === "/") return ['"*/" outside a comment (a comment opened inside another one?)', i];
    }
    return null;
  })();
  if (stray) {
    console.error(`[sync:omniaui] ${name}: ${stray[0]} at line ${text.slice(0, stray[1]).split("\n").length}. Fix it in ../omniaUI/public/css first.`);
    process.exit(1);
  }
  try {
    transform({ filename: name, code: css, errorRecovery: false });
  } catch (err) {
    console.error(`[sync:omniaui] ${name} is not valid CSS (line ${err.loc?.line ?? "?"}): ${err.message}. Fix it in ../omniaUI/public/css first.`);
    process.exit(1);
  }
  await fs.writeFile(path.join(target, name), css);
  console.log(`[sync:omniaui] ${name} -> public/css/${name}`);
}
console.log("[sync:omniaui] Done. Run \"npm run docs:build\" to rebuild the site CSS (omnia-site.css) and the cache-busting hashes.");
