// File: packages/migrate/src/bootstrap/migrate.mjs
// Bootstrap -> OmniaCSS: detect the Bootstrap version, rewrite class attributes (utilities to OmniaCSS, components to
// OmniaUI), keep the grid with a generated compat stylesheet, swap the Bootstrap <link>, and report what needs a hand:
// JavaScript components (data-bs-*), icon fonts, legacy classes and classes toggled from JavaScript.
// Dry run unless `write` is true.
// Map: detect version -> class attributes (skip template code) -> convert -> <link> swap -> JS report -> compat CSS
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { walk } from "../extract.mjs";
import { convertClass, loadDeclIndex } from "./convert.mjs";
import { compatCss } from "./compat.mjs";

export const MANIFEST = "omniacss-migrate.bootstrap.json";
export const EXTENSIONS =["blade.php", "php", "html", "htm", "twig", "erb", "njk", "hbs", "vue", "jsx", "tsx", "js"];
const MARKUP = /\.(php|html?|twig|erb|njk|hbs|vue|jsx|tsx)$/;
const IGNORE = new Set(["node_modules", "vendor", ".git", "dist", "build", ".cache", "storage"]);

const CLASS_ATTR = /\b(class|className)\s*=\s*(["'])([\s\S]*?)\2/g;
const TEMPLATE = /<\?[\s\S]*?\?>|\{\{[\s\S]*?\}\}|\{!![\s\S]*?!!\}|\{%[\s\S]*?%\}|\$\{[^}]*\}/g;
const BS_LINK = /<link\b[^>]*href\s*=\s*["'][^"']*bootstrap(?:\.min)?\.css[^"']*["'][^>]*>/gi;
const BS_LINK_LINE = /^([ \t]*)(<link\b[^>]*href\s*=\s*["']([^"']*?)bootstrap(?:\.min)?\.css[^"']*["'][^>]*>)/gim;

/** Classes whose OmniaUI twin depends on the element (<select class="form-control">, <input type="radio" class="form-check-input">). */
const BY_ELEMENT = {
  "form-control": (el) => (el.tag === "select" ? "oc-select" : null),
  "form-check-input": (el) => (/\btype\s*=\s*["']radio["']/i.test(el.attrs) ? "oc-radio" : null),
};

/** Tag name and attribute text of the element whose class attribute starts at `offset`. */
function elementAt(text, offset) {
  const open = text.lastIndexOf("<", offset);
  const close = text.indexOf(">", offset);
  const attrs = text.slice(open, close < 0 ? undefined : close);
  return { tag: (attrs.match(/^<([a-zA-Z][\w-]*)/)?.[1] || "").toLowerCase(), attrs };
}

/**
 * Where the replacement stylesheets go. `dir` is the part of the Bootstrap href before the file name, template code
 * included ("<?php echo ASSETS ?>bootstrap/css/", "assets/css/"); the bootstrap/, dist/ and css/ folders are dropped.
 */
export function linkHrefs(dir, o = {}) {
  const base = /^(https?:)?\/\//.test(dir) ? "" : dir.replace(/(?:bootstrap[^/]*\/)?(?:dist\/)?(?:css\/)?$/, "");
  return [o.omniaHref || `${base}css/omnia.css`, o.omniauiHref || `${base}css/omniaui.css`, o.compatHref || `${base}css/bootstrap-compat.css`];
}
const BS_SCRIPT = /<script\b[^>]*src\s*=\s*["'][^"']*bootstrap(?:\.bundle)?(?:\.min)?\.js[^"']*["'][^>]*>\s*<\/script>/gi;
const DATA_TOGGLE = /\bdata-(?:bs-)?toggle\s*=\s*["']([^"']+)["']/g;
const CLASSLIST = /classList\.(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g;

/** Bootstrap major version: `--bs`, then package.json, a <link> URL, a local bootstrap.css header, then the markup. */
export async function detectVersion(dir, files, texts) {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
    const range = { ...pkg.dependencies, ...pkg.devDependencies }.bootstrap;
    const m = range && String(range).match(/(\d)/);
    if (m) return { version: +m[1], source: "package.json" };
  } catch { /* no package.json */ }
  for (const [file, text] of texts) {
    for (const link of text.match(BS_LINK) || []) {
      const m = link.match(/bootstrap[@/-]v?([345])\.|\/([345])\.\d+\.\d+\//);
      if (m) return { version: +(m[1] || m[2]), source: path.relative(dir, file) };
      const href = link.match(/href\s*=\s*["']([^"']+)["']/)?.[1];
      if (href && !/^(https?:)?\/\//.test(href)) {
        const local = [path.resolve(path.dirname(file), href.split("?")[0]), path.resolve(dir, href.replace(/^\//, "").split("?")[0])];
        for (const p of local) {
          const head = await fs.readFile(p, "utf8").then((t) => t.slice(0, 400)).catch(() => "");
          const h = head.match(/Bootstrap\s+v([345])\./i);
          if (h) return { version: +h[1], source: path.relative(dir, p) };
        }
      }
    }
  }
  const all = [...texts.values()].join("\n");
  if (/data-bs-/.test(all)) return { version: 5, source: "data-bs-* attributes" };
  if (/\bcol-xs-|\bpanel-heading\b|\bglyphicon\b/.test(all)) return { version: 3, source: "Bootstrap 3 class names" };
  return { version: 5, source: "default" };
}

/** Rewrite one class attribute value. Template code (<?php ?>, {{ }}, {% %}) is left untouched. */
function rewriteValue(value, convert, tally) {
  let out = "", last = 0, changed = false;
  const parts = [];
  for (const t of value.matchAll(TEMPLATE)) { parts.push({ text: value.slice(last, t.index), code: false }); parts.push({ text: t[0], code: true }); last = t.index + t[0].length; }
  parts.push({ text: value.slice(last), code: false });
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.code) { out += p.text; continue; }
    const seen = new Set();
    const rebuilt = p.text.replace(/\S+/g, (tok, at) => {
      // a token glued to template code (col-<?= $n ?>) is only half a class: leave it
      const glued = (at === 0 && i > 0) || (at + tok.length === p.text.length && i < parts.length - 1);
      if (glued || !/^-?[A-Za-z][\w-]*$/.test(tok)) return tok;
      const r = convert(tok);
      tally(tok, r);
      if (r.to === undefined) { seen.add(tok); return tok; }
      const words = r.to.split(/\s+/).filter((w) => w && !seen.has(w));
      words.forEach((w) => seen.add(w));
      if (r.to !== tok) changed = true;
      return words.join(" ");
    });
    out += rebuilt.replace(/ {2,}/g, " ");
  }
  if (!changed) return { value, changed };
  // a removed first/last class must not leave a space behind
  if (!/^\s/.test(value)) out = out.trimStart();
  if (!/\s$/.test(value)) out = out.trimEnd();
  return { value: out, changed };
}

/**
 * @param {string} dir project root
 * @param {{ write?: boolean, version?: 3|4|5, breakpoints?: "omnia"|"exact", compatFile?: string,
 *           omniaHref?: string, omniauiHref?: string, compatHref?: string, cwd?: string }} [o]
 */
export async function migrateBootstrap(dir, o = {}) {
  const files = await walk(dir, { extensions: EXTENSIONS, ignore: IGNORE });
  const texts = new Map();
  for (const f of files) texts.set(f, await fs.readFile(f, "utf8").catch(() => ""));
  const detected = o.version ? { version: o.version, source: "--bs" } : await detectVersion(dir, files, texts);
  const ctx = { version: detected.version, breakpoints: o.breakpoints || "omnia", index: loadDeclIndex(o.cwd || dir) };
  // Classes an earlier run produced (mt-1 is OmniaCSS 1rem now, not Bootstrap's 0.25rem): never convert them again.
  const manifestFile = path.join(dir, MANIFEST);
  const done = new Set(JSON.parse(await fs.readFile(manifestFile, "utf8").catch(() => "{}")).produced || []);
  const memo = new Map();
  const convert = (t) => {
    if (!memo.has(t)) memo.set(t, done.has(t) ? { kind: "custom" } : convertClass(t, ctx));
    return memo.get(t);
  };

  const report = {
    dir, write: !!o.write, version: detected.version, versionSource: detected.source, breakpoints: ctx.breakpoints,
    files: [], counts: { utility: 0, component: 0, grid: 0, compat: 0, manual: 0, state: 0, inactive: 0, custom: 0 },
    mapping: new Map(), grid: new Set(), compat: new Map(), manual: new Map(), inactive: new Map(), states: new Map(),
    links: 0, scripts: [], toggles: new Map(), classList: new Map(),
  };
  const bump = (map, key, extra) => { const e = map.get(key) || { n: 0, ...extra }; e.n++; map.set(key, e); };
  const tally = (tok, r) => {
    if (r.kind === "unmapped") { report.counts.compat++; bump(report.compat, tok); return; }
    report.counts[r.kind]++;
    if (r.kind === "grid") report.grid.add(tok);
    if (r.kind === "manual") {
      bump(report.manual, r.hint, { examples: new Set() });
      report.manual.get(r.hint).examples.add(tok);
    }
    if (r.kind === "inactive") bump(report.inactive, tok);
    if (r.kind === "state") bump(report.states, tok);
    if ((r.kind === "utility" || r.kind === "component") && r.to !== tok) report.mapping.set(tok, r.to);
  };
  for (const [file, text] of texts) {
    let out = text, edits = 0;
    if (MARKUP.test(file)) {
      out = out.replace(CLASS_ATTR, (all, attr, q, value, offset) => {
        const el = elementAt(text, offset);
        const convertForEdit = (t) => {
          const special = BY_ELEMENT[t]?.(el);
          if (special) return { kind: "component", to: special };
          // "unmapped" classes keep their name: the compat stylesheet serves them
          const r = convert(t);
          return r.kind === "unmapped" ? { ...r, to: undefined } : r;
        };
        const r = rewriteValue(value, convertForEdit, tally);
        if (!r.changed) return all;
        edits++;
        return `${attr}=${q}${r.value}${q}`;
      });
      out = out.replace(BS_LINK_LINE, (all, indent, link, href) => {
        report.links++; edits++;
        const hrefs = linkHrefs(href, o);
        report.hrefs = hrefs;
        const lines = hrefs.map((h) => `${indent}<link rel="stylesheet" href="${h}">`);
        return `${indent}<!-- omniacss-migrate: was ${link.replace(/--/g, "- -")} -->\n${lines.join("\n")}`;
      });
      for (const s of text.match(BS_SCRIPT) || []) report.scripts.push(path.relative(dir, file));
      for (const t of text.matchAll(DATA_TOGGLE)) bump(report.toggles, t[1]);
    }
    for (const c of text.matchAll(CLASSLIST)) {
      for (const s of c[1].matchAll(/["']([\w-]+)["']/g)) {
        const r = convert(s[1]);
        if (r.kind === "utility" || r.kind === "component") bump(report.classList, `${s[1]} -> ${r.to || "(removed)"}`, { file: path.relative(dir, file) });
      }
    }
    if (out !== text) {
      report.files.push({ file: path.relative(dir, file), edits });
      if (o.write) await fs.writeFile(file, out);
    }
  }

  // Older-Bootstrap classes: does the project's own CSS still style them? (then they stay useful)
  const ownCss = (await Promise.all((await walk(dir, { extensions: ["css", "scss"], ignore: IGNORE }))
    .filter((f) => !/bootstrap/i.test(path.basename(f)) && !/\.min\.css$/.test(f)) // own CSS, not Bootstrap or minified vendor files
    .map((f) => fs.readFile(f, "utf8").catch(() => "")))).join("\n");
  for (const [cls, e] of report.inactive) e.styled = new RegExp(`\\.${cls}(?![\\w-])`).test(ownCss);

  if (o.write && report.mapping.size) {
    for (const to of report.mapping.values()) for (const w of to.split(/\s+/)) if (w) done.add(w);
    await fs.writeFile(manifestFile, JSON.stringify({ note: "Written by omniacss-migrate bootstrap: classes it produced, skipped on later runs.", version: report.version, produced: [...done].sort() }, null, 1) + "\n");
  }

  report.compatCss = report.grid.size || report.compat.size ? compatCss(report.grid, report.compat.keys(), ctx) : "";
  if (o.write && report.compatCss) {
    report.compatFile = path.resolve(dir, o.compatFile || "bootstrap-compat.css");
    await fs.writeFile(report.compatFile, report.compatCss);
  }
  return report;
}

const top = (map, n) => [...map.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, n);

export function formatBootstrap(r, { top: n = 25 } = {}) {
  const c = r.counts;
  const total = Object.values(c).reduce((a, b) => a + b, 0) - c.custom;
  const L = [];
  L.push(`Bootstrap ${r.version} (${r.versionSource}), breakpoints: ${r.breakpoints}`);
  L.push(`${r.write ? "Changed" : "Dry run, would change"} ${r.files.length} files under ${r.dir}`);
  for (const f of r.files.slice(0, 15)) L.push(`  ${f.file}  (${f.edits})`);
  if (r.files.length > 15) L.push(`  ... and ${r.files.length - 15} more files`);
  L.push("", `Bootstrap class occurrences: ${total}`);
  L.push(`  ${String(c.utility).padStart(5)}  utilities -> OmniaCSS`);
  L.push(`  ${String(c.component).padStart(5)}  components -> OmniaUI (needs @birdycom/omniaui CSS)`);
  L.push(`  ${String(c.grid).padStart(5)}  grid classes kept (served by the compat stylesheet)`);
  L.push(`  ${String(c.compat).padStart(5)}  utilities without an OmniaCSS twin kept (served by the compat stylesheet)`);
  L.push(`  ${String(c.manual).padStart(5)}  need a manual step (JavaScript components, icon fonts)`);
  L.push(`  ${String(c.inactive).padStart(5)}  older-Bootstrap classes that do nothing in Bootstrap ${r.version} (left as they are)`);
  L.push(`  ${String(c.state).padStart(5)}  state classes toggled by JavaScript (active, show, …) left as they are`);
  if (r.mapping.size) {
    L.push("", "Examples of the rewrite:");
    for (const [from, to] of [...r.mapping].slice(0, n)) L.push(`  ${from.padEnd(28)} -> ${to || "(removed)"}`);
  }
  if (r.compat.size) L.push("", `Kept with compat CSS: ${top(r.compat, n).map(([k, v]) => `${k} (${v.n})`).join(", ")}`);
  if (r.manual.size) {
    L.push("", "Manual steps:");
    for (const [hint, v] of top(r.manual, n)) L.push(`  ${String(v.n).padStart(4)}  ${[...v.examples].slice(0, 4).join(", ")}\n        ${hint}`);
  }
  if (r.toggles.size) L.push("", `data-(bs-)toggle in the markup: ${top(r.toggles, n).map(([k, v]) => `${k} (${v.n})`).join(", ")} — Bootstrap's JavaScript still drives these until they are rebuilt natively.`);
  if (r.scripts.length) L.push(`Bootstrap JavaScript is loaded in: ${[...new Set(r.scripts)].join(", ")}. Remove it once no data-bs-toggle is left.`);
  if (r.classList.size) {
    L.push("", "JavaScript toggles Bootstrap classes that the markup now spells differently — update these by hand:");
    for (const [k, v] of top(r.classList, n)) L.push(`  ${v.file}: ${k}`);
  }
  if (r.inactive.size) {
    const list = (styled) => top(new Map([...r.inactive].filter(([, v]) => !!v.styled === styled)), n).map(([k, v]) => `${k} (${v.n})`).join(", ");
    const styled = list(true), unused = list(false);
    if (styled) L.push("", `Older-Bootstrap classes your own CSS still styles (kept): ${styled}`);
    if (unused) L.push("", `Older-Bootstrap classes nothing styles (safe to delete): ${unused}`);
  }
  if (r.links) {
    L.push("", `Replaced ${r.links} Bootstrap <link>(s). Put the three stylesheets where the new links point:`);
    L.push(`  ${r.hrefs[0]}   npx omniacss build -o <that path>   (only the classes you use; md:flex and other variants are generated on demand)`);
    L.push(`  ${r.hrefs[1]}   the OmniaUI component CSS (@birdycom/omniaui)`);
    L.push(`  ${r.hrefs[2]}   the compat stylesheet below`);
  } else {
    L.push("", "No Bootstrap <link> found (bundler or CDN in a template?): include omnia.css (npx omniacss build), the OmniaUI CSS and the compat stylesheet yourself.");
  }
  if (r.compatFile) L.push(`Wrote ${r.compatFile}`);
  else if (r.compatCss) L.push(`A compat stylesheet of ${(r.compatCss.length / 1024).toFixed(1)} KB will be written (bootstrap-compat.css).`);
  if (!r.write) L.push("", "Run again with --write to apply.");
  return L.join("\n");
}
