// File: packages/cli/test/wrappers.test.mjs
// Tests that the content scan follows imports from the OmniaUI React/Vue wrappers into node_modules (0.14.5):
// only the imported components (+ what they import), names built in code, namespace imports, opt-out.
// Map: helper (temp project with a fake @birdycom/omniaui-react and -vue) -> named import -> internal import ->
//      template-literal modifier -> unused component stays out -> namespace import -> vue -> wrappers: false

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectCandidates } from "../../core/src/engine.mjs";

async function project(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omnia-wrappers-"));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
  return dir;
}

const react = "node_modules/@birdycom/omniaui-react";
const vue = "node_modules/@birdycom/omniaui-vue";
const pkg = (name) => JSON.stringify({ name, version: "0.14.5" });
const files = {
  [`${react}/package.json`]: pkg("@birdycom/omniaui-react"),
  [`${react}/src/components/PriceCard.tsx`]: 'import { Segmented } from "./Segmented";\nexport function PriceCard({ kind }) { return <p className={`oc-price-card__price oc-price-card__price--${kind}`} />; }\nexport const PriceCardNote = 1;',
  [`${react}/src/components/Segmented.tsx`]: 'export function Segmented() { return <div className="oc-segmented" />; }',
  [`${react}/src/components/OtpInput.tsx`]: 'export function OtpInput() { return <input className="oc-otp" />; }',
  [`${react}/src/components/Unused.tsx`]: 'export function Unused() { return <div className="oc-unused-thing" />; }',
  [`${vue}/package.json`]: pkg("@birdycom/omniaui-vue"),
  [`${vue}/src/components/OcBadge.vue`]: '<template><span class="oc-badge" /></template>',
  [`${vue}/src/components/OcCard.vue`]: '<template><div class="oc-card" /></template>',
};

test("named imports scan the imported components and what they import, nothing else", async () => {
  const dir = await project({ ...files, "src/App.tsx": 'import { PriceCard, type PriceCardProps, OtpInput as Code } from "@birdycom/omniaui-react";' });
  const { candidates, files: scanned } = await collectCandidates(["src/**/*.tsx"], dir);
  assert.ok(candidates.has("oc-otp"));
  assert.ok(candidates.has("oc-segmented"), "Segmented is imported by PriceCard");
  assert.ok(candidates.has("oc-price-card__price--*"), "modifier built in a template literal keeps its family");
  assert.ok(!candidates.has("oc-unused-thing"));
  assert.equal(scanned.filter((f) => f.includes("node_modules")).length, 3);
});

test("a namespace import scans every component; Vue components by file name", async () => {
  const dir = await project({ ...files, "src/a.tsx": 'import * as UI from "@birdycom/omniaui-react";', "src/b.vue": "<script setup>import { OcBadge } from '@birdycom/omniaui-vue'</script>" });
  const { candidates } = await collectCandidates(["src/**/*.{tsx,vue}"], dir);
  assert.ok(candidates.has("oc-unused-thing"));
  assert.ok(candidates.has("oc-badge"));
  assert.ok(!candidates.has("oc-card"));
});

test("wrappers: false keeps node_modules out; no import, no extra files", async () => {
  const dir = await project({ ...files, "src/App.tsx": 'import { OtpInput } from "@birdycom/omniaui-react";', "src/plain.html": '<div class="oc-card"></div>' });
  assert.ok(!(await collectCandidates(["src/**/*.tsx"], dir, { wrappers: false })).candidates.has("oc-otp"));
  const { files: scanned } = await collectCandidates(["src/**/*.html"], dir);
  assert.equal(scanned.length, 1);
});
