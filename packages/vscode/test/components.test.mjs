// Tests for the OmniaUI class index: parsing component sheets and overlaying the packages a project installed.
// Needs dist/ (npm run build in this folder).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseSheet, loadComponents } = require("../src/lib/components.cjs");

test("parseSheet: own rule first, at-rules kept, keyframes and comments skipped", () => {
  const classes = parseSheet(`
    /* .oc-ghost { color: red } */
    .oc-card .oc-btn { margin: 0 }
    .oc-btn, .oc-link { display: inline-flex; background: url("a;b.svg"); }
    @media (width < 40rem) { .oc-btn { padding: 0.25rem } }
    @keyframes oc-spin { to { rotate: 1turn } }
    .oc-btn::after { content: "}"; }
  `);
  assert.equal(classes["oc-ghost"], undefined);
  assert.deepEqual(classes["oc-btn"][0], [[], ".oc-btn, .oc-link", ["display: inline-flex", 'background: url("a;b.svg")']]);
  assert.deepEqual(classes["oc-btn"][1], [["@media (width < 40rem)"], ".oc-btn", ["padding: 0.25rem"]]);
  assert.deepEqual(classes["oc-btn"][2], [[], ".oc-card .oc-btn", ["margin: 0"]]);
  assert.equal(classes["oc-btn"].length, 4);
  assert.ok(classes["oc-card"] && classes["oc-link"]);
  assert.equal(Object.keys(classes).some((n) => n.includes("spin")), false);
});

test("bundled OmniaUI classes", () => {
  const c = loadComponents([]);
  for (const name of ["oc-btn", "oc-card", "oc-tooltip", "oc-tooltip__title", "oc-carousel--loop"]) assert.ok(c.has(name), name);
  assert.ok(c.names.some((n) => n.startsWith("oc-block-")), "block classes");
  assert.match(c.cssFor("oc-btn"), /^\.oc-btn[\s,{]/);
  assert.match(c.origin("oc-btn"), /^OmniaUI \S* ?\(bundled\)$/);
});

test("a project's installed packages win, Pro only when installed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omnia-vscode-"));
  const add = (name, file, version, css) => {
    const base = path.join(dir, "node_modules", name);
    fs.mkdirSync(path.join(base, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(base, "package.json"), JSON.stringify({ name, version }));
    fs.writeFileSync(path.join(base, file), css);
  };
  try {
    assert.equal(loadComponents([dir]).has("oc-block-chat"), false);
    add("@birdycom/omniaui", "dist/components.css", "9.9.9", ".oc-only-here { gap: 1rem }");
    add("@birdycom/omniaui-pro", "dist/pro.css", "9.9.9", ".oc-block-chat { display: grid }");
    const sub = path.join(dir, "apps/site");
    fs.mkdirSync(sub, { recursive: true });
    const c = loadComponents([sub]);
    assert.ok(c.has("oc-only-here"));
    assert.equal(c.has("oc-tooltip"), false, "the installed components.css replaces the bundled one");
    assert.equal(c.origin("oc-block-chat"), "OmniaUI Pro 9.9.9");
    assert.ok(c.names.some((n) => n.startsWith("oc-block-") && n !== "oc-block-chat"), "bundled blocks stay");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
