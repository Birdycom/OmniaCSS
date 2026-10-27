// File: packages/migrate/test/bootstrap.test.mjs
// Bootstrap -> OmniaCSS: class conversion against the real OmniaCSS build, version detection, the codemod on a
// throw-away fixture (Bootstrap 5 and Bootstrap 3) and the compat stylesheet.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { convertClass, loadDeclIndex, bpVariant } from "../src/bootstrap/convert.mjs";
import { migrateBootstrap, linkHrefs } from "../src/bootstrap/migrate.mjs";
import { compatCss } from "../src/bootstrap/compat.mjs";

const index = loadDeclIndex(process.cwd());
const conv = (name, version = 5, breakpoints = "omnia") => convertClass(name, { version, breakpoints, index });

test("utilities map on their declarations, not their names", () => {
  assert.equal(conv("mt-3").to, "mt-1"); // Bootstrap 1rem = OmniaCSS mt-1
  assert.equal(conv("d-flex").to, "flex");
  assert.equal(conv("justify-content-between").to, "justify-between");
  assert.equal(conv("text-center").to, "text-center");
  assert.equal(conv("w-100").to, "w-full");
  assert.equal(conv("text-primary").to, "text-blue-30");
  assert.equal(conv("img-fluid").to, "max-w-full h-auto");
});

test("responsive infixes become variants", () => {
  assert.equal(conv("d-md-none").to, "md:d-none");
  assert.equal(conv("mt-lg-3").to, "lg:mt-1");
  assert.equal(conv("d-md-none", 5, "exact").to, "min-[48rem]:d-none");
  assert.equal(bpVariant("md", 3), "lg:"); // Bootstrap 3 md = 992px, nearest OmniaCSS breakpoint is lg (1024px)
});

test("components, grid, manual and legacy classes", () => {
  assert.deepEqual(conv("btn"), { kind: "component", to: "oc-btn" });
  assert.equal(conv("btn-primary").to, "");
  assert.equal(conv("btn-outline-danger").to, "oc-btn--outline");
  assert.equal(conv("col-md-6").kind, "grid");
  assert.equal(conv("modal-dialog").kind, "manual");
  assert.equal(conv("col-xs-12").kind, "inactive");
  assert.equal(conv("col-xs-12", 3).kind, "grid");
  assert.equal(conv("panel", 3).to, "oc-card");
  assert.equal(conv("hidden-xs", 3).to, "max-md:d-none");
  assert.equal(conv("show").kind, "state");
  assert.equal(conv("my-own-thing").kind, "custom");
});

test("stylesheet links keep the project's asset prefix", () => {
  assert.deepEqual(linkHrefs("<?php echo ASSETS ?>bootstrap/css/"), ["<?php echo ASSETS ?>css/omnia.css", "<?php echo ASSETS ?>css/omniaui.css", "<?php echo ASSETS ?>css/bootstrap-compat.css"]);
  assert.equal(linkHrefs("https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/")[0], "css/omnia.css");
  assert.equal(linkHrefs("assets/css/")[0], "assets/css/omnia.css");
});

test("compat stylesheet: only the grid classes in use, at OmniaCSS breakpoints", () => {
  const css = compatCss(["row", "col-12", "col-md-6", "g-3"], ["border"], { version: 5, breakpoints: "omnia" });
  assert.match(css, /\.col-12 \{ flex: 0 0 auto; width: 100%; \}/);
  assert.match(css, /@media \(min-width: 50rem\) \{\n  \.col-md-6 \{ flex: 0 0 auto; width: 50%; \}/);
  assert.match(css, /\.g-3 \{ --oc-gutter-x: 1rem; --oc-gutter-y: 1rem; \}/);
  assert.match(css, /\.border \{ border-width: 1px; border-style: solid; border-color: var\(--color-snow-60\); \}/);
  assert.doesNotMatch(css, /col-lg/);
});

let dir;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "omnia-bs-"));
  const w = async (rel, text) => { await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await fs.writeFile(path.join(dir, rel), text); };
  await w("bs5/index.php", `<html><head>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  </head><body>
  <nav class="navbar navbar-expand-lg"></nav>
  <div class="container"><div class="row g-3">
    <div class="col-12 col-md-6 d-flex justify-content-between mt-3 legacy-own">
      <button class="btn btn-primary btn-lg" data-bs-toggle="modal" data-bs-target="#m">Open</button>
      <select class="form-control"><option>a</option></select>
      <input type="radio" class="form-check-input">
      <span class="col-<?= $n ?> text-<?php echo $tone ?> d-none <?= $x ?>">x</span>
      <i class="glyphicon glyphicon-envelope"></i>
    </div>
  </div></div>
  <script src="js/bootstrap.bundle.min.js"></script>
  <script>el.classList.add('btn-primary');</script>
  </body></html>\n`);
  await w("bs5/css/site.css", ".glyphicon { font-family: icons; }\n");
  await w("bs3/page.html", `<div class="row"><div class="col-xs-12 col-sm-6 panel panel-default pull-right hidden-xs"><div class="panel-body">x</div></div></div>\n`);
});
after(async () => { await fs.rm(dir, { recursive: true, force: true }); });

test("codemod on a Bootstrap 5 page (dry run, then write)", async () => {
  const dry = await migrateBootstrap(path.join(dir, "bs5"), { cwd: process.cwd() });
  assert.equal(dry.version, 5);
  assert.equal(dry.files.length, 1);
  const before = await fs.readFile(path.join(dir, "bs5/index.php"), "utf8");
  assert.match(before, /btn btn-primary/, "dry run does not write");

  const r = await migrateBootstrap(path.join(dir, "bs5"), { write: true, cwd: process.cwd() });
  const html = await fs.readFile(path.join(dir, "bs5/index.php"), "utf8");
  assert.match(html, /class="col-12 col-md-6 flex justify-between mt-1 legacy-own"/);
  assert.match(html, /class="oc-btn oc-btn--lg"/);
  assert.match(html, /<select class="oc-select">/);
  assert.match(html, /class="oc-radio"/);
  assert.match(html, /class="col-<\?= \$n \?> text-<\?php echo \$tone \?> d-none <\?= \$x \?>"/, "template code and glued tokens stay as they are");
  assert.match(html, /<link rel="stylesheet" href="css\/omnia.css">\n    <link rel="stylesheet" href="css\/omniaui.css">/);
  assert.equal(r.toggles.get("modal").n, 1);
  assert.ok([...r.manual.values()].some((m) => m.examples.has("navbar")));
  assert.ok([...r.classList.keys()].some((k) => k.startsWith("btn-primary")));
  assert.equal(r.inactive.get("glyphicon").styled, true);
  const compat = await fs.readFile(path.join(dir, "bs5/bootstrap-compat.css"), "utf8");
  assert.match(compat, /\.col-md-6/);

  // A second run must not read the produced mt-1 (OmniaCSS 1rem) as Bootstrap's mt-1 (0.25rem).
  const again = await migrateBootstrap(path.join(dir, "bs5"), { write: true, cwd: process.cwd() });
  assert.equal(again.files.length, 0);
  assert.equal(await fs.readFile(path.join(dir, "bs5/index.php"), "utf8"), html);
});

test("codemod detects Bootstrap 3 and converts its classes", async () => {
  const r = await migrateBootstrap(path.join(dir, "bs3"), { write: true, cwd: process.cwd() });
  assert.equal(r.version, 3);
  const html = await fs.readFile(path.join(dir, "bs3/page.html"), "utf8");
  assert.match(html, /class="col-xs-12 col-sm-6 oc-card float-right max-md:d-none"/);
  assert.match(html, /class="oc-card-content"/);
  const compat = await fs.readFile(path.join(dir, "bs3/bootstrap-compat.css"), "utf8");
  assert.match(compat, /--oc-gutter-x: 30px/);
  assert.match(compat, /\.col-xs-12 \{ flex: 0 0 auto; width: 100%; \}/);
});
