// scripts/build-packages.mjs
// Copies the compiled CSS and sources into the npm packages (packages/*/dist) after "npm run build".
// Map: core (utilities + tokens + scss + starter bundle). Components/blocks live in the OmniaUI repo.
// Run: "npm run build:packages" (part of "npm run build").

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { transform } from "lightningcss";
import { generate, loadFullCss } from "../packages/core/src/engine.mjs";
import { starterClasses } from "../packages/core/src/starter-classes.mjs";

const root = process.cwd();
const r = (...p) => path.join(root, ...p);

async function copy(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true, force: true });
  console.log("[packages]", path.relative(root, from), "->", path.relative(root, to));
}

// Browsers for minifying. Without targets lightningcss folds animation-timeline into the animation shorthand,
// which Chrome rejects, so scroll-driven animations stop. Same list as the omniacss CLI (--minify).
const v = (major, minor = 0) => (major << 16) | (minor << 8);
const MINIFY_TARGETS = { chrome: v(123), edge: v(123), firefox: v(120), safari: v(17, 5), ios_saf: v(17, 5) };

// Lightweight CDN bundle: the curated class list (packages/core/src/starter-classes.mjs) run through the on-demand engine.
async function buildStarter() {
  const dist = r("packages/core/dist");
  const css = generate(await loadFullCss({ dist }), new Set(starterClasses), { layer: "omnia" });
  const raw = r("packages/core/dist/omnia.starter.css");
  await fs.writeFile(raw, css);
  const { code } = transform({ filename: raw, code: Buffer.from(css), minify: true, targets: MINIFY_TARGETS });
  await fs.writeFile(raw.replace(/\.css$/, ".min.css"), code);
  const gz = zlib.gzipSync(code, { level: 9 }).length;
  console.log("[packages] starter bundle: omnia.starter.css", css.length, "bytes, omnia.starter.min.css", code.length, "bytes,", gz, "bytes gzip");
  // Report listed classes that do not exist in the full build (typos / renamed utilities).
  const found = new Set([...css.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)].map((m) => m[1].replace(/\\(.)/g, "$1")));
  const missing = starterClasses.filter((c) => !found.has(c));
  if (missing.length) console.warn("[packages] starter: " + missing.length + " listed classes not found in the full build:", missing.join(" "));
  if (code.length > 250 * 1024) throw new Error("starter bundle exceeds 250 KB: " + code.length);
}

// Semantic theme tokens (packages/core/tokens/semantic.json): oc-theme.css for the web and the resolved
// desktop export (json, dtcg, python) in dist/tokens, so apps without Node can download them from the CDN.
async function buildTokens() {
  const tokens = await import("../packages/core/src/tokens.mjs");
  const { version } = JSON.parse(await fs.readFile(r("packages/core/package.json"), "utf8"));
  const semantic = await tokens.loadSemantic();
  const palette = await tokens.loadPalette(r("packages/core/dist"));
  await fs.writeFile(r("packages/core/dist/oc-theme.css"), tokens.toCss(semantic, version));
  const data = tokens.buildExport(semantic, palette, version);
  await fs.mkdir(r("packages/core/dist/tokens"), { recursive: true });
  for (const [format, write] of Object.entries(tokens.FORMATS)) {
    await fs.writeFile(r("packages/core/dist/tokens", tokens.EXTENSIONS[format]), write(data));
  }
  const mapped = Object.entries(data.colors).flatMap(([n, t]) => tokens.MODES.filter((m) => t[m].gamutMapped).map((m) => `${n} (${m})`));
  console.log(`[packages] oc-theme.css + dist/tokens (json, dtcg, python): ${Object.keys(data.colors).length} colors, gamut mapped: ${mapped.join(", ")}`);
}

async function main() {
  // @birdycom/omniacss — readable build (input for the on-demand engine), minified full build, tokens, SCSS sources.
  await fs.rm(r("packages/core/dist"), { recursive: true, force: true });
  await copy(r("public/css/omnia_main.css"), r("packages/core/dist/omnia.css"));
  await copy(r("public/css/omnia_main.min.css"), r("packages/core/dist/omnia.min.css"));
  await copy(r("src/css/oc-colors.css"), r("packages/core/dist/oc-colors.css"));
  await buildStarter();
  await buildTokens();
  await fs.rm(r("packages/core/scss"), { recursive: true, force: true });
  await copy(r("src/scss"), r("packages/core/scss"));
  // Fonts are binary assets of the site, not of the utility package.
  await fs.rm(r("packages/core/scss/fonts"), { recursive: true, force: true });
  // Only .scss sources (and the JSON color data) belong in the package's scss folder.
  for await (const rel of fs.glob("**/*.{css,map}", { cwd: r("packages/core/scss") })) {
    await fs.rm(r("packages/core/scss", rel));
  }

  // Components and blocks moved to the OmniaUI repo (October 2026).
  // The docs site keeps vendored copies of their CSS in public/css (oc-components.css, oc-blocks.css,
  // oc-code-syntax.css); refresh them with "npm run sync:omniaui".
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
