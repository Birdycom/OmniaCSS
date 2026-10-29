// File: packages/migrate/src/vite.mjs
// Vite plugin: drop-in replacement for the Tailwind Vite plugin. It puts the "keep your classes" PostCSS plugin
// in front of your existing PostCSS plugins (autoprefixer …) and removes any Tailwind PostCSS plugin.
//
//   // vite.config.js
//   import omniaMigrate from "@birdycom/omniacss-migrate/vite";
//   export default defineConfig({ plugins: [laravel({ ... }), omniaMigrate()] });
//
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import postcss from "postcss";
import omniaMigratePostcss from "./postcss.mjs";

// every PostCSS entry that belongs to the Tailwind ecosystem is dropped (@tailwindcss/postcss, tailwindcss, @iconify/tailwind4 …)
const isTailwind = (name) => /tailwind/i.test(name);

/** Load the project's postcss.config.* into a plugin array (Tailwind removed). */
async function loadExistingPlugins(root) {
  const file = ["postcss.config.js", "postcss.config.mjs", "postcss.config.cjs"].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  if (!file) return [];
  let cfg;
  try { const mod = await import(pathToFileURL(file).href); cfg = mod.default ?? mod; } catch { return []; }
  if (typeof cfg === "function") cfg = cfg({ env: process.env.NODE_ENV || "development" });
  const plugins = cfg?.plugins;
  if (!plugins) return [];
  const req = createRequire(path.join(root, "package.json"));
  const out = [];
  if (Array.isArray(plugins)) {
    for (const p of plugins) {
      if (typeof p === "string") { if (isTailwind(p)) continue; try { const m = req(p); out.push((m.default ?? m)()); } catch { /* skip */ } }
      else if (p && (p.postcssPlugin === "tailwindcss" || p.postcssPlugin === "@tailwindcss/postcss" || p.postcssPlugin === "internal:tailwind")) continue;
      else if (typeof p === "function" && (p.name === "tailwindcss" || p.postcssPlugin === "tailwindcss")) continue;
      else out.push(p);
    }
  } else {
    for (const [name, opts] of Object.entries(plugins)) {
      if (isTailwind(name) || opts === false) continue;
      try {
        const m = await import(pathToFileURL(req.resolve(name)).href).catch(() => ({ default: req(name) }));
        const factory = m.default ?? m;
        out.push(typeof factory === "function" ? factory(opts) : factory);
      } catch { /* plugin not installed: skip */ }
    }
  }
  return out;
}

// The version this process loaded. A running dev server keeps it after `npm install` brings a newer one.
const OWN_MANIFEST = new URL("../package.json", import.meta.url);
const LOADED_VERSION = JSON.parse(fs.readFileSync(OWN_MANIFEST, "utf8")).version;

/** The version now on disk when it differs from the loaded one (read again only when package.json changed). */
let seen = { mtime: 0, version: LOADED_VERSION };
function updatedVersion() {
  try {
    const mtime = fs.statSync(OWN_MANIFEST).mtimeMs;
    if (mtime !== seen.mtime) seen = { mtime, version: JSON.parse(fs.readFileSync(OWN_MANIFEST, "utf8")).version };
  } catch { return null; }
  return seen.version !== LOADED_VERSION ? seen.version : null;
}

/** @param {Parameters<typeof omniaMigratePostcss>[0]} [options] */
export default function omniaMigrate(options = {}) {
  let root = process.cwd();
  let warnedStale = false;
  return {
    name: "omniacss-migrate",
    enforce: "pre",
    // Vite inlines `@import` before PostCSS plugins run, and `@import "tailwindcss"` no longer resolves once the package is gone:
    // so the directive entry files are compiled here, before Vite looks at them. @apply in imported files is handled by the PostCSS plugin below.
    async transform(code, id) {
      const file = id.split("?")[0];
      if (!/\.(css|pcss|postcss)$/.test(file)) return null;
      if (!/@import\s+["'](?:tailwindcss|@birdycom\/omniacss-migrate)|@tailwind\s+\w+|@apply\s|@theme\b/.test(code)) return null;
      // Vite does not reload a plugin whose package changed underneath it; the old one may not understand the CSS.
      const newer = !warnedStale && updatedVersion();
      if (newer) {
        warnedStale = true;
        this.warn(`@birdycom/omniacss-migrate was updated from ${LOADED_VERSION} to ${newer} while this dev server runs. Restart the dev server: it still uses ${LOADED_VERSION}.`);
      }
      const result = await postcss([omniaMigratePostcss({ cwd: root, ...options })]).process(code, { from: file, map: false });
      for (const m of result.messages) if (m.type === "dependency" && m.file) this.addWatchFile(m.file);
      for (const w of result.warnings()) this.warn(w.text);
      return { code: result.css, map: null };
    },
    configResolved(config) {
      root = config.root;
    },
    async config(config) {
      const root = path.resolve(config.root || process.cwd());
      config.css ||= {};
      const existing = config.css.postcss;
      if (typeof existing === "string") return; // custom config dir: use the PostCSS plugin there instead
      const others = existing && typeof existing === "object" && existing.plugins ? existing.plugins : await loadExistingPlugins(root);
      const keep = others.filter((p) => !(p && (p.postcssPlugin === "tailwindcss" || p.postcssPlugin === "@tailwindcss/postcss" || p.name === "tailwindcss")) && p !== omniaMigratePostcss);
      config.css.postcss = { ...(existing && typeof existing === "object" ? existing : {}), plugins: [omniaMigratePostcss({ cwd: root, ...options }), ...keep] };
    },
  };
}
