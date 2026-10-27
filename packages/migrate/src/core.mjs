// File: packages/migrate/src/core.mjs
// Bridge to @birdycom/omniacss: the on-demand engine that emits tokens + Omnia-native classes.
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let enginePromise;

/** Load @birdycom/omniacss/engine (installed package first, monorepo sibling as fallback). */
export function loadEngine(cwd = process.cwd()) {
  enginePromise ||= (async () => {
    const tries = [
      () => createRequire(path.join(cwd, "package.json")).resolve("@birdycom/omniacss/engine"),
      () => createRequire(import.meta.url).resolve("@birdycom/omniacss/engine"),
      () => path.resolve(here, "../../core/src/engine.mjs"),
    ];
    for (const t of tries) {
      try { const p = t(); await fs.access(p); return await import(pathToFileURL(p).href); } catch { /* next */ }
    }
    throw new Error("@birdycom/omniacss-migrate: cannot find @birdycom/omniacss. Install it with: npm install @birdycom/omniacss");
  })();
  return enginePromise;
}

const cache = new Map();
let classNames, classNamesFor;

/** Every class name that exists in the full Omnia CSS (cached): lets us ignore unrelated words in the content. */
export function omniaClassNames(full) {
  if (classNames && classNamesFor === full.length) return classNames;
  classNames = new Set();
  for (const m of full.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) classNames.add(m[1].replace(/\\(.)/g, "$1"));
  classNamesFor = full.length;
  return classNames;
}

/**
 * Omnia core CSS for a project: tokens (every var(--color-*) the compat output uses) plus the Omnia-native
 * classes found in the content. Classes the compat layer resolves are excluded, so a Tailwind-style `p-4`
 * never collides with Omnia's own `p-4`.
 * @param {{ candidates: Set<string>, compatCss: string, exclude: Set<string>, cwd?: string, layer?: string|false, mode?: true|"tokens" }} o
 */
export async function buildCoreCss({ candidates, compatCss, exclude, cwd, layer = "omnia", mode = true }) {
  const engine = await loadEngine(cwd);
  const full = mode === true ? await engine.loadFullCss() : await fs.readFile(path.join(engine.DIST, "oc-colors.css"), "utf8");
  const set = new Set();
  if (mode === true) {
    const known = omniaClassNames(full);
    for (const c of candidates) if (known.has(c) && !exclude.has(c)) set.add(c);
  }
  const key = `${layer}|${mode}|${hash(compatCss)}|${[...set].sort().join(" ")}`;
  if (cache.has(key)) return cache.get(key);
  const css = engine.generate(full, set, { layer, referencedBy: [compatCss] });
  cache.clear();
  cache.set(key, css);
  return css;
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}
