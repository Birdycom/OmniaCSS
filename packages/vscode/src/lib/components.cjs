// File: packages/vscode/src/lib/components.cjs
// OmniaUI component and block classes (oc-btn, oc-card, oc-block-…): names plus the CSS rules behind them.
// The free OmniaUI classes ship with the extension (dist/components.json.gz); the project's own installed packages
// (@birdycom/omniaui, -blocks, -pro) override them, so completions always match the version in use and the Pro
// classes appear only in projects that have a Pro licence installed.
// Map: parseSheet(css) -> { class: rules } -> Components (bundled + project) -> names / cssFor / summary
// Author: Serge Cools | Framework: OmniaCSS

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const DIST = path.resolve(__dirname, "../../dist");
const MAX_RULES = 4;
const CLASS = /\.(oc-[A-Za-z0-9_-]+)/g;
// At-rules whose rules apply to elements; the others (@keyframes, @font-face, @property …) hold no class rules.
const GROUPING = /^@(?:media|supports|container|layer|scope|starting-style|document)\b/;

/** Packages looked up in node_modules, with the stylesheet that holds all their classes. */
const PACKAGES = [
  { name: "@birdycom/omniaui", file: "dist/components.css", label: "OmniaUI" },
  { name: "@birdycom/omniaui-blocks", file: "dist/blocks.css", label: "OmniaUI blocks" },
  { name: "@birdycom/omniaui-pro", file: "dist/pro.css", label: "OmniaUI Pro" },
];

/** Removes comments; strings are kept so `content: "/*"` survives. */
function stripComments(css) {
  let out = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      let e = i + 1;
      while (e < css.length && css[e] !== c) e += css[e] === "\\" ? 2 : 1;
      out += css.slice(i, e + 1);
      i = e;
    } else if (c === "/" && css[i + 1] === "*") {
      const e = css.indexOf("*/", i + 2);
      i = e === -1 ? css.length : e + 1;
    } else out += c;
  }
  return out;
}

/** Index of the `}` that closes the block opened at `open`. */
function closing(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") { const e = css.indexOf(c, i + 1); i = e === -1 ? css.length : e; }
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return css.length;
}

/** Declarations split on top-level `;` (not inside url(), strings or functions). */
function declarations(body) {
  const out = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (quote) { if (c === quote && body[i - 1] !== "\\") quote = ""; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === ";" && depth === 0) || i === body.length) {
      const d = body.slice(start, i).trim().replace(/\s+/g, " ");
      if (d) out.push(d);
      start = i + 1;
    }
  }
  return out;
}

/**
 * Every `oc-*` class in a stylesheet with up to MAX_RULES rules each: [atChain[], selector, declarations[]].
 * Rules where the class is a whole selector (`.oc-btn`) come first, then the rest in source order.
 * @returns {Record<string, [string[], string, string[]][]>}
 */
function parseSheet(text) {
  const css = stripComments(text);
  const found = new Map();
  const walk = (from, to, at) => {
    let i = from;
    while (i < to) {
      const open = css.indexOf("{", i);
      const semi = css.indexOf(";", i);
      if (open === -1 || open >= to) return;
      // A statement at-rule (@import …;) before the next block.
      if (semi !== -1 && semi < open && css.slice(i, semi).trim().startsWith("@")) { i = semi + 1; continue; }
      const prelude = css.slice(i, open).trim().replace(/\s+/g, " ");
      const end = closing(css, open);
      if (prelude.startsWith("@")) {
        if (GROUPING.test(prelude)) walk(open + 1, end, [...at, prelude]);
      } else {
        const decls = declarations(css.slice(open + 1, end));
        const names = new Set([...prelude.matchAll(CLASS)].map((m) => m[1]));
        for (const name of names) {
          if (!found.has(name)) found.set(name, []);
          found.get(name).push([at, prelude, decls]);
        }
      }
      i = end + 1;
    }
  };
  walk(0, css.length, []);
  const out = {};
  for (const [name, rules] of found) out[name] = [...rules.filter((r) => isOwn(r, name)), ...rules.filter((r) => !isOwn(r, name))].slice(0, MAX_RULES);
  return out;
}

/** The rule styles the class itself: one of its selectors is exactly `.name`. */
const isOwn = (rule, name) => rule[1].split(",").some((sel) => sel.trim() === "." + name);

/** The OmniaUI packages installed in a folder or one of its parents (monorepos keep node_modules higher up). */
function findPackages(folder) {
  const out = [];
  for (const pkg of PACKAGES) {
    for (let dir = folder, n = 0; dir && n < 4; dir = path.dirname(dir), n++) {
      const base = path.join(dir, "node_modules", pkg.name);
      const file = path.join(base, pkg.file);
      if (fs.existsSync(file)) { out.push({ ...pkg, file, manifest: path.join(base, "package.json") }); break; }
      if (path.dirname(dir) === dir) break;
    }
  }
  return out;
}

function versionOf(manifest) {
  try { return JSON.parse(fs.readFileSync(manifest, "utf8")).version || ""; } catch { return ""; }
}

class Components {
  /** @param {{ label: string, version: string, bundled?: boolean, classes: object }[]} sources  later ones win */
  constructor(sources) {
    this.classes = {};
    this.source = {};
    // A class can appear in several sheets (blocks.css styles `.oc-block-x .oc-btn`): the rules are merged and the
    // sheet with the class's own rule (`.oc-btn { … }`) is named as its origin.
    for (const s of sources) {
      for (const [name, rules] of Object.entries(s.classes)) {
        const prev = this.classes[name];
        if (!prev) { this.classes[name] = rules; this.source[name] = s; continue; }
        const merged = [...prev, ...rules];
        const own = merged.filter((r) => isOwn(r, name));
        this.classes[name] = [...own, ...merged.filter((r) => !isOwn(r, name))].slice(0, MAX_RULES);
        if (!isOwn(prev[0], name) && rules[0] && isOwn(rules[0], name)) this.source[name] = s;
      }
    }
    this.names = Object.keys(this.classes).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  }

  has(name) {
    return Object.hasOwn(this.classes, name);
  }

  /** "OmniaUI 0.12.0" (installed in the project) or "OmniaUI 0.12.0 (bundled)". */
  origin(name) {
    const s = this.source[name];
    return s ? `${s.label}${s.version ? " " + s.version : ""}${s.bundled ? " (bundled)" : ""}` : "";
  }

  cssFor(name) {
    const rules = this.classes[name];
    if (!rules) return null;
    return rules.map(([at, sel, decls]) => {
      let css = `${sel} {\n${decls.map((d) => `  ${d};`).join("\n")}\n}`;
      for (let i = at.length - 1; i >= 0; i--) css = `${at[i]} {\n${css.replace(/^/gm, "  ")}\n}`;
      return css;
    }).join("\n\n");
  }

  /** First declarations of the class's own rule, for completion details. */
  summary(name) {
    const decls = this.classes[name]?.[0]?.[2] || [];
    return decls.length > 2 ? decls.slice(0, 2).join("; ") + "; …" : decls.join("; ");
  }
}

/** The free OmniaUI classes bundled at build time (scripts/build-index.mjs); empty when the file is missing. */
function loadBundled(dist = DIST) {
  try {
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dist, "components.json.gz"))).toString("utf8"));
    return data.sources.map((s) => ({ ...s, bundled: true }));
  } catch {
    return [];
  }
}

/** Sheets read from the project, cached per file and modification time. */
const sheetCache = new Map();
function readInstalled(pkg) {
  const stat = fs.statSync(pkg.file);
  const hit = sheetCache.get(pkg.file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.source;
  const source = { label: pkg.label, version: versionOf(pkg.manifest), classes: parseSheet(fs.readFileSync(pkg.file, "utf8")) };
  sheetCache.set(pkg.file, { mtime: stat.mtimeMs, source });
  return source;
}

/**
 * Bundled classes overlaid with the packages installed in the given folders.
 * A package found in a project replaces the bundled copy with the same label (newer or older version, its classes win).
 */
function loadComponents(folders = [], dist = DIST) {
  const installed = folders.flatMap(findPackages).map(readInstalled);
  const labels = new Set(installed.map((s) => s.label));
  return new Components([...loadBundled(dist).filter((s) => !labels.has(s.label)), ...installed]);
}

module.exports = { PACKAGES, parseSheet, findPackages, loadComponents, Components };
