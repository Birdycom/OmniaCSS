// File: packages/vscode/src/lib/project.cjs
// What the project of a file runs on: Tailwind class names (Tailwind itself or OmniaCSS's Tailwind compat layer)
// or plain OmniaCSS. In a Tailwind project the unknown-class lints would only be noise.
// Map: file -> nearest package.json (up to the workspace folder) -> dependencies -> engine name or ""
// Author: Serge Cools | Framework: OmniaCSS

"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** Packages that make a project run on Tailwind class names. */
const TAILWIND_ENGINES = ["tailwindcss", "@tailwindcss/vite", "@tailwindcss/postcss", "@birdycom/omniacss-migrate"];

/** package.json -> { mtime, engine }, so a changed package.json is read again. */
const cache = new Map();

/**
 * The Tailwind engine of the project a file belongs to, or "".
 * @param {string} file   absolute path of the document
 * @param {string} [root] workspace folder: the search stops there
 */
function tailwindEngine(file, root) {
  for (let dir = path.dirname(file), n = 0; n < 12; dir = path.dirname(dir), n++) {
    const manifest = path.join(dir, "package.json");
    const stat = fs.statSync(manifest, { throwIfNoEntry: false });
    if (stat) {
      const hit = cache.get(manifest);
      if (hit?.mtime === stat.mtimeMs) return hit.engine;
      let engine = "";
      try {
        const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
        engine = TAILWIND_ENGINES.find((name) => Object.hasOwn(deps, name)) || "";
      } catch { /* unreadable package.json: lint as usual */ }
      cache.set(manifest, { mtime: stat.mtimeMs, engine });
      return engine;
    }
    if ((root && path.resolve(dir) === path.resolve(root)) || path.dirname(dir) === dir) break;
  }
  return "";
}

module.exports = { TAILWIND_ENGINES, tailwindEngine };
