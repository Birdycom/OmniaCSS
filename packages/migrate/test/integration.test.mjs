// File: packages/migrate/test/integration.test.mjs
// Extraction, PostCSS plugin, scan, codemod and setup on a throw-away Laravel-like fixture.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postcss from "postcss";
import { extractTokens, classStrings } from "../src/extract.mjs";
import omniaMigrate from "../src/postcss.mjs";
import { scanDir } from "../src/scan.mjs";
import { runCodemod } from "../src/codemod.mjs";
import { planSetup, applySetup } from "../src/setup.mjs";
import { loadProject } from "../src/project.mjs";

let dir;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "omnia-migrate-"));
  const w = async (rel, text) => { await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await fs.writeFile(path.join(dir, rel), text); };
  await w("artisan", "");
  await w("package.json", JSON.stringify({ name: "fixture", type: "module", devDependencies: { tailwindcss: "^3.4.0", autoprefixer: "^10.0.0", vite: "^5.0.0" } }, null, 2) + "\n");
  await w("vite.config.js", "import { defineConfig } from 'vite';\nimport laravel from 'laravel-vite-plugin';\nimport tailwindcss from 'tailwindcss';\n\nexport default defineConfig({\n    plugins: [laravel({ input: ['resources/css/app.css'] })],\n    css: { postcss: { plugins: [tailwindcss, autoprefixer] } },\n});\n");
  await w("postcss.config.js", "export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n");
  await w("tailwind.config.js", "export default { darkMode: 'class', theme: { extend: { colors: { brand: { 500: '#3b82f6' }, ink: 'hsl(var(--ink))' } } } };\n");
  await w("resources/css/app.css", "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n.card { @apply rounded-lg p-4 shadow-md hover:shadow-lg md:p-6; }\n");
  await w("resources/views/welcome.blade.php", '<div class="flex items-center gap-4 p-4 md:p-8 bg-brand-500 text-ink hover:bg-red-500/50 w-[37px] -mt-2 custom-thing @if($x) font-bold @endif">\n  <span class="{{ $a ? \'text-sm\' : \'text-lg\' }} truncate">x</span>\n</div>\n');
  await w("resources/js/Button.vue", '<template><button :class="[\'rounded-md px-3 py-1.5\', active && \'bg-white\']" class="shadow-sm text-unknownzz-9">Go</button></template>\n');
});
after(async () => { await fs.rm(dir, { recursive: true, force: true }); });

test("extractTokens keeps arbitrary values together", () => {
  const t = extractTokens(`<div class="w-[37px] [&_svg:not([class*='size-'])]:size-4 bg-(--brand) md:hover:p-2">{{ $x }}</div>`);
  assert.ok(t.includes("w-[37px]"));
  assert.ok(t.includes("[&_svg:not([class*='size-'])]:size-4"));
  assert.ok(t.includes("bg-(--brand)"));
  assert.ok(t.includes("md:hover:p-2"));
});

test("classStrings finds quoted class lists with spans", () => {
  const s = classStrings(`<div class="flex p-4"></div>`);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].words, ["flex", "p-4"]);
  assert.equal(`<div class="flex p-4"></div>`.slice(s[0].spans[1].start, s[0].spans[1].end), "p-4");
});

test("project detection reads tailwind.config and version", async () => {
  const { ctx, info, themeDecls } = await loadProject(dir);
  assert.equal(info.tailwindVersion, 3);
  assert.equal(ctx.darkMode, "class");
  assert.equal(ctx.v4, false);
  assert.match(themeDecls.get("--color-brand-500"), /^var\(--color-[a-z]+-\d+\)$/);
  assert.equal(themeDecls.get("--color-ink"), "hsl(var(--ink))");
});

test("postcss plugin: directives become Omnia core + compat CSS, @apply is expanded", async () => {
  const input = await fs.readFile(path.join(dir, "resources/css/app.css"), "utf8");
  const out = await postcss([omniaMigrate({ cwd: dir, core: "tokens" })]).process(input, { from: path.join(dir, "resources/css/app.css") });
  assert.doesNotMatch(out.css, /@tailwind|@apply/);
  assert.match(out.css, /@layer omnia, theme, base, components, utilities;/);
  assert.match(out.css, /--color-brand-500: var\(--color-/);
  assert.match(out.css, /\.gap-4 \{\s*gap: 1rem;/);
  assert.match(out.css, /\.bg-brand-500 \{\s*background-color: var\(--color-brand-500\);/);
  assert.match(out.css, /\.card \{[^}]*border-radius: 0\.25rem|\.card \{[^}]*border-radius: 0\.5rem/); // @apply inlined
  assert.match(out.css, /\.card:hover/);
  assert.match(out.css, /@media \(min-width: 50rem\)[\s\S]*\.card/);
  assert.match(out.css, /--color-red-50:/, "tokens used by the compat CSS are kept");
  assert.doesNotMatch(out.css, /custom-thing/);
});

test("postcss plugin leaves unrelated CSS alone", async () => {
  const out = await postcss([omniaMigrate({ cwd: dir })]).process("a { color: red }", { from: undefined });
  assert.equal(out.css, "a { color: red }");
});

test("postcss plugin handles @import \"tailwindcss\" with @theme and @custom-variant", async () => {
  const input = '@import "tailwindcss";\n@custom-variant dark (&:is(.dark *));\n@theme { --color-primary: hsl(var(--primary)); }\n';
  const out = await postcss([omniaMigrate({ cwd: dir, core: "tokens", content: ["resources/views/**/*.php"] })]).process(input, { from: path.join(dir, "resources/css/v4.css") });
  assert.doesNotMatch(out.css, /@import|@theme|@custom-variant/);
  assert.match(out.css, /--color-primary: hsl\(var\(--primary\)\);/);
});

test("no warnings for CSS the plugin handles", async () => {
  const input = '@import "@birdycom/omniacss-migrate";\n@theme { --color-x: red; }\n';
  const out = await postcss([omniaMigrate({ cwd: dir, core: "tokens", content: ["resources/views/**/*.php"] })]).process(input, { from: path.join(dir, "resources/css/w.css") });
  assert.deepEqual(out.warnings().map((w) => w.text), []);
});

test("vite plugin warns once when the package on disk is newer than the running one", async (t) => {
  const manifest = new URL("../package.json", import.meta.url);
  const original = await fs.readFile(manifest, "utf8");
  const { default: vitePlugin } = await import(`../src/vite.mjs?stale=${Date.now()}`);
  t.after(() => fs.writeFile(manifest, original));
  const pkg = JSON.parse(original);
  await fs.writeFile(manifest, JSON.stringify({ ...pkg, version: "99.0.0" }, null, 2) + "\n");
  const later = new Date(Date.now() + 5000);
  await fs.utimes(manifest, later, later);
  const warnings = [];
  const plugin = vitePlugin({ cwd: dir, core: "tokens", content: ["resources/views/**/*.php"] });
  plugin.configResolved({ root: dir });
  const ctx = { warn: (m) => warnings.push(m), addWatchFile() {} };
  await plugin.transform.call(ctx, '@import "tailwindcss";\n', path.join(dir, "resources/css/a.css"));
  await plugin.transform.call(ctx, '@import "tailwindcss";\n', path.join(dir, "resources/css/a.css"));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], new RegExp(`updated from ${pkg.version.replace(/\./g, "\\.")} to 99\\.0\\.0[\\s\\S]*Restart the dev server`));
});

test("codemod leaves tests and scripts alone unless includeTests is set", async (t) => {
  const proj = await fs.mkdtemp(path.join(os.tmpdir(), "omnia-codemod-tests-"));
  t.after(() => fs.rm(proj, { recursive: true, force: true }));
  const line = '<div class="items-center flex">x</div>\n';
  for (const f of ["src/App.vue", "tests/Feature/page.test.js", "scripts/build.js", "src/Button.spec.ts"]) {
    await fs.mkdir(path.dirname(path.join(proj, f)), { recursive: true });
    await fs.writeFile(path.join(proj, f), f.endsWith(".vue") ? `<template>${line}</template>` : `const html = '${line.trim()}';\n`);
  }
  await fs.writeFile(path.join(proj, "package.json"), JSON.stringify({ name: "p" }));
  const { ctx } = await loadProject(proj, { breakpoints: "omnia" });
  const plain = await runCodemod(proj, { ctx, write: false, cwd: proj });
  assert.deepEqual(plain.files.map((f) => path.relative(proj, f.file).replace(/\\/g, "/")), ["src/App.vue"]);
  assert.equal(plain.skipped.length, 3);
  const all = await runCodemod(proj, { ctx, write: false, cwd: proj, includeTests: true });
  assert.equal(all.files.length, 4);
  assert.equal(all.skipped.length, 0);
});

test("Omnia classes (what the codemod writes) beat the compat preflight; Omnia's reset stays lowest", async (t) => {
  const proj = await fs.mkdtemp(path.join(os.tmpdir(), "omnia-layers-"));
  t.after(() => fs.rm(proj, { recursive: true, force: true }));
  await fs.writeFile(path.join(proj, "package.json"), JSON.stringify({ name: "layers" }));
  await fs.writeFile(path.join(proj, "index.html"), '<button class="p-1 align-items-center">x</button><h2>t</h2>');
  // As after `codemod --write`: the manifest lists the classes that are now native OmniaCSS names.
  await fs.writeFile(path.join(proj, "omniacss-migrate.manifest.json"), JSON.stringify({ native: ["p-1", "align-items-center"] }));
  const out = await postcss([omniaMigrate({ cwd: proj, content: ["index.html"] })]).process('@import "tailwindcss";\n', { from: path.join(proj, "app.css") });
  const layer = (name) => { let found = ""; postcss.parse(out.css).walkAtRules("layer", (at) => { if (at.params === name && at.nodes) found += at.toString(); }); return found; };
  assert.match(out.css, /^@layer omnia, theme, base, components, utilities;/);
  // the Omnia class sits above `base` (where the preflight's `* { padding: 0 }` lives) ...
  assert.match(layer("utilities"), /\.p-1 \{\s*padding: 1rem/);
  assert.doesNotMatch(layer("omnia"), /\.p-1\b/);
  assert.match(layer("base"), /padding: 0/);
  // ... while Omnia's element reset stays in the lowest layer, below your own components.
  assert.match(layer("omnia"), /h1,[\s\S]*margin: 0/);
  assert.doesNotMatch(layer("utilities"), /^\s*h1,/m);
});

test("Omnia and Tailwind-style classes in one class list sort the Tailwind way (the later rule wins)", async (t) => {
  const proj = await fs.mkdtemp(path.join(os.tmpdir(), "omnia-order-"));
  t.after(() => fs.rm(proj, { recursive: true, force: true }));
  await fs.writeFile(path.join(proj, "package.json"), JSON.stringify({ name: "order" }));
  // The OmniaDesk cases after the codemod: native lineheight-relaxed / pl-1 / ml-1 / hover:bg-violet-20 next to compat classes.
  await fs.writeFile(path.join(proj, "index.html"), '<p class="text-sm lineheight-relaxed px-0 pl-1 mx-0 ml-1 bg-purple-200/90 hover:bg-violet-20">x</p>');
  await fs.writeFile(path.join(proj, "omniacss-migrate.manifest.json"), JSON.stringify({ native: ["lineheight-relaxed", "pl-1", "ml-1", "hover:bg-violet-20"] }));
  const out = await postcss([omniaMigrate({ cwd: proj, content: ["index.html"] })]).process('@import "tailwindcss";\n', { from: path.join(proj, "app.css") });
  const at = (sel) => { const i = out.css.indexOf(sel); assert.ok(i > 0, `${sel} is in the output`); return i; };
  assert.ok(at(".text-sm {") < at(".lineheight-relaxed {"), "lineheight-* after text-sm (it sets fewer properties)");
  assert.ok(at(".px-0 {") < at(".pl-1 {"), "a side after the axis");
  assert.ok(at(".mx-0 {") < at(".ml-1 {"));
  assert.ok(at(".bg-purple-200\\/90 {") < at(".hover\\:bg-violet-20:hover"), "a variant after the base class");
});

test('postcss plugin takes @import "@birdycom/omniacss-migrate" as the same entry', async () => {
  const input = '@import "@birdycom/omniacss-migrate";\n@theme { --color-primary: hsl(var(--primary)); }\n.x { @apply scroll-mt-24; }\n';
  const out = await postcss([omniaMigrate({ cwd: dir, core: "tokens", content: ["resources/views/**/*.php"] })]).process(input, { from: path.join(dir, "resources/css/own.css") });
  assert.doesNotMatch(out.css, /@import|@theme|@apply/);
  assert.match(out.css, /--color-primary: hsl\(var\(--primary\)\);/);
  assert.match(out.css, /\.x \{\s*scroll-margin-top: 6rem;?\s*\}/);
});

test("setup renames @import \"tailwindcss\" to the migrate entry", async (t) => {
  const v4 = await fs.mkdtemp(path.join(os.tmpdir(), "omnia-setup-v4-"));
  t.after(() => fs.rm(v4, { recursive: true, force: true }));
  await fs.mkdir(path.join(v4, "src"), { recursive: true });
  await fs.writeFile(path.join(v4, "package.json"), JSON.stringify({ name: "v4", devDependencies: { tailwindcss: "^4.1.0", "@tailwindcss/vite": "^4.1.0" } }));
  await fs.writeFile(path.join(v4, "src/app.css"), '@import "tailwindcss";\n@import "tailwindcss/utilities.css" layer(x);\n.a { color: red; }\n');
  const plan = await planSetup(v4);
  const change = plan.changes.find((c) => c.file.endsWith("app.css"));
  assert.equal(change.after, '@import "@birdycom/omniacss-migrate";\n@import "@birdycom/omniacss-migrate/utilities.css" layer(x);\n.a { color: red; }\n');
  await applySetup(plan);
  assert.doesNotMatch(await fs.readFile(path.join(v4, "src/app.css"), "utf8"), /tailwind/);
  const again = await planSetup(v4);
  assert.ok(!again.changes.some((c) => c.file.endsWith("app.css")), "a second run changes nothing in the CSS");
});

test("scan reports coverage and unsupported classes", async () => {
  const { ctx } = await loadProject(dir);
  const stats = await scanDir(dir, { ctx });
  assert.ok(stats.coverage > 80, `coverage ${stats.coverage}`);
  assert.ok(stats.unsupported.has("text-unknownzz-9"));
  assert.ok(!stats.unsupported.has("custom-thing"), "custom classes are not counted as unsupported");
  assert.ok(stats.custom.has("custom-thing"));
});

test("codemod is a dry run by default and --write rewrites 1:1 classes", async () => {
  const { ctx } = await loadProject(dir, { breakpoints: "omnia" });
  const file = path.join(dir, "resources/views/welcome.blade.php");
  const before = await fs.readFile(file, "utf8");
  const dry = await runCodemod(dir, { ctx, write: false });
  assert.ok(dry.rewritten > 0);
  assert.equal(await fs.readFile(file, "utf8"), before, "dry run does not touch files");
  assert.ok(dry.mapping.get("items-center"));
  const done = await runCodemod(dir, { ctx, write: true });
  const after = await fs.readFile(file, "utf8");
  assert.notEqual(after, before);
  assert.match(after, /align-items-center/);
  assert.ok(done.manifestFile);
  const manifest = JSON.parse(await fs.readFile(done.manifestFile, "utf8"));
  assert.ok(manifest.native.includes("align-items-center"));
});

test("setup plan: dry run changes nothing, apply swaps the Tailwind wiring", async () => {
  const plan = await planSetup(dir);
  const pkgBefore = await fs.readFile(path.join(dir, "package.json"), "utf8");
  assert.ok(plan.changes.length >= 3);
  assert.equal(await fs.readFile(path.join(dir, "package.json"), "utf8"), pkgBefore);
  await applySetup(plan);
  const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
  assert.equal(pkg.devDependencies.tailwindcss, undefined);
  const own = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8")).version;
  assert.equal(pkg.devDependencies["@birdycom/omniacss-migrate"], `^${own}`);
  const vite = await fs.readFile(path.join(dir, "vite.config.js"), "utf8");
  assert.match(vite, /import omniaMigrate from '@birdycom\/omniacss-migrate\/vite'/);
  assert.doesNotMatch(vite, /tailwindcss/);
  const pc = await fs.readFile(path.join(dir, "postcss.config.js"), "utf8");
  assert.doesNotMatch(pc, /tailwindcss/);
  const css = await fs.readFile(path.join(dir, "resources/css/app.css"), "utf8");
  assert.match(css, /@theme \{/);
  assert.match(css, /@custom-variant dark/);
});
