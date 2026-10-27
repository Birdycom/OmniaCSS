#!/usr/bin/env node
// File: packages/cli/bin/omniacss.mjs
// OmniaCSS CLI — init a project, build on-demand CSS, migrate from Tailwind CSS.
// Map: args -> config -> commands (init | build | purge | migrate | tokens | add/list moved notice) -> output
// Author: Serge Cools | Framework: OmniaCSS
// Components and blocks moved to OmniaUI (October 2026): "npx omniaui add <name>" copies them now.
// "omniacss build" still includes the OmniaUI CSS when @birdycom/omniaui(-blocks) is installed.

import fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const CONFIG = "omnia.config.json";
const requireFromProject = createRequire(path.join(cwd, "package.json"));
const requireFromCli = createRequire(import.meta.url);

/** Resolve a file of a package: the project's own install first, then the CLI's dependency. */
function resolvePkg(spec) {
  for (const req of [requireFromProject, requireFromCli]) {
    try { return req.resolve(spec); } catch { /* try next */ }
  }
  throw new Error(`Cannot find ${spec}. Install it with: npm install ${spec.split("/").slice(0, 2).join("/")}`);
}
const pkgDir = (name) => path.dirname(resolvePkg(`${name}/package.json`));

/** Folder of an optional package, or null when it is not installed. */
function optionalPkgDir(name) {
  try { return pkgDir(name); } catch { return null; }
}

// Shown for the old "add" / "list" commands (they live in the omniaui CLI now).
const MOVED = "Components and blocks moved to OmniaUI: npx omniaui add <name>  (npm i -D @birdycom/omniaui)";

const HELP = `
OmniaCSS CLI

  omniacss init                         create omnia.config.json and an entry CSS file
  omniacss build [--watch] [--minify]   write only the CSS your project uses
  omniacss migrate <scan|setup|codemod>  switch a project from Tailwind CSS and keep its class names (needs @birdycom/omniacss-migrate)
  omniacss migrate bootstrap <scan|codemod>  convert a Bootstrap 3/4/5 site to OmniaCSS + OmniaUI
  omniacss tokens [--format json|dtcg|python|css] [--out <file>|-] [--source <semantic.json>]
                                        export the theme tokens for desktop apps (resolved per light/dark, sRGB hex)

Options for build (override omnia.config.json):
  -c, --content <glob>   content files to scan (repeatable)
  -o, --output <file>    output CSS file
      --no-components    do not include the OmniaUI component CSS (@birdycom/omniaui, when installed)
      --no-layer         do not wrap the output in @layer omnia

Components and blocks: ${MOVED}
`;

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function loadConfig(flags) {
  let config = {};
  try { config = await readJson(path.join(cwd, CONFIG)); } catch { /* defaults below */ }
  return {
    content: flags.content?.length ? flags.content : config.content || ["**/*.html"],
    output: flags.output || config.output || "omnia.css",
    // "auto" (default): include the OmniaUI CSS when installed, skip silently when not.
    components: flags["no-components"] ? false : config.components ?? "auto",
    blocks: config.blocks ?? false,
    // OmniaUI Pro (licensed): included when installed, like the components.
    pro: config.pro ?? "auto",
    layer: flags["no-layer"] ? false : config.layer ?? "omnia",
    keep: config.keep || [],
    minify: flags.minify ?? config.minify ?? false,
  };
}

/** Detect the project type so `init` can propose sensible content globs. */
async function detectContent() {
  const exists = async (p) => !!(await fs.stat(path.join(cwd, p)).catch(() => null));
  if (await exists("artisan")) return ["resources/views/**/*.blade.php", "resources/js/**/*.{js,ts,jsx,tsx,vue}"];
  if (await exists("astro.config.mjs")) return ["src/**/*.{astro,html,md,mdx,jsx,tsx,vue,svelte}"];
  if (await exists("nuxt.config.ts")) return ["{app,components,pages,layouts}/**/*.vue"];
  if (await exists("src")) return ["index.html", "src/**/*.{html,js,ts,jsx,tsx,vue,svelte}"];
  return ["**/*.html"];
}

async function cmdInit() {
  const configPath = path.join(cwd, CONFIG);
  if (await fs.stat(configPath).catch(() => null)) {
    console.log(`${CONFIG} already exists — nothing to do.`);
    return;
  }
  const content = [...(await detectContent()), "omnia/**/*.html"];
  const config = { $schema: "https://omniacss.eu/schema/omnia.config.json", content, output: "public/css/omnia.css", layer: "omnia", keep: [], minify: false };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Created ${CONFIG} (content: ${content.join(", ")})

Next steps
  1. npx omniacss build --watch        (development)
  2. npx omniacss build --minify       (production)
  3. <link rel="stylesheet" href="/css/omnia.css">

Using Vite / PostCSS instead? Add the plugin and put "@omnia;" in your CSS:
  import omniacss from "@birdycom/omniacss/postcss";
  export default { plugins: [omniacss({ content: ${JSON.stringify(content)} })] };`);
}

/**
 * Extra CSS from OmniaUI (optional): components and blocks, only when the packages are installed.
 * The utilities they use are kept by the engine like any other CSS in the input.
 */
async function omniauiCss(config) {
  let css = "";
  const parts = [["components", "@birdycom/omniaui", "dist/components.css"], ["blocks", "@birdycom/omniaui-blocks", "dist/blocks.css"], ["pro", "@birdycom/omniaui-pro", "dist/pro.css"]];
  for (const [key, name, file] of parts) {
    if (!config[key]) continue;
    const dir = optionalPkgDir(name);
    if (dir) css += "\n" + (await fs.readFile(path.join(dir, file), "utf8"));
    else if (config[key] !== "auto") console.log(`omniacss: "${key}" is on but ${name} is not installed — skipped (npm i -D ${name}).`);
  }
  return css;
}

async function cmdBuild(flags) {
  const config = await loadConfig(flags);
  const engine = await import(pathToFileURL(resolvePkg("@birdycom/omniacss/engine")).href);

  const run = async () => {
    const started = Date.now();
    const { candidates, files } = await engine.collectCandidates(config.content, cwd);
    let full = await engine.loadFullCss({ dist: path.join(pkgDir("@birdycom/omniacss"), "dist") });
    full += await omniauiCss(config);
    let css = engine.generate(full, candidates, { layer: config.layer, keep: config.keep });
    if (config.minify) {
      const { transform } = await import("lightningcss");
      css = transform({ filename: config.output, code: Buffer.from(css), minify: true }).code.toString();
    }
    const out = path.resolve(cwd, config.output);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, css);
    console.log(`omniacss: ${files.length} files scanned → ${path.relative(cwd, out)} (${(css.length / 1024).toFixed(1)} KB) in ${Date.now() - started}ms`);
    return files;
  };

  const files = await run();
  if (!flags.watch) return;

  const dirs = new Set(files.map((f) => path.dirname(f)));
  let timer;
  console.log(`omniacss: watching ${dirs.size} folder(s) — Ctrl+C to stop`);
  for (const dir of dirs) {
    watch(dir, () => {
      clearTimeout(timer);
      timer = setTimeout(() => run().catch((e) => console.error(e.message)), 120);
    });
  }
}

/** `omniacss migrate ...` delegates to @birdycom/omniacss-migrate (optional package). */
async function cmdMigrate(args) {
  let file;
  try { file = resolvePkg("@birdycom/omniacss-migrate/cli"); } catch { throw new Error("The migrate command needs @birdycom/omniacss-migrate. Install it with: npm install -D @birdycom/omniacss-migrate"); }
  const { run } = await import(pathToFileURL(file).href);
  return run(args);
}

/**
 * `omniacss tokens` — the semantic theme tokens resolved for non-web apps (desktop toolkits have no CSS engine):
 * per mode (light/dark), no var() left, sRGB hex gamut mapped the CSS Color 4 way, OmniaCSS version stamped.
 */
async function cmdTokens(args) {
  const { values } = parseArgs({
    args,
    options: {
      format: { type: "string", short: "f", default: "json" },
      out: { type: "string", short: "o" },
      source: { type: "string", short: "s" },
    },
  });
  const tokens = await import(pathToFileURL(resolvePkg("@birdycom/omniacss/tokens/export")).href);
  const core = pkgDir("@birdycom/omniacss");
  const { version } = await readJson(path.join(core, "package.json"));
  const semantic = await tokens.loadSemantic(values.source ? path.resolve(cwd, values.source) : undefined);
  const format = values.format;
  let text;
  if (format === "css") text = tokens.toCss(semantic, version);
  else if (tokens.FORMATS[format]) text = tokens.FORMATS[format](tokens.buildExport(semantic, await tokens.loadPalette(path.join(core, "dist")), version));
  else throw new Error(`unknown format "${format}" (use json, dtcg, python or css)`);
  if (values.out === "-") { process.stdout.write(text); return; }
  const out = path.resolve(cwd, values.out || (format === "css" ? "oc-theme.css" : tokens.EXTENSIONS[format]));
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, text);
  console.log(`omniacss: ${format} tokens (OmniaCSS ${version}) → ${path.relative(cwd, out)}`);
}

async function main() {
  if (process.argv[2] === "migrate") return cmdMigrate(process.argv.slice(3));
  if (process.argv[2] === "tokens") return cmdTokens(process.argv.slice(3));
  // add/list moved to OmniaUI: answer before parsing so their old flags (-f, --kind …) do not fail.
  if (["add", "list"].includes(process.argv[2])) {
    console.log(MOVED);
    process.exitCode = 1;
    return;
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      content: { type: "string", short: "c", multiple: true },
      output: { type: "string", short: "o" },
      watch: { type: "boolean", short: "w" },
      minify: { type: "boolean", short: "m" },
      "no-components": { type: "boolean" },
      "no-layer": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const [command] = positionals;
  if (values.version) {
    console.log((await readJson(new URL("../package.json", import.meta.url))).version);
    return;
  }
  switch (command) {
    case "init": return cmdInit();
    case "build": return cmdBuild(values);
    case "purge": return cmdBuild({ ...values, "no-components": true }); // backwards compatible alias
    default: console.log(HELP);
  }
}

main().catch((err) => {
  console.error(`omniacss: ${err.message}`);
  process.exit(1);
});
