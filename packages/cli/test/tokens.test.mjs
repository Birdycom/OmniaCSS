// File: packages/cli/test/tokens.test.mjs
// Tests "omniacss tokens": the semantic tokens resolved for desktop apps (json, dtcg, python, css).
// Map: helpers -> json (per mode, resolved, version) -> gamut mapping -> dtcg -> python -> css -> errors
// Needs packages/core/dist (run "npm run build" in the repo root first; "npm test" does that).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gamutMap, toHex, clipSrgb } from "@birdycom/omniacss/tokens/export";

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/omniacss.mjs");
const run = (cwd, ...args) => execFileSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "omnia-tokens-"));
const { version } = JSON.parse(await fs.readFile(new URL("../../core/package.json", import.meta.url), "utf8"));

test("json: every color resolved per mode to hex + oklch, with the OmniaCSS version", async () => {
  const dir = await tmp();
  run(dir, "tokens", "--format", "json", "--out", "tokens/omnia.tokens.json");
  const data = JSON.parse(await fs.readFile(path.join(dir, "tokens/omnia.tokens.json"), "utf8"));
  assert.equal(data.omniacss, version);
  assert.deepEqual(data.modes, ["light", "dark"]);
  for (const name of ["background", "foreground", "primary", "border", "ring", "row-alt", "hover", "pressed", "selected", "selected-foreground", "disabled-foreground"]) {
    for (const mode of ["light", "dark"]) {
      assert.match(data.tokens[name][mode].hex, /^#[0-9a-f]{6}$/, `${name} ${mode}`);
      assert.match(data.tokens[name][mode].oklch, /^oklch\(/);
    }
  }
  // var(--oc-ring) -> var(--oc-primary) -> var(--color-vividblue-95) becomes one final value.
  assert.deepEqual(data.tokens.ring, data.tokens.primary);
  assert.deepEqual(data.tokens.primary.light.hex, "#175dbe");
  assert.equal(data.tokens.radius.px, 8);
  assert.equal(data.tokens["focus-width"].px, 2);
  assert.equal(data.tokens["font-sans"].windows, "Segoe UI");
  assert.equal(data.tokens["text-base"].px, 15);
  assert.ok(!JSON.stringify(data).includes("var("), "no var() left");
});

test("gamut mapping: out-of-sRGB colors keep their hue (CSS Color 4), not per-channel clipping", async () => {
  const dir = await tmp();
  const data = JSON.parse(run(dir, "tokens", "--out", "-"));
  const t = data.tokens;
  // The colors HistoryTabs found outside sRGB (doc/OmniaCSS-desktop-tokens.pdf, 3.3). Reference: colorjs.io toGamut({ method: "css" }).
  const expected = {
    "background.light": "#f2f6ff", "foreground.dark": "#eff3ff",
    "destructive.light": "#df0000", "destructive.dark": "#ff2b1f",
    "success.light": "#007700", "warning.light": "#9f5d00", "warning.dark": "#ffaa27",
  };
  for (const [key, hex] of Object.entries(expected)) {
    const [name, mode] = key.split(".");
    assert.equal(t[name][mode].gamutMapped, true, `${key} is outside sRGB`);
    assert.equal(t[name][mode].hex, hex, key);
  }
  // Clipping would shift warning (light) toward red: #b15000.
  assert.equal(t.warning.light.clippedHex, "#b15000");
  // In-gamut colors are untouched; white and black stay white and black.
  assert.equal(toHex(gamutMap({ l: 1, c: 0.1, h: 30 })), "#ffffff");
  assert.equal(toHex(gamutMap({ l: 0, c: 0.1, h: 30 })), "#000000");
  const inGamut = { l: 0.5, c: 0.05, h: 250 };
  assert.equal(toHex(gamutMap(inGamut)), toHex(clipSrgb(inGamut)));
});

test("transparent tokens keep alpha apart and get a pre-blended opaque hex", async () => {
  const data = JSON.parse(run(await tmp(), "tokens", "--out", "-"));
  assert.equal(data.tokens.surface.light.alpha, 0.04);
  assert.match(data.tokens.surface.light.opaqueHex, /^#[0-9a-f]{6}$/);
});

test("dtcg: W3C Design Tokens with light as $value and dark in $extensions", async () => {
  const data = JSON.parse(run(await tmp(), "tokens", "--format", "dtcg", "--out", "-"));
  const bg = data.color.background;
  assert.equal(bg.$type, "color");
  assert.equal(bg.$value.hex, "#f2f6ff");
  assert.equal(bg.$value.colorSpace, "srgb");
  assert.equal(bg.$extensions["com.birdycom.omniacss"].modes.dark.hex, "#010121");
  assert.equal(data.$extensions["com.birdycom.omniacss"].version, version);
  assert.equal(data.shadow.md.$type, "shadow");
});

test("python: PALETTES light/dark with the same keys, importable by Python", async () => {
  const dir = await tmp();
  run(dir, "tokens", "--format", "python", "--out", "omnia_tokens.py");
  const src = await fs.readFile(path.join(dir, "omnia_tokens.py"), "utf8");
  assert.match(src, new RegExp(`OMNIACSS_VERSION = "${version.replace(/\./g, "\\.")}"`));
  assert.match(src, /"row_alt": "#[0-9a-f]{6}"/);
  const python = ["python", "py", "python3"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);
  if (!python) return; // Python not installed: the text checks above still ran.
  const code = "import json, omnia_tokens as t; print(json.dumps([t.OMNIACSS_VERSION, sorted(t.PALETTES['light']) == sorted(t.PALETTES['dark']), t.PALETTES['dark']['background'], t.SIZES['radius']]))";
  const out = JSON.parse(execFileSync(python, ["-c", code], { cwd: dir, encoding: "utf8" }));
  assert.deepEqual(out, [version, true, "#010121", 8]);
});

test("css: light-dark() of Omnia palette tokens, the same source as the export", async () => {
  const css = run(await tmp(), "tokens", "--format", "css", "--out", "-");
  assert.match(css, /--oc-background: light-dark\(var\(--color-frostblue-2\), var\(--color-shallowblue-95\)\);/);
  assert.match(css, /--oc-ring: var\(--oc-primary\);/);
  assert.match(css, /--oc-hover: light-dark\(/);
  assert.match(css, /--oc-shadow-md: 0px 4px 12px -2px var\(--oc-shadow-md-color\);/);
  assert.doesNotMatch(css, /#[0-9a-f]{6}/i, "no hard-coded hex in the theme CSS");
});

test("unknown format fails with a clear message", async () => {
  const res = spawnSync(process.execPath, [bin, "tokens", "--format", "xml"], { cwd: await tmp(), encoding: "utf8" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /unknown format "xml"/);
});
