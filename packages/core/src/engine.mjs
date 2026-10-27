// File: packages/core/src/engine.mjs
// On-demand OmniaCSS: scan content files for class names and keep only the CSS that is used.
// Map: candidates (scan) -> rule filter -> keyframes -> custom properties (tokens) -> empty at-rules -> layer
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { esc, parseCandidate, rankOf, resolveVariants } from "./variants.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Default location of the full OmniaCSS build shipped with @birdycom/omniacss. */
export const DIST = path.resolve(here, "../dist");

/** Classes that are always kept (state classes toggled by scripts, theme hooks). */
export const ALWAYS_KEEP = ["dark", "is-open", "is-active", "is-expanded", "sr-only"];

const CLASS_IN_SELECTOR = /\.((?:\\.|[A-Za-z0-9_-])+)/g;
const unescape = (s) => s.replace(/\\(.)/g, "$1");

/**
 * Collect every token that could be a class name from the content files.
 * Works for HTML, Blade, Vue, JSX/TSX, PHP, Markdown … (no framework-specific parsing needed).
 * @param {string[]} patterns glob patterns, relative to cwd
 * @param {string} [cwd]
 * @returns {Promise<{ candidates: Set<string>, files: string[] }>}
 */
export async function collectCandidates(patterns, cwd = process.cwd()) {
  const candidates = new Set(ALWAYS_KEEP);
  const files = [];
  for (const pattern of [].concat(patterns)) {
    for await (const rel of fs.glob(pattern, { cwd, exclude: (p) => /node_modules|\.git/.test(p) })) {
      const file = path.resolve(cwd, rel);
      const stat = await fs.stat(file).catch(() => null);
      if (!stat || !stat.isFile()) continue;
      files.push(file);
      addCandidates(await fs.readFile(file, "utf8"), candidates);
    }
  }
  return { candidates, files };
}

/** Split source text into class-like tokens (keeps `:`, `/`, `.` and `%` used in OmniaCSS class names). */
export function addCandidates(text, set = new Set()) {
  const add = (raw) => {
    if (!raw || raw.length > 120) return;
    const token = raw.replace(/^[.:]+|[.:]+$/g, "");
    if (token) set.add(token);
  };
  // Plain tokens (`cq-md:flex`, `w-perc-1/3`) ...
  for (const raw of text.split(/[^A-Za-z0-9_\-:/.%@!]+/)) add(raw);
  // ... and variant tokens with brackets (`has-[img]:flex`, `[&>*]:p-2`, `group-aria-[sort=asc]:x`).
  for (const raw of text.split(/[^A-Za-z0-9_\-:/.%@!\[\]()=&>*~+,#$^|]+/)) if (/[\[\]()=&>*~+,#$^|]/.test(raw)) add(raw);
  return set;
}

/** Classes a selector depends on; classes inside :not()/:where()/:is()/:has() are optional. */
function requiredClasses(selector) {
  const stripped = selector.replace(/:(?:not|where|is|has)\((?:[^()]|\([^()]*\))*\)/g, "");
  return [...stripped.matchAll(CLASS_IN_SELECTOR)].map((m) => unescape(m[1]));
}

/**
 * Generate the used subset of OmniaCSS.
 * @param {string} css full OmniaCSS (with tokens inlined)
 * @param {Set<string>} candidates
 * @param {{ layer?: string|false, keep?: string[], referencedBy?: string[] }} [options]
 *   referencedBy: other stylesheets (components, site CSS) whose var(--…) tokens must stay available.
 */
export function generate(css, candidates, options = {}) {
  const keep = new Set([...(options.keep || []), ...ALWAYS_KEEP]);
  const used = (c) => candidates.has(c) || keep.has(c);
  const root = postcss.parse(css);

  // 0. Variants: hover:, md:, group-hover:, has-[..]:, dark: … derived from the base utility's rules (before the filter removes them).
  const variantRules = deriveVariantRules(root, candidates);

  // 1. Rules: keep selectors whose classes are all used; selectors without classes (:root, html, *) stay.
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    const selectors = rule.selectors.filter((sel) => requiredClasses(sel).every(used));
    if (!selectors.length) rule.remove();
    else if (selectors.length !== rule.selectors.length) rule.selectors = selectors;
  });

  for (const node of variantRules) root.append(node);

  // 2. Keyframes: only those referenced by a remaining animation.
  const animationNames = new Set();
  root.walkDecls(/^animation(-name)?$/, (decl) => decl.value.split(/[\s,]+/).forEach((n) => animationNames.add(n)));
  root.walkAtRules(/keyframes$/i, (at) => {
    if (!animationNames.has(at.params.trim())) at.remove();
  });

  // 3. Custom properties: drop token definitions nobody references (repeat for var() chains).
  //    var(--…) in the content itself (inline styles, <style> blocks) counts as a reference too.
  pruneCustomProperties(root, options.referencedBy || [], [...candidates].filter((c) => c.startsWith("--")));

  // 4. Remove at-rules that became empty (@media, @supports, @container, @layer …).
  let removed;
  do {
    removed = 0;
    root.walkAtRules((at) => {
      if (at.nodes && at.nodes.length === 0) { at.remove(); removed++; }
    });
    root.walkRules((rule) => {
      if (rule.nodes.length === 0) { rule.remove(); removed++; }
    });
  } while (removed);

  // @charset / @import must stay at the very top, outside any @layer block.
  root.walkAtRules("charset", (at) => { at.remove(); });
  const imports = [];
  root.walkAtRules("import", (at) => { imports.push(at.toString() + ";"); at.remove(); });

  let out = root.toString();

  // Web font imports: keep only the families the remaining CSS actually uses (no render-blocking requests for unused fonts).
  for (let i = imports.length - 1; i >= 0; i--) {
    const m = imports[i].match(/fonts\.googleapis\.com\/css2\?([^"')]+)/);
    if (!m) continue;
    const params = m[1].split("&");
    const families = params.filter((p) => p.startsWith("family=")).filter((p) => {
      const name = decodeURIComponent(p.slice(7).split(":")[0]).replace(/\+/g, " ");
      return out.includes(name);
    });
    if (!families.length) imports.splice(i, 1);
    else imports[i] = `@import url("https://fonts.googleapis.com/css2?${[...families, ...params.filter((p) => !p.startsWith("family="))].join("&")}");`;
  }
  if (options.layer) {
    out = `@layer ${options.layer} {\n${out}\n}\n`;
  }
  return (imports.length ? imports.join("\n") + "\n" : "") + out;
}

/** At-rule chain around a rule (outermost first), without keyframes. */
function atChain(rule) {
  const chain = [];
  for (let p = rule.parent; p && p.type === "atrule"; p = p.parent) chain.unshift({ name: p.name, params: p.params });
  return chain;
}

/** Replace the (top-level) class `.base` in a selector by `target`. */
function replaceClass(sel, base, target) {
  for (const m of sel.matchAll(CLASS_IN_SELECTOR)) {
    if (unescape(m[1]) !== base) continue;
    let depth = 0;
    for (const ch of sel.slice(0, m.index)) { if (ch === "(") depth++; else if (ch === ")") depth--; }
    if (depth === 0) return sel.slice(0, m.index) + target + sel.slice(m.index + m[0].length);
  }
  return sel;
}

function wrapAt(rules, chain) {
  // @starting-style has to wrap the rule directly, so it goes innermost.
  const ordered = [...chain.filter((a) => a.name !== "starting-style"), ...chain.filter((a) => a.name === "starting-style")];
  let nodes = rules;
  for (let i = ordered.length - 1; i >= 0; i--) nodes = [postcss.atRule({ name: ordered[i].name, params: ordered[i].params, nodes })];
  return nodes;
}

/**
 * Variants on demand: for every candidate like `md:hover:bg-primary` whose base utility exists in the full CSS and
 * whose full name does not, derive the rule from the base utility's declarations. Returns rule nodes in cascade order.
 */
export function deriveVariantRules(root, candidates) {
  const parsed = [];
  for (const token of candidates) {
    if (!token.includes(":") && !token.startsWith("!") && !token.endsWith("!")) continue;
    const p = parseCandidate(token);
    if (!p) continue;
    const branches = resolveVariants(p.variants);
    if (branches) parsed.push({ ...p, branches });
  }
  if (!parsed.length) return [];

  const wanted = new Set(parsed.map((p) => p.token));
  const bases = new Set(parsed.map((p) => p.base));
  const native = new Set();
  const byBase = new Map();
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    let chain;
    for (const sel of rule.selectors) {
      const classes = requiredClasses(sel);
      for (const c of classes) if (wanted.has(c)) native.add(c);
      if (classes.length === 1 && bases.has(classes[0])) {
        chain ??= atChain(rule);
        if (!byBase.has(classes[0])) byBase.set(classes[0], []);
        byBase.get(classes[0]).push({ rule, sel, chain });
      }
    }
  });

  const out = [];
  for (const p of parsed) {
    if (native.has(p.token) || !byBase.has(p.base)) continue;
    const baseHits = byBase.get(p.base);
    const nodes = [];
    for (const branch of p.branches) {
      const target = branch.sel.replace(/&/g, `.${esc(p.token)}`);
      const atRules = branch.at.map((a) => { const m = a.match(/^@([A-Za-z-]+)\s*([\s\S]*)$/); return { name: m[1], params: m[2] }; });
      for (const hit of baseHits) {
        const selector = replaceClass(hit.sel, p.base, target);
        const rule = postcss.rule({ selector });
        for (const d of hit.rule.nodes) if (d.type === "decl") rule.append(d.clone({ important: p.important || d.important }));
        if (/::(?:before|after)$/.test(branch.sel) && !rule.some((d) => d.type === "decl" && d.prop === "content")) rule.prepend({ prop: "content", value: '""' });
        if (!rule.nodes.length) continue;
        nodes.push(...wrapAt([rule], [...hit.chain, ...atRules]));
      }
    }
    if (nodes.length) out.push({ rank: rankOf(p.variants), token: p.token, nodes });
  }
  out.sort((a, b) => a.rank - b.rank || (a.token < b.token ? -1 : 1));
  return out.flatMap((o) => o.nodes);
}

function pruneCustomProperties(root, externalCss, contentVars = []) {
  const external = new Set(contentVars);
  for (const text of externalCss) for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) external.add(m[1]);
  for (let pass = 0; pass < 6; pass++) {
    const referenced = new Set(external);
    root.walkDecls((decl) => {
      for (const m of decl.value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) referenced.add(m[1]);
    });
    // Registered properties (@property --x) count as referenced: they are part of the public API.
    root.walkAtRules("property", (at) => { referenced.add(at.params.trim()); });
    let removed = 0;
    root.walkDecls(/^--/, (decl) => {
      // Only prune global token definitions; component-scoped custom properties stay.
      const sel = decl.parent?.selector || "";
      if (!/^(:root|:host|html)\b/.test(sel)) return;
      if (!referenced.has(decl.prop)) { decl.remove(); removed++; }
    });
    if (!removed) break;
  }
}

/**
 * Read the full OmniaCSS build and inline the color tokens it imports.
 * @param {{ dist?: string, minified?: boolean }} [options]
 */
export async function loadFullCss(options = {}) {
  const dist = options.dist || DIST;
  const main = await fs.readFile(path.join(dist, "omnia.css"), "utf8");
  const tokens = await fs.readFile(path.join(dist, "oc-colors.css"), "utf8").catch(() => "");
  return main.replace(/@import\s+url\("oc-colors\.css(?:\?[^"]*)?"\);?/, () => tokens);
}

/** One call: scan content and return the used CSS plus some statistics. */
export async function buildCss({ content, cwd = process.cwd(), layer = "omnia", keep = [], dist, referencedBy = [] } = {}) {
  if (!content || !content.length) throw new Error("omniacss: no content globs given (e.g. ['src/**/*.{html,vue,jsx,tsx,php}'])");
  const [{ candidates, files }, full] = await Promise.all([collectCandidates(content, cwd), loadFullCss({ dist })]);
  const css = generate(full, candidates, { layer, keep, referencedBy });
  return { css, files, stats: { files: files.length, candidates: candidates.size, inputBytes: full.length, outputBytes: css.length } };
}
