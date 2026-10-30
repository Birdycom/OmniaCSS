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
