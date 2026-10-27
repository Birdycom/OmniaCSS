// File: packages/migrate/src/postcss.mjs
// PostCSS plugin "keep your classes": replaces the framework directives in your CSS
//   @import "tailwindcss";  /  @tailwind base|components|utilities;
// with OmniaCSS core + compat CSS for the classes found in your content, and expands @apply, theme() and @theme.
//
//   // postcss.config.js
//   import omniaMigrate from "@birdycom/omniacss-migrate/postcss";
//   export default { plugins: [omniaMigrate({ content: ["resources/views/**/*.blade.php", "resources/js/**/*.{vue,tsx}"] })] };
//
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import { createContext, resolveToken, serialize } from "./resolve.mjs";
import { KEYFRAMES } from "./utilities.mjs";
import { extractTokens } from "./extract.mjs";
import { loadProject, parseThemeBlocks } from "./project.mjs";
import { preflight } from "./preflight.mjs";
import { buildCoreCss } from "./core.mjs";
import { COLOR_MAP } from "./values.mjs";
import { applyVariant } from "./variants.mjs";

const TW_IMPORT = /^["']tailwindcss(?:\/(theme|preflight|utilities|base|components)(?:\.css)?)?["']/;
const fileTokenCache = new Map();

/** Default content globs when none are given. */
export async function defaultContent(cwd) {
  const has = (p) => fs.stat(path.join(cwd, p)).then(() => true, () => false);
  if (await has("artisan")) return ["resources/views/**/*.blade.php", "resources/js/**/*.{js,ts,jsx,tsx,vue}", "app/**/*.php"];
  if (await has("astro.config.mjs")) return ["src/**/*.{astro,html,md,mdx,jsx,tsx,vue,svelte}"];
  if (await has("nuxt.config.ts")) return ["{app,components,pages,layouts}/**/*.vue"];
  return ["index.html", "src/**/*.{html,js,ts,jsx,tsx,vue,svelte}"];
}

/** Collect candidate class tokens from content globs. Returns { tokens, files }. */
export async function collectTokens(patterns, cwd) {
  const tokens = new Set(), files = [];
  for (const pattern of [].concat(patterns)) {
    for await (const rel of fs.glob(pattern, { cwd, exclude: (p) => /node_modules|[\\/]\.git[\\/]|[\\/]vendor[\\/]|[\\/]storage[\\/]/.test(p) })) {
      const file = path.resolve(cwd, rel);
      const st = await fs.stat(file).catch(() => null);
      if (!st || !st.isFile()) continue;
      files.push(file);
      let entry = fileTokenCache.get(file);
      if (!entry || entry.mtime !== st.mtimeMs) {
        entry = { mtime: st.mtimeMs, tokens: new Set(extractTokens(await fs.readFile(file, "utf8"))) };
        fileTokenCache.set(file, entry);
      }
      for (const t of entry.tokens) tokens.add(t);
    }
  }
  return { tokens, files };
}

/** `underline {hover:,focus:}bg-red-500` style brace expansion used by @source inline(). */
function expandBraces(s) {
  const m = s.match(/\{([^{}]*)\}/);
  if (!m) return [s];
  return m[1].split(",").flatMap((alt) => expandBraces(s.slice(0, m.index) + alt + s.slice(m.index + m[0].length)));
}

const projectCache = new Map();
async function getProject(cwd, options) {
  const key = cwd + JSON.stringify([options.tailwind, options.darkMode, options.breakpoints, options.arbitraryColors, options.keepBrandColors]);
  if (!projectCache.has(key)) {
    projectCache.set(key, loadProject(cwd, {
      v4: options.tailwind ? options.tailwind >= 4 : undefined,
      darkMode: options.darkMode, breakpoints: options.breakpoints, arbitraryColors: options.arbitraryColors,
      keepBrandColors: options.keepBrandColors, screens: options.screens, tokensFile: options.tokensFile,
    }));
  }
  return projectCache.get(key);
}

/** theme(colors.red.500) / theme(spacing.4) / --spacing(4) inside declaration values. */
function replaceThemeFunctions(value, ctx) {
  if (!/theme\(|--spacing\(|--alpha\(/.test(value)) return value;
  return value
    .replace(/--spacing\(\s*([\d.]+)\s*\)/g, (_, n) => `${+n * 0.25}rem`)
    .replace(/--alpha\(\s*(.+?)\s*\/\s*([\d.]+)%\s*\)/g, (_, c, p) => `color-mix(in oklab, ${c} ${p}%, transparent)`)
    .replace(/theme\(\s*['"]?([^'")]+?)['"]?\s*(?:,\s*[^)]+)?\)/g, (all, key) => {
      let m = key.match(/^colors?[.\-/]([\w-]+?)(?:[.\-/](\d+))?(?:\/(\d+))?$/);
      if (m) {
        const name = m[2] ? `${m[1]}-${m[2]}` : m[1];
        const token = COLOR_MAP[name];
        if (token) return `var(${token})`;
        if (ctx.hasTheme(`--color-${name}`)) return `var(--color-${name})`;
      }
      m = key.match(/^spacing[.\-/](.+)$/);
      if (m && /^[\d.]+$/.test(m[1])) return `${+m[1] * 0.25}rem`;
      m = key.match(/^--[\w-]+$/);
      if (m) return `var(${key})`;
      return all;
    });
}

function withTheme(ctx, extra, patch = {}) {
  const themeVars = new Set([...ctx.themeVars, ...extra]);
  return { ...ctx, ...patch, themeVars, hasTheme: (n) => themeVars.has(n) };
}

/**
 * @param {object} [options]
 * @param {string|string[]} [options.content]  globs of files that contain class names (default: detected per framework)
 * @param {string} [options.cwd]
 * @param {true|"tokens"|false} [options.core=true]  true: Omnia core on demand; "tokens": only color tokens + base; false: you load Omnia yourself
 * @param {boolean} [options.preflight=true]   include the base reset
 * @param {boolean} [options.layers=true]      wrap output in cascade layers (omnia, theme, base, components, utilities)
 * @param {3|4} [options.tailwind]             naming flavor (default: detected from package.json / CSS)
 * @param {"class"|"media"} [options.darkMode]
 * @param {"omnia"|"tailwind"} [options.breakpoints="omnia"]
 * @param {"nearest"|"keep"} [options.arbitraryColors="nearest"]
 * @param {string[]} [options.safelist]        extra class names to always emit
 */
export default function omniaMigrate(options = {}) {
  return {
    postcssPlugin: "omniacss-migrate",
    async Once(root, { result }) {
      const twImports = [], twDirectives = [], applies = [], themes = [], sources = [], misc = [];
      root.walkAtRules((at) => {
        const n = at.name;
        if (n === "import" && TW_IMPORT.test(at.params.trim())) twImports.push(at);
        else if (n === "tailwind") twDirectives.push(at);
        else if (n === "apply") applies.push(at);
        else if (n === "theme") themes.push(at);
        else if (n === "source") sources.push(at);
        else if (["plugin", "config", "reference", "custom-variant", "utility", "variant"].includes(n)) misc.push(at);
      });
      const hasEntry = twImports.length || twDirectives.length;
      if (!hasEntry && !applies.length && !themes.length && !misc.length) return;

      const cwd = options.cwd || process.cwd();
      const { ctx: baseCtx, info, themeDecls: configTheme } = await getProject(cwd, options);
      const cssDir = result.opts.from ? path.dirname(result.opts.from) : cwd;

      // --- per-file theme / variants -------------------------------------------------------------------------
      const themeDecls = [...configTheme];
      const keyframes = [];
      for (const at of themes) {
        at.walkDecls((decl) => { if (decl.prop.startsWith("--") && !/^initial$/.test(decl.value)) themeDecls.push([decl.prop, decl.value]); });
        at.walkAtRules("keyframes", (k) => keyframes.push(k.toString()));
      }
      let patch = {};
      const customVariants = {};
      for (const at of misc.filter((a) => a.name === "custom-variant")) {
        const m = at.params.match(/^([\w-]+)\s*\(([\s\S]*)\)$/);
        if (!m) continue;
        if (m[1] === "dark") {
          const attr = m[2].match(/\[data-[\w-]+=["']?[\w-]+["']?\]/);
          const cls = m[2].match(/\.([\w-]+)/);
          if (m[2].includes("prefers-color-scheme")) patch.darkMode = "media";
          else { patch.darkMode = "class"; patch.darkSelector = attr ? attr[0] : cls ? `.${cls[1]}` : ".dark"; }
        } else customVariants[m[1]] = m[2];
      }
      const ctx = withTheme(baseCtx, themeDecls.map(([k]) => k), { ...patch, customVariants, ...(options.important ? { important: true } : {}) });

      // --- content ---------------------------------------------------------------------------------------------
      let compatCss = "", exclude = new Set(), candidates = new Set(), files = [];
      if (hasEntry) {
        const globs = [];
        for (const at of sources) {
          const p = at.params.trim();
          const inline = p.match(/^inline\(\s*["'](.+)["']\s*\)$/);
          if (inline) { expandBraces(inline[1]).flatMap((s) => s.split(/\s+/)).forEach((t) => t && candidates.add(t)); continue; }
          if (/^not\b/.test(p)) continue;
          const g = p.replace(/^["']|["']$/g, "");
          globs.push(path.relative(cwd, path.resolve(cssDir, g)).replace(/\\/g, "/"));
        }
        let content = options.content ?? null;
        if (!content) content = [...await defaultContent(cwd), ...globs];
        else content = [].concat(content).concat(globs);
        const collected = await collectTokens(content, cwd);
        files = collected.files;
        for (const t of collected.tokens) candidates.add(t);
        for (const t of options.safelist || []) candidates.add(t);

        const resolved = [];
        const manifest = options.manifest === false ? {} : JSON.parse(await fs.readFile(path.join(cwd, "omniacss-migrate.manifest.json"), "utf8").catch(() => "{}"));
        const native = new Set(manifest.native || []);
        for (const t of candidates) {
          if (native.has(t)) continue; // already rewritten to a native OmniaCSS class by the codemod
          const r = resolveToken(t, ctx);
          if (r) { resolved.push(r); exclude.add(t); }
        }
        compatCss = serialize(resolved);
      }

      // --- build replacement nodes -------------------------------------------------------------------------------
      const layers = options.layers !== false;
      const wrap = (name, css) => (layers && css.trim() ? `@layer ${name} {\n${css}\n}` : css);
      const pieces = {};
      pieces.order = layers ? "@layer omnia, theme, base, components, utilities;" : "";
      const themeBody = themeDecls.map(([k, v]) => `  ${k}: ${v};`).join("\n");
      pieces.theme = wrap("theme", (themeBody ? `:root, :host {\n${themeBody}\n}\n` : "") + keyframes.join("\n"));
      pieces.preflight = options.preflight === false ? "" : wrap("base", preflight({ borderColor: ctx.v4 ? "currentColor" : `var(${COLOR_MAP["gray-200"]})` }));
      pieces.core = options.core === false ? "" : await buildCoreCss({ candidates, compatCss, exclude, cwd, layer: layers ? "omnia" : false, mode: options.core === "tokens" ? "tokens" : true });
      pieces.utilities = wrap("utilities", compatCss);
      const all = [pieces.order, pieces.theme, pieces.preflight, pieces.core, pieces.utilities];
      const mk = (css) => postcss.parse(css, { from: undefined }).nodes;
      const place = (at, css) => { const nodes = css ? mk(css) : []; if (nodes.length) at.replaceWith(nodes); else at.remove(); };

      for (const at of twImports) {
        const sub = at.params.trim().match(TW_IMPORT)?.[1];
        if (!sub) place(at, all.filter(Boolean).join("\n"));
        else if (sub === "theme") place(at, [pieces.order, pieces.theme].filter(Boolean).join("\n"));
        else if (sub === "preflight" || sub === "base") place(at, [pieces.preflight, pieces.core].filter(Boolean).join("\n"));
        else if (sub === "utilities") place(at, pieces.utilities);
        else at.remove();
      }
      for (const at of twDirectives) {
        const what = at.params.trim();
        if (what === "base") place(at, [pieces.order, pieces.theme, pieces.preflight, pieces.core].filter(Boolean).join("\n"));
        else if (what === "utilities") place(at, pieces.utilities);
        else at.remove();
      }
      // `@import` must stay in front of all rules (your own imports used to follow the framework import)
      if (hasEntry) {
        const imports = [];
        root.each((n) => { if (n.type === "atrule" && n.name === "import") imports.push(n); });
        // the layer order statement goes first of all, so layers used inside imported files keep the intended order
        const order = [];
        root.each((n) => { if (n.type === "atrule" && n.name === "layer" && !n.nodes && /^omnia,\s*theme,/.test(n.params)) order.push(n); });
        const top = [...order, ...imports];
        if (top.length) {
          top.forEach((n) => n.remove());
          if (root.first?.type === "atrule" && root.first.name === "charset") root.first.after(top); else root.prepend(top);
        }
      }
      for (const at of themes) at.remove();
      for (const at of sources) at.remove();
      for (const at of misc) {
        if (at.name === "variant") expandVariant(at, ctx);
        else if (at.name === "utility") expandUtility(at);
        else at.remove();
      }

      // --- @apply and theme() ---------------------------------------------------------------------------------------------------
      const classIndex = new Map();
      root.walkRules((r) => { if (/^\.[\w-]+$/.test(r.selector)) classIndex.set(r.selector.slice(1), r); });
      const usedKeyframes = new Set();
      for (const at of applies) expandApply(at, ctx, classIndex, usedKeyframes, result);
      if (usedKeyframes.size) root.append(mk([...usedKeyframes].map((k) => KEYFRAMES[k]).filter(Boolean).join("\n")));
      root.walkDecls((decl) => { const v = replaceThemeFunctions(decl.value, ctx); if (v !== decl.value) decl.value = v; });

      for (const file of files) result.messages.push({ type: "dependency", plugin: "omniacss-migrate", file: path.resolve(file), parent: result.opts.from });
    },
  };
}
omniaMigrate.postcss = true;

function expandUtility(at) {
  if (/--value|--modifier/.test(at.toString())) { at.remove(); return; }
  const rule = postcss.rule({ selector: `.${at.params.trim()}` });
  at.each((n) => rule.append(n.clone()));
  at.replaceWith(rule);
}

/** `.card { @variant dark { … } }` -> nested rule / at-rule */
function expandVariant(at, ctx) {
  const st = { sels: ["&"], media: [], prelude: [], rank: 0 };
  if (!applyVariant(at.params.trim(), st, ctx)) { at.remove(); return; }
  let content = (at.nodes || []).map((n) => n.clone());
  if (st.sels[0] !== "&") { const r = postcss.rule({ selector: st.sels.join(", ") }); r.append(content); content = [r]; }
  for (let i = st.media.length - 1; i >= 0; i--) {
    const m = st.media[i].match(/^@(\S+)\s*(.*)$/);
    const a = postcss.atRule({ name: m[1], params: m[2] }); a.append(content); content = [a];
  }
  if (content.length) at.replaceWith(content); else at.remove();
}

function expandApply(at, ctx, classIndex, usedKeyframes, result) {
  const parent = at.parent;
  if (!parent || parent.type !== "rule") { at.warn(result, "@apply outside a rule is not supported"); at.remove(); return; }
  let params = at.params;
  let important = false;
  if (/\s*!important\s*$/.test(params)) { important = true; params = params.replace(/\s*!important\s*$/, ""); }
  const actx = important ? { ...ctx, important: true } : ctx;
  const tokens = params.split(/\s+/).filter(Boolean);
  const inline = [];
  const extras = [];
  for (const token of tokens) {
    const r = resolveToken(token, actx, { selector: "&" });
    if (!r) {
      const src = classIndex.get(token);
      if (src && src !== parent) { src.each((n) => { if (n.type === "decl") inline.push([n.prop, n.value, n.important]); }); continue; }
      at.warn(result, `@apply: cannot resolve "${token}"`);
      continue;
    }
    r.keyframes.forEach((k) => usedKeyframes.add(k));
    for (const rule of r.rules) {
      if (rule.selectors.length === 1 && rule.selectors[0] === "&" && !rule.media.length) inline.push(...rule.decls.map(([p, v]) => [p, v.replace(/ !important$/, ""), / !important$/.test(v)]));
      else extras.push(rule);
    }
  }
  const nodes = inline.map(([prop, value, imp]) => postcss.decl({ prop, value, important: !!imp }));
  if (nodes.length) at.replaceWith(nodes); else at.remove();
  if (!extras.length) return;
  const flat = parent.parent && parent.parent.type !== "rule";
  let anchor = parent;
  for (const x of extras) {
    const sels = flat ? x.selectors.flatMap((s) => parent.selectors.map((ps) => s.replace(/&/g, ps))) : x.selectors;
    let css = `${sels.join(",\n")} {\n${x.decls.map(([p, v]) => `  ${p}: ${v};`).join("\n")}\n}`;
    for (let i = x.media.length - 1; i >= 0; i--) css = `${x.media[i]} {\n${css}\n}`;
    const parsed = postcss.parse(css, { from: undefined }).nodes;
    if (flat) { for (const n of parsed) { anchor.after(n); anchor = n; } } else parent.append(parsed);
  }
}
