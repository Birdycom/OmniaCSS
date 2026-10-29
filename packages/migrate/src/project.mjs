// File: packages/migrate/src/project.mjs
// Read a project's own Tailwind setup (CSS @theme blocks, tailwind.config.*, package.json) into a resolver context.
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { createContext } from "./resolve.mjs";
import { nearestToken, parseColor } from "./values.mjs";

const IGNORE = new Set(["node_modules", "vendor", ".git", "storage", "dist", "build", "public", "bootstrap", ".next", ".nuxt", ".output"]);

export async function findFiles(dir, test, max = 400) {
  const out = [];
  async function rec(d, depth) {
    if (depth > 8 || out.length >= max) return;
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!IGNORE.has(e.name)) await rec(path.join(d, e.name), depth + 1); } else if (test(e.name)) out.push(path.join(d, e.name));
    }
  }
  await rec(dir, 0);
  return out;
}

/** Extract `--x: value` pairs from every `@theme { … }` block of a CSS string. */
export function parseThemeBlocks(css) {
  const vars = new Map();
  const re = /@theme\b[^{]*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    const start = i;
    while (i < css.length && depth) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
    const body = css.slice(start, i - 1).replace(/\/\*[\s\S]*?\*\//g, "");
    // only top-level declarations (skip nested @keyframes blocks)
    let flat = "", d = 0;
    for (const ch of body) { if (ch === "{") d++; else if (ch === "}") d--; else if (d === 0) flat += ch; }
    for (const decl of flat.split(";")) {
      const k = decl.indexOf(":");
      if (k < 0) continue;
      const name = decl.slice(0, k).trim();
      if (name.startsWith("--")) vars.set(name, decl.slice(k + 1).trim());
    }
    re.lastIndex = i;
  }
  return vars;
}

/** Load tailwind.config.{js,cjs,mjs,ts}; returns { config, file } or null. */
export async function loadTailwindConfig(dir) {
  for (const name of ["tailwind.config.js", "tailwind.config.mjs", "tailwind.config.cjs", "tailwind.config.ts"]) {
    const file = path.join(dir, name);
    const text = await fs.readFile(file, "utf8").catch(() => null);
    if (text == null) continue;
    if (!name.endsWith(".ts")) {
      try {
        const mod = await import(pathToFileURL(file).href + "?t=" + Date.now());
        return { config: mod.default ?? mod, file };
      } catch { /* fall back to a sandboxed evaluation below */ }
    }
    try {
      const body = text.replace(/^\s*import\s+[^;]*;?\s*$/gm, "").replace(/export\s+default\s+/, "module.exports = ").replace(/\/\*\*[\s\S]*?\*\//g, "");
      const mod = { exports: {} };
      const stub = new Proxy(function () { return stub; }, { get: (_, k) => (k === "default" ? stub : k === Symbol.toPrimitive ? () => "" : stub), apply: () => stub });
      vm.runInNewContext(body, { module: mod, exports: mod.exports, require: () => stub, process, console }, { timeout: 2000 });
      return { config: mod.exports.default ?? mod.exports, file };
    } catch { return { config: null, file, error: true }; }
  }
  return null;
}

const flatColors = (obj, prefix = "") => {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const name = k === "DEFAULT" ? prefix : prefix ? `${prefix}-${k}` : k;
    if (typeof v === "string") out[name] = v;
    else if (v && typeof v === "object") Object.assign(out, flatColors(v, name));
  }
  return out;
};

/**
 * Turn a tailwind.config theme into @theme-style declarations.
 * Colors given as literals are mapped to the nearest Omnia palette token; var()/hsl(var()) stay as written.
 * @returns {{ decls: Array<[string,string]>, screens: Record<string,string>, notes: string[] }}
 */
export function themeFromConfig(config, ctx, { keepColors = false } = {}) {
  const decls = [], notes = [], screens = {};
  const theme = config?.theme || {};
  const ext = theme.extend || {};
  const colorSets = [theme.colors, ext.colors];
  const stdKeys = new Set(["inherit", "current", "transparent", "black", "white"]);
  for (const set of colorSets) {
    if (!set || typeof set !== "object") continue;
    for (const [name, raw] of Object.entries(flatColors(set))) {
      if (typeof raw !== "string") continue;
      let val = raw.replace(/<alpha-value>/g, "1");
      if (stdKeys.has(name) && set === theme.colors) continue;
      if (/^(var\(|hsl\(var|rgb\(var|hsla\(var)/i.test(val) || /var\(/.test(val)) { decls.push([`--color-${name}`, val]); continue; }
      const parsed = parseColor(val);
      if (parsed && !keepColors) {
        const n = nearestToken(val, ctx);
        if (n) { decls.push([`--color-${name}`, `var(${n.token})`]); notes.push(`color ${name}: ${raw} -> ${n.token}`); continue; }
      }
      decls.push([`--color-${name}`, val]);
    }
  }
  const scalar = (obj, prefix, map = (v) => v) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof v === "string" || typeof v === "number") decls.push([`--${prefix}-${k === "DEFAULT" ? "DEFAULT" : k}`, String(map(v))]);
    }
  };
  scalar(ext.borderRadius || theme.borderRadius, "radius");
  scalar(ext.spacing, "spacing");
  scalar(ext.boxShadow, "shadow");
  for (const [k, v] of Object.entries({ ...(theme.fontFamily || {}), ...(ext.fontFamily || {}) })) {
    if (["sans", "serif", "mono"].includes(k) && !ext.fontFamily?.[k]) continue;
    decls.push([`--font-${k}`, Array.isArray(v) ? v.map((f) => (/[\s\d]/.test(f) && !/^["']/.test(f) ? `"${f}"` : f)).join(", ") : String(v)]);
  }
  for (const [k, v] of Object.entries({ ...(theme.screens || {}), ...(ext.screens || {}) })) {
    if (typeof v === "string") screens[k] = v.endsWith("px") ? `${+v.slice(0, -2) / 16}rem` : v;
  }
  if (ext.keyframes || ext.animation) notes.push("custom keyframes/animation in tailwind.config are not migrated (add them to your CSS)");
  if (config?.plugins?.length) notes.push(`${config.plugins.length} tailwind plugin(s) in config: only tailwindcss-animate style classes are emulated`);
  return { decls, screens, notes };
}

/**
 * Build resolver options for a project directory.
 * @param {string} dir project root
 * @param {object} [overrides] options for createContext()
 */
export async function loadProject(dir, overrides = {}) {
  const info = { dir, tailwindVersion: null, themeVars: new Map(), cssFiles: [], configFile: null, notes: [] };
  let pkg = {};
  try { pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8")); } catch { /* no package.json */ }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.tailwindcss) info.tailwindVersion = parseInt(String(deps.tailwindcss).replace(/[^\d.]/g, ""), 10) || null;
  if (!info.tailwindVersion && (deps["@tailwindcss/vite"] || deps["@tailwindcss/postcss"])) info.tailwindVersion = 4;

  info.cssFiles = await findFiles(dir, (n) => n.endsWith(".css") || n.endsWith(".scss"));
  let darkSelector = null, darkMode = null;
  for (const f of info.cssFiles) {
    const css = await fs.readFile(f, "utf8").catch(() => "");
    for (const [k, v] of parseThemeBlocks(css)) info.themeVars.set(k, v);
    if (/@import\s+["'](?:tailwindcss|@birdycom\/omniacss-migrate)/.test(css) || /@theme\b/.test(css)) info.tailwindVersion ||= 4;
    if (/@tailwind\s+(base|utilities|components)/.test(css)) info.tailwindVersion ||= 3;
    const cv = css.match(/@custom-variant\s+dark\s*\(([^;]*)\)\s*;/);
    if (cv) {
      darkMode = "class";
      const sel = cv[1].match(/\.([\w-]+)/);
      const attr = cv[1].match(/\[data-[\w-]+=["']?[\w-]+["']?\]/);
      darkSelector = attr ? attr[0] : sel ? `.${sel[1]}` : ".dark";
    }
  }

  const loaded = await loadTailwindConfig(dir);
  let cfg = null;
  if (loaded) {
    info.configFile = loaded.file;
    cfg = loaded.config;
    info.tailwindVersion ||= 3;
    if (loaded.error) info.notes.push("tailwind.config could not be evaluated; theme extensions were not read");
  }
  if (cfg) {
    const dm = Array.isArray(cfg.darkMode) ? cfg.darkMode[0] : cfg.darkMode;
    if (dm === "class" || dm === "selector") { darkMode ||= "class"; if (Array.isArray(cfg.darkMode) && cfg.darkMode[1]) darkSelector ||= cfg.darkMode[1]; }
    else if (dm === "media") darkMode ||= "media";
  }

  const probe = createContext({ ...overrides });
  const fromConfig = cfg ? themeFromConfig(cfg, probe, { keepColors: overrides.keepBrandColors }) : { decls: [], screens: {}, notes: [] };
  info.notes.push(...fromConfig.notes);
  const themeDecls = new Map(fromConfig.decls);
  const themeVars = new Set([...info.themeVars.keys(), ...themeDecls.keys()]);
  const v4 = overrides.v4 ?? (info.tailwindVersion ? info.tailwindVersion >= 4 : true);
  const ctx = createContext({
    v4,
    darkMode: overrides.darkMode || darkMode || (v4 ? "media" : "media"),
    darkSelector: overrides.darkSelector || darkSelector || ".dark",
    themeVars,
    screens: { ...fromConfig.screens, ...(overrides.screens || {}) },
    container: cfg?.theme?.container ? { center: !!cfg.theme.container.center, padding: typeof cfg.theme.container.padding === "string" ? cfg.theme.container.padding : undefined } : {},
    prefix: cfg?.prefix || overrides.prefix,
    important: cfg?.important === true,
    breakpoints: overrides.breakpoints,
    arbitraryColors: overrides.arbitraryColors,
    tokensFile: overrides.tokensFile,
  });
  return { ctx, info, themeDecls, themeCss: info.themeVars };
}
