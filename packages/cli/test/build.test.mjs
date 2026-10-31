// File: packages/cli/test/build.test.mjs
// Tests the CSS commands of the omniacss CLI in a temp project: init, build, and the "moved" notice for add/list.
// Map: helpers (temp project, run) -> init -> build -> add/list notice
// Needs packages/core/dist (run "npm run build" in the repo root first; "npm test" does that).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/omniacss.mjs");

/** New temp folder with the given files ({ "index.html": "<div class=…>" }). */
async function project(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omnia-cli-"));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}
const run = (cwd, ...args) => execFileSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });

test("init writes omnia.config.json with detected content globs", async () => {
  const dir = await project({ "artisan": "" });
  run(dir, "init");
  const config = JSON.parse(await fs.readFile(path.join(dir, "omnia.config.json"), "utf8"));
  assert.ok(config.content.includes("resources/views/**/*.blade.php"));
});

test("build writes only the utilities the project uses", async () => {
  const dir = await project({ "index.html": '<div class="flex flex-row"></div>' });
  run(dir, "build", "-o", "out.css");
  const css = await fs.readFile(path.join(dir, "out.css"), "utf8");
  assert.match(css, /\.flex-row\b/);
  assert.doesNotMatch(css, /\.grid-cols-7\b/);
});

test("build --minify keeps animation-timeline out of the animation shorthand", async () => {
  // Chrome drops "animation: … view()" entirely, so scroll-driven animations would stop working.
  const dir = await project({ "index.html": '<div class="animate-view-fade-in"></div>' });
  run(dir, "build", "--minify", "-o", "out.css");
  const css = await fs.readFile(path.join(dir, "out.css"), "utf8");
  assert.match(css, /animation-timeline:view\(\)/);
  assert.doesNotMatch(css, /animation:[^;}]*view\(\)/);
});

test("build drops :is() rules when none of their classes is used", async () => {
  const dir = await project({ "index.html": '<div class="flex"></div>' });
  run(dir, "build", "-o", "out.css");
  assert.doesNotMatch(await fs.readFile(path.join(dir, "out.css"), "utf8"), /scroll-marker/);
  const used = await project({ "index.html": '<div class="scroll-markers-after"></div>' });
  run(used, "build", "-o", "out.css");
  assert.match(await fs.readFile(path.join(used, "out.css"), "utf8"), /::scroll-marker-group/);
});

test("build keeps color tokens that the content uses in inline styles", async () => {
  const dir = await project({ "index.html": '<div class="flex" style="background: var(--color-red-50)"></div>' });
  run(dir, "build", "-o", "out.css");
  const css = await fs.readFile(path.join(dir, "out.css"), "utf8");
  assert.match(css, /--color-red-50:/);
  assert.doesNotMatch(css, /--color-red-60:/);
});

test("add and list point to the omniaui CLI", async () => {
  const dir = await project({ "package.json": {} });
  for (const cmd of ["add", "list"]) {
    const res = spawnSync(process.execPath, [bin, cmd, "button", "-f", "vue"], { cwd: dir, encoding: "utf8" });
    assert.equal(res.status, 1);
    assert.match(res.stdout, /npx omniaui add/);
  }
});

test("the PostCSS plugin keeps the color tokens the stylesheet itself uses", async () => {
  const dir = await project({ "index.html": '<div class="flex">x</div>' });
  const postcss = (await import("postcss")).default;
  const omniacss = (await import("../../core/src/postcss.mjs")).default;
  const input = "@omnia;\n.brand { color: var(--color-teal-60); }\n";
  const { css } = await postcss([omniacss({ cwd: dir, content: ["index.html"] })]).process(input, { from: path.join(dir, "app.css") });
  assert.match(css, /--color-teal-60:/, "a token used next to @omnia stays");
  assert.doesNotMatch(css, /--color-magenta-80:/, "unused tokens are still left out");
  assert.match(css, /\.flex\s*\{/);
});

test("@omniaui brings in the used OmniaUI components, in a layer before the utilities", async () => {
  const components = ":root { --oc-primary: var(--color-blue-60); }\n.oc-btn { color: var(--oc-primary); }\n.oc-card { display: grid; }\n";
  const dir = await project({
    "index.html": '<button class="oc-btn flex">x</button>',
    "node_modules/@birdycom/omniaui/package.json": { name: "@birdycom/omniaui" },
    "node_modules/@birdycom/omniaui/dist/components.css": components,
  });
  const postcss = (await import("postcss")).default;
  const omniacss = (await import("../../core/src/postcss.mjs")).default;
  const { css, messages } = await postcss([omniacss({ cwd: dir, content: ["index.html"] })]).process("@omniaui;\n@omnia;\n", { from: path.join(dir, "app.css") });
  assert.match(css, /^@layer omnia-base;\s*@layer omniaui, omnia;/);
  assert.match(css, /@layer omniaui \{[\s\S]*\.oc-btn/);
  // The reset sits in the base layer, before the components: `p { margin: 0 }` must not beat `.oc-block-hero p`.
  assert.match(css, /@layer omnia-base \{[^@]*\bp\b[^{]*\{\s*margin: 0/);
  assert.doesNotMatch(css, /@layer omnia \{[^@]*\bh1\b[^{]*\{\s*margin/, "the reset is not in the utilities layer");
  const own = await postcss([omniacss({ cwd: dir, content: ["index.html"] })]).process("@layer omniaui, app, omnia;\n@omniaui;\n@omnia;\n", { from: path.join(dir, "app.css") });
  assert.match(own.css, /^@layer omnia-base;\s*@layer omniaui, app, omnia;/, "the base layer comes first, also before your own order");
  assert.doesNotMatch(css, /\.oc-card/, "unused components are left out");
  assert.match(css, /--color-blue-60:/, "the palette color a component token uses stays");
  assert.equal(messages.filter((m) => m.type === "warning").length, 0);

  // Modifiers built in code (Blade/PHP, JS, template literals) keep the whole modifier family, nothing more.
  const wrapper = await project({
    "button.blade.php": "<button @class(['oc-btn', 'oc-btn--'.$variant])>",
    "Badge.tsx": "<span className={`oc-badge oc-badge--${tone}`} />",
    "node_modules/@birdycom/omniaui/package.json": { name: "@birdycom/omniaui" },
    "node_modules/@birdycom/omniaui/dist/components.css":
      ".oc-btn { color: red; }\n.oc-btn--destructive { color: crimson; }\n.oc-badge--success { color: green; }\n.oc-card--flat { border: 0; }\n",
  });
  const dynamic = await postcss([omniacss({ cwd: wrapper, content: ["*.php", "*.tsx"] })]).process("@omniaui;\n", { from: path.join(wrapper, "app.css") });
  assert.match(dynamic.css, /\.oc-btn--destructive/, "'oc-btn--'.$variant keeps the button modifiers");
  assert.match(dynamic.css, /\.oc-badge--success/, "`oc-badge--${tone}` keeps the badge modifiers");
  assert.doesNotMatch(dynamic.css, /\.oc-card--flat/, "other modifiers are still left out");

  // node_modules is skipped by a general glob, but scanned when a pattern points into it (a wrapper's source).
  await fs.mkdir(path.join(wrapper, "node_modules/@birdycom/omniaui-react/src"), { recursive: true });
  await fs.writeFile(path.join(wrapper, "node_modules/@birdycom/omniaui-react/src/Card.tsx"), '<div className="oc-card--flat" />');
  const general = await postcss([omniacss({ cwd: wrapper, content: ["**/*.tsx"] })]).process("@omniaui;\n", { from: path.join(wrapper, "app.css") });
  assert.doesNotMatch(general.css, /\.oc-card--flat/, "a general glob does not reach into node_modules");
  const explicit = await postcss([omniacss({ cwd: wrapper, content: ["*.tsx", "node_modules/@birdycom/omniaui-react/src/*.tsx"] })]).process("@omniaui;\n", { from: path.join(wrapper, "app.css") });
  assert.match(explicit.css, /\.oc-card--flat/, "a pattern into node_modules is scanned");

  const blocks = await postcss([omniacss({ cwd: dir, content: ["index.html"] })]).process("@omniaui blocks;\n", { from: path.join(dir, "app.css") });
  assert.match(blocks.messages.find((m) => m.type === "warning")?.text ?? "", /omniaui-blocks is not installed/);
});
