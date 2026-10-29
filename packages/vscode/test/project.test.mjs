// Tests for the project detection behind omniacss.lint.tailwindProjects: Tailwind projects get no unknown-class lints.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { tailwindEngine } = createRequire(import.meta.url)("../src/lib/project.cjs");

function project(t, pkg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omnia-project-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (pkg) fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
  fs.mkdirSync(path.join(dir, "resources/views"), { recursive: true });
  return { dir, file: path.join(dir, "resources/views/page.blade.php") };
}

test("a Tailwind project is recognised from the nearest package.json", (t) => {
  const { dir, file } = project(t, { devDependencies: { "@tailwindcss/vite": "^4.1.0" } });
  assert.equal(tailwindEngine(file, dir), "@tailwindcss/vite");
});

test("the Tailwind compat layer counts too", (t) => {
  const { dir, file } = project(t, { devDependencies: { "@birdycom/omniacss-migrate": "^0.12.0" } });
  assert.equal(tailwindEngine(file, dir), "@birdycom/omniacss-migrate");
});

test("an OmniaCSS project, or no package.json at all, is linted", (t) => {
  const omnia = project(t, { devDependencies: { "@birdycom/omniacss": "^0.12.0" } });
  assert.equal(tailwindEngine(omnia.file, omnia.dir), "");
  const none = project(t, null);
  assert.equal(tailwindEngine(none.file, none.dir), "");
});

test("a changed package.json is read again (migration done)", (t) => {
  const { dir, file } = project(t, { devDependencies: { tailwindcss: "^3.4.0" } });
  assert.equal(tailwindEngine(file, dir), "tailwindcss");
  const manifest = path.join(dir, "package.json");
  fs.writeFileSync(manifest, JSON.stringify({ devDependencies: { "@birdycom/omniacss": "^0.12.0" } }));
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(manifest, later, later);
  assert.equal(tailwindEngine(file, dir), "");
});
