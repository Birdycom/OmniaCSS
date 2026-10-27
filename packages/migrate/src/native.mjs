// File: packages/migrate/src/native.mjs
// Codemod brain: find the native OmniaCSS class that has exactly the same declarations as a Tailwind-style class.
// The index is read from the shipped @birdycom/omniacss CSS, so it always matches the installed version.
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseToken, resolveToken } from "./resolve.mjs";
import { esc } from "./variants.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function findOmniaCss(cwd) {
  const tries = [
    () => createRequire(path.join(cwd, "package.json")).resolve("@birdycom/omniacss/dist/omnia.css"),
    () => createRequire(import.meta.url).resolve("@birdycom/omniacss/dist/omnia.css"),
    () => path.resolve(here, "../../core/dist/omnia.css"),
  ];
  for (const t of tries) { try { const p = t(); if (fs.existsSync(p)) return p; } catch { /* next */ } }
  throw new Error("@birdycom/omniacss-migrate: cannot find @birdycom/omniacss/dist/omnia.css (npm install @birdycom/omniacss)");
}

const normDecls = (body) =>
  body.replace(/\/\*[\s\S]*?\*\//g, "").split(";").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean).map((s) => s.replace(/\s*:\s*/, ":")).join(";");

let cached;

/** Index of Omnia's own classes: declarations -> class names, plus the set of every class name. */
export function loadOmniaIndex(cwd = process.cwd()) {
  const file = findOmniaCss(cwd);
  if (cached?.file === file) return cached;
  const css = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const names = new Set();
  for (const m of css.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) names.add(m[1].replace(/\\(.)/g, "$1"));
  const byDecls = new Map();
  for (const m of css.matchAll(/^\.((?:\\.|[A-Za-z0-9_-])+) \{\n([^}]*)\}/gm)) {
    const name = m[1].replace(/\\(.)/g, "$1");
    const key = normDecls(m[2]);
    if (!key) continue;
    const list = byDecls.get(key) || [];
    if (!list.includes(name)) list.push(name);
    byDecls.set(key, list);
  }
  cached = { file, names, byDecls };
  return cached;
}

const SAFE_VARIANTS = new Set(["sm", "md", "lg", "dark", "hover", "focus", "active", "focus-visible", "focus-within", "disabled", "group-hover", "first", "last", "odd", "even"]);

/**
 * Native Omnia class for a Tailwind-style token, or null.
 * @returns {{ native: string } | { collision: true } | null}
 */
export function nativeFor(token, ctx, index) {
  const p = parseToken(token, ctx);
  if (p.foreign || p.important || !p.body) return null;
  if (!p.variants.every((v) => SAFE_VARIANTS.has(v))) return null;
  const r = resolveToken(p.neg ? "-" + p.utility : p.utility, ctx);
  if (!r || r.marker) return r?.marker ? { native: token } : null;
  if (r.rules.length !== 1 || r.rules[0].media.length || r.rules[0].selectors.length !== 1) return null;
  const rule = r.rules[0];
  if (rule.selectors[0] !== `.${esc(p.neg ? "-" + p.utility : p.utility)}`) return null;
  const key = rule.decls.map(([k, v]) => `${k}:${v.replace(/\s+/g, " ")}`).join(";");
  const list = index.byDecls.get(normDecls(key));
  if (!list) return index.names.has(p.utility) ? { collision: true } : null;
  const base = list.includes(p.utility) ? p.utility : [...list].sort((a, b) => a.length - b.length)[0];
  const native = p.variants.length ? `${p.variants.join(":")}:${base}` : base;
  if (p.variants.length && !index.names.has(native)) return null;
  return { native };
}
