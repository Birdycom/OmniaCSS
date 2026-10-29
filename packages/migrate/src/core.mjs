// File: packages/migrate/src/core.mjs
// Bridge to @birdycom/omniacss: the on-demand engine that emits tokens + Omnia-native classes.
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import postcss from "postcss";

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
 *
 * The result comes in two parts, so each can sit in its own cascade layer:
 * - `base`: what styles elements, not classes (Omnia's reset, tokens, @keyframes, @property, @font-face);
 * - `classes`: the rules of the Omnia classes. These are utilities: after the codemod they replace Tailwind-style
 *   classes, so they sort in with those (see nativeRules in postcss.mjs) and beat every reset, as those classes did.
 * `used` is the set of Omnia class names that were kept.
 * @param {{ candidates: Set<string>, compatCss: string, exclude: Set<string>, cwd?: string, mode?: true|"tokens" }} o
 * @returns {Promise<{ base: string, classes: string, used: Set<string> }>}
 */
export async function buildCoreCss({ candidates, compatCss, exclude, cwd, mode = true }) {
  const engine = await loadEngine(cwd);
  const full = mode === true ? await engine.loadFullCss() : await fs.readFile(path.join(engine.DIST, "oc-colors.css"), "utf8");
  const set = new Set();
  if (mode === true) {
    const known = omniaClassNames(full);
    for (const c of candidates) if (known.has(c) && !exclude.has(c)) set.add(c);
  }
  const key = `${mode}|${hash(compatCss)}|${[...set].sort().join(" ")}`;
  if (cache.has(key)) return cache.get(key);
  const parts = { ...splitByClass(engine.generate(full, set, { layer: false, referencedBy: [compatCss] })), used: set };
  cache.clear();
  cache.set(key, parts);
  return parts;
}

/** A selector that targets a class (`.p-1`, `a.link`, `:where(.dark) .x`); attribute values do not count. */
const HAS_CLASS = (selector) => /\.(?:[A-Za-z_-]|\\)/.test(selector.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"|'[^']*'/g, ""));

/** Splits generated CSS into the element/global part and the class part, keeping the at-rules around each rule. */
function splitByClass(css) {
  const root = postcss.parse(css);
  const base = root.clone();
  const classes = root.clone();
  base.walkRules((rule) => { if (!inKeyframes(rule) && HAS_CLASS(rule.selector)) rule.remove(); });
  classes.walkRules((rule) => { if (inKeyframes(rule) || !HAS_CLASS(rule.selector)) rule.remove(); });
  // Only element-free at-rules (@keyframes, @property, @font-face …) belong to the base part.
  classes.walkAtRules((at) => { if (/^(keyframes|-\w+-keyframes|property|font-face|font-feature-values|counter-style|import|charset)$/.test(at.name)) at.remove(); });
  for (const part of [base, classes]) pruneEmpty(part);
  return { base: base.toString().trim(), classes: classes.toString().trim() };
}

const inKeyframes = (node) => { for (let p = node.parent; p; p = p.parent) if (p.type === "atrule" && /keyframes$/.test(p.name)) return true; return false; };

/** Removes at-rules left without rules (innermost first), keeping statement at-rules such as `@layer a, b;`. */
function pruneEmpty(root) {
  let again = true;
  while (again) {
    again = false;
    root.walkAtRules((at) => {
      if (at.nodes && !at.nodes.some((n) => n.type !== "comment")) { at.remove(); again = true; }
    });
  }
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}
