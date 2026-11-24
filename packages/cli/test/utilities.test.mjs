// File: packages/cli/test/utilities.test.mjs
// Tests utility classes in the built OmniaCSS (packages/core/dist): long-word wrapping (v0.17.3).
// Map: helpers -> overflow-wrap utilities (full + starter build) -> docs page
// Needs packages/core/dist (run "npm run build" in the repo root first; "npm test" does that).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = async (f) => (await fs.readFile(path.join(root, f), "utf8")).replace(/\r\n/g, "\n");
// The overflow-wrap value of the rule for .cls; the minified file may share it (".break-words,.wrap-break-word{...}").
const rule = (css, cls) =>
  new RegExp(`(?:^|[},\\s])\\.${cls}\\s*(?:,[^{}]*)?\\{\\s*overflow-wrap:\\s*([\\w-]+);?\\s*\\}`).exec(css)?.[1];

test("overflow-wrap utilities: break-words, wrap-break-word, wrap-anywhere", async () => {
  for (const file of ["packages/core/dist/omnia.css", "packages/core/dist/omnia.min.css", "packages/core/dist/omnia.starter.css"]) {
    const css = await read(file);
    assert.equal(rule(css, "break-words"), "break-word", `${file}: .break-words`);
    assert.equal(rule(css, "wrap-break-word"), "break-word", `${file}: .wrap-break-word`);
    assert.equal(rule(css, "wrap-anywhere"), "anywhere", `${file}: .wrap-anywhere`);
  }
});

test("docs: advanced typography documents the long-word utilities with a v0.17.3 badge", async () => {
  const html = await read("apps/docs/src/content/docs/typography/advanced.html");
  assert.match(html, /id="long-words">[^<]*<span class="oc-badge-version">v0\.17\.3<\/span>/);
  assert.match(html, /<code>\.break-words<\/code><\/td><td>overflow-wrap: break-word/);
  assert.match(html, /<code>\.wrap-anywhere<\/code><\/td><td>overflow-wrap: anywhere/);
  const desc = /"description":"([^"]*)"/.exec(html)[1];
  assert.ok(desc.length >= 120 && desc.length <= 160, `meta description is ${desc.length} characters`);
});
