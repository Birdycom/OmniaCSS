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
