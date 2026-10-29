// File: packages/vscode/scripts/record-demo.mjs
// Records the README demo in the real VS Code with this extension loaded (Extension Development Host),
// then frames it like a product shot: window bar with the extension name, 2x stills, a banner built from a still.
// VS Code runs with a throw-away profile; Playwright drives it over the Chromium debug port.
// Map: temp profile + pricing.html -> launch Code (1040px viewport, 2x) -> scripted typing/hovers while frames are captured
//      -> frame (headless Chrome) -> demo.gif + autocomplete/hover/linting.png (2080x1170) + banner.png (1344x672)
// Author: Serge Cools | Framework: OmniaCSS
//
// VS Code path: $VSCODE_PATH, else the default user/system install. Run via `npm run media`.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import gifenc from "gifenc";
import { PNG } from "pngjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const require = createRequire(import.meta.url);
const { load } = require("../src/lib/omnia.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "media", "readme");
const PORT = 9333;
// Content area of the shots (CSS px). With the 30px window bar this is 1040x585, i.e. 2080x1170 at 2x.
const VW = 1040, CONTENT_H = 555, BAR = 30;

const o = await load();
const hex = (token) => o.tokens[token][1];
const BRAND = { from: hex("--color-indigo-50"), to: hex("--color-blue-50"), accent: hex("--color-violet-50") };

function codePath() {
  if (process.env.VSCODE_PATH) return process.env.VSCODE_PATH;
  const candidates = {
    win32: [path.join(process.env.LOCALAPPDATA || "", "Programs/Microsoft VS Code/Code.exe"), "C:/Program Files/Microsoft VS Code/Code.exe"],
    darwin: ["/Applications/Visual Studio Code.app/Contents/MacOS/Electron"],
    linux: ["/usr/share/code/code", "/usr/bin/code"],
  }[process.platform] || [];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error("VS Code not found; set VSCODE_PATH");
  return hit;
}

// ---------------------------------------------------------------------------------------------------------------
// Profile + file

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omnia-rec-"));
const userDir = path.join(tmp, "user");
const work = path.join(tmp, "demo");
fs.mkdirSync(path.join(userDir, "User"), { recursive: true });
fs.mkdirSync(work);
fs.writeFileSync(path.join(userDir, "User", "settings.json"), JSON.stringify({
  "workbench.startupEditor": "none",
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.activityBar.location": "hidden",
  "workbench.statusBar.visible": false,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "workbench.layoutControl.enabled": false,
  "workbench.editor.tabActionLocation": "right",
  "workbench.tips.enabled": false,
  "window.commandCenter": false,
  "window.zoomLevel": 0,
  "editor.colorDecoratorsActivatedOn": "click",
  "breadcrumbs.enabled": false,
  "editor.minimap.enabled": false,
  "editor.scrollbar.vertical": "hidden",
  "editor.overviewRulerBorder": false,
  "editor.hideCursorInOverviewRuler": true,
  "editor.fontSize": 15,
  "editor.lineHeight": 26,
  "editor.padding.top": 10,
  "editor.cursorBlinking": "solid",
  "editor.hover.delay": 250,
  "editor.quickSuggestions": { strings: "on" },
  "editor.suggest.showStatusBar": false,
  "editor.renderWhitespace": "none",
  "editor.renderLineHighlight": "line",
  "editor.guides.indentation": false,
  "editor.lightbulb.enabled": "off",
  "security.workspace.trust.enabled": false,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.ignoreRecommendations": true,
  "chat.disableAIFeatures": true,
  "html.autoClosingTags": false,
}));
// A pricing card in plain HTML: OmniaUI component classes, RAL colors, Omnia color tokens and a container query.
const file = path.join(work, "pricing.html");
fs.writeFileSync(file, [
  "<style>",
  "  .plan-price { color: var(--color-ral5002); }",
  "  .plan-note { color:  }",
  "</style>",
  '<section class="cq-inline grid cq-md:grid-cols-2 gap-2">',
  '  <article class="">',
  '    <h2 class="text-balance font-bold">Team</h2>',
  '    <p class="plan-price">EUR 29 / month</p>',
  '    <p class="plan-note">Billed yearly</p>',
  '    <a class="oc-btn focsu-visible:outline" href="/order">Order</a>',
  "  </article>",
  "</section>",
  "",
].join("\n"));

const code = spawn(codePath(), [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`, `--extensions-dir=${path.join(tmp, "ext")}`,
  `--extensionDevelopmentPath=${root}`, "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--new-window", file,
], {
  stdio: "ignore",
  // Started from a VS Code terminal these would hand the window to the running VS Code instead.
  env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ELECTRON_RUN_AS_NODE|VSCODE_)/.test(k))),
});

let browser;
for (let i = 0; i < 60 && !browser; i++) {
  await new Promise((r) => setTimeout(r, 500));
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => null);
}
if (!browser) throw new Error("Could not connect to VS Code");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("workbench")) || ctx.pages()[0];
await page.waitForSelector(".monaco-editor .view-lines", { timeout: 30000 });

// Only the editor: close the side bars, size the window so the editor part (tabs + editor) is VW x CONTENT_H,
// and render at 2x (the layout keeps the real window size).
await page.waitForTimeout(1500);
const visible = (sel) => page.evaluate((sel) => (document.querySelector(sel)?.offsetWidth || 0) > 0, sel);
if (await visible(".part.sidebar")) await page.keyboard.press("Control+B");
if (await visible(".part.auxiliarybar")) await page.keyboard.press("Control+Alt+B");
await page.evaluate(([w, h]) => {
  const top = document.querySelector(".part.editor").getBoundingClientRect().y;
  window.resizeTo(w + outerWidth - innerWidth, Math.round(top + h) + outerHeight - innerHeight);
}, [VW, CONTENT_H]);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 0, height: 0, deviceScaleFactor: 2, mobile: false });
await page.waitForTimeout(2500);
/** 2x PNG of a CSS-px rect (Playwright's own screenshot ignores the emulated scale). */
const grab = async (c) => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...c, scale: 1 } })).data, "base64");

// A visible pointer: the screen capture has none.
await page.evaluate(() => {
  const m = document.createElement("div");
  m.id = "oc-pointer";
  // VS Code enforces Trusted Types, so no innerHTML.
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const arrow = document.createElementNS(ns, "path");
  for (const [k, v] of Object.entries({ viewBox: "0 0 16 22", width: 16, height: 22 })) svg.setAttribute(k, v);
  for (const [k, v] of Object.entries({ d: "M1 1v17l4.5-4.2 3 6.6 2.6-1.2-3-6.4H14z", fill: "#fff", stroke: "#000", "stroke-width": 1.2 })) arrow.setAttribute(k, v);
  svg.appendChild(arrow);
  m.appendChild(svg);
  m.style.cssText = "position:fixed;z-index:99999;pointer-events:none;display:none";
  document.body.appendChild(m);
});

// ---------------------------------------------------------------------------------------------------------------
// Capture loop: 2x screenshots of the editor part while the script plays

const clip = await page.evaluate(() => {
  const r = document.querySelector(".part.editor").getBoundingClientRect();
  return { x: r.x, y: r.y, width: Math.round(r.width), height: Math.round(r.height) };
});
if (clip.width < VW || clip.height < CONTENT_H) console.warn(`[media] editor is ${clip.width}x${clip.height}px, expected ${VW}x${CONTENT_H}px`);
Object.assign(clip, { width: Math.min(clip.width, VW), height: Math.min(clip.height, CONTENT_H) });
let caption = "OmniaUI classes";
const frames = [];
let recording = true;
const capture = (async () => {
  while (recording) frames.push({ buf: await grab(clip), t: Date.now(), caption });
})();
const stills = {};
const still = async (name) => { await page.waitForTimeout(150); stills[name] = await grab(clip); };

/** Screen rect of `text` in the editor (first occurrence). */
async function textRect(text) {
  return page.evaluate((text) => {
    for (const line of document.querySelectorAll(".monaco-editor .view-line")) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node, acc = [];
      while ((node = walker.nextNode())) acc.push(node);
      const full = acc.map((n) => n.textContent).join("").replace(/\u00a0/g, " ");
      let at = full.indexOf(text);
      if (at < 0) continue;
      for (const n of acc) {
        if (at < n.textContent.length) {
          const range = document.createRange();
          range.setStart(n, at);
          range.setEnd(n, Math.min(n.textContent.length, at + text.length));
          const r = range.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }
        at -= n.textContent.length;
      }
    }
    return null;
  }, text);
}

async function mouseTo(x, y, steps = 12) {
  await page.evaluate(() => { document.getElementById("oc-pointer").style.display = "block"; });
  const from = await page.evaluate(() => { const p = document.getElementById("oc-pointer"); return { x: parseFloat(p.style.left) || 700, y: parseFloat(p.style.top) || 420 }; });
  for (let i = 1; i <= steps; i++) {
    const px = from.x + ((x - from.x) * i) / steps, py = from.y + ((y - from.y) * i) / steps;
    await page.mouse.move(px, py);
    await page.evaluate(([px, py]) => { const p = document.getElementById("oc-pointer"); p.style.left = px + "px"; p.style.top = py + "px"; }, [px, py]);
    await page.waitForTimeout(25);
  }
}
async function hoverText(text, offset = 0.5) {
  const r = await textRect(text);
  if (!r) throw new Error("Not on screen: " + text);
  await mouseTo(r.x + Math.min(r.w * offset, 30), r.y + r.h / 2);
}
const hidePointer = async () => {
  await page.mouse.move(5, 5);
  await page.evaluate(() => { document.getElementById("oc-pointer").style.display = "none"; });
};
const key = (k, wait = 250) => page.keyboard.press(k).then(() => page.waitForTimeout(wait));
const type = (t) => page.keyboard.type(t, { delay: 140 });

// ---------------------------------------------------------------------------------------------------------------
// Script

/** Cursor to the end of line `n` (0-based), then `back` characters to the left. */
async function goTo(n, back) {
  await key("Control+Home", 100);
  for (let i = 0; i < n; i++) await key("ArrowDown", 50);
  await key("End", 100);
  for (let i = 0; i < back; i++) await key("ArrowLeft", 20);
  await page.waitForTimeout(400);
}
const suggest = () => page.waitForSelector(".suggest-widget.visible", { timeout: 5000 });

// 1. OmniaUI component classes inside the empty class="".
caption = "OmniaUI classes";
await goTo(5, 2);
await type("oc-card");
await suggest();
await page.waitForTimeout(500);
// Open the details panel once (it stays open for later lists).
if (!(await page.$(".suggest-widget.docs-side, .suggest-widget.docs-below"))) await key("Control+Space", 500);
await page.waitForTimeout(1200);
await still("components");
await key("Escape", 300);

// 2. RAL colors with their mix steps.
caption = "RAL and Omnia colors";
await type(" bg-ral30");
await suggest();
for (let i = 0; i < 4; i++) await key("ArrowDown", 280);
await page.waitForTimeout(900);
await still("autocomplete");
await key("Escape", 300);
await type("20-mix-20");
await key("Escape", 600);

// 3. Color tokens in CSS.
caption = "Color tokens";
await goTo(2, 2);
await type("var(--color-ral");
await suggest().catch(() => {});
await page.waitForTimeout(1400);
await still("tokens");
await key("Escape", 300);
await type("3020)");
await key("Escape", 900);

// 4. Hover: the container-query variant and the RAL mix class.
caption = "Hover preview";
await hoverText("cq-md:grid-cols-2");
await page.waitForSelector(".monaco-hover:not(.hidden)", { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2600);
await still("hover");
await hoverText("bg-ral3020-mix-20", 0.6);
await page.waitForTimeout(2400);

// 5. A typo in a variant, fixed with the quick fix.
caption = "Linting";
await hoverText("focsu", 0.4);
await page.waitForTimeout(2200);
await still("linting");
const r = await textRect("focsu");
await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
await page.waitForTimeout(300);
await key("Control+.", 1400);
await key("Enter", 1000);
await hidePointer();
await page.waitForTimeout(2000);

recording = false;
await capture;
await browser.close().catch(() => {});
code.kill();

// ---------------------------------------------------------------------------------------------------------------
// Framing in headless Chrome: window bar, stills, banner

const shooter = await chromium.launch({ channel: process.env.OMNIA_BROWSER || "chrome" }).catch(() => chromium.launch({ channel: "msedge" }));
const dataUrl = (buf) => "data:image/png;base64," + buf.toString("base64");
const BAR_CSS = `.bar{height:${BAR}px;display:flex;align-items:center;position:relative;background:#181818;border-bottom:1px solid #2b2b2b;font:12.5px "Segoe UI",system-ui,sans-serif;color:#9d9d9d}
.dots{display:flex;gap:8px;padding-left:12px}.dots i{width:12px;height:12px;border-radius:50%;background:#3c3c3c}
.bar b{position:absolute;inset:0;display:grid;place-items:center;font-weight:400}.bar b span{color:#cccccc}`;
const barHtml = (title) => `<div class="bar"><div class="dots"><i></i><i></i><i></i></div><b><div>OmniaCSS IntelliSense${title ? ` <span>· ${title}</span>` : ""}</div></b></div>`;

async function render(html, width, height, scale, file) {
  const p = await shooter.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await p.setContent(`<!doctype html><style>*{margin:0;box-sizing:border-box}body{width:${width}px;height:${height}px;overflow:hidden;background:#181818}${BAR_CSS}</style>${html}`);
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  const buf = await p.screenshot(file ? { path: file } : {});
  await p.close();
  return buf;
}

fs.mkdirSync(out, { recursive: true });
const shotH = BAR + clip.height;
for (const [name, buf] of Object.entries(stills)) {
  await render(`${barHtml("")}<img src="${dataUrl(buf)}" style="display:block;width:${clip.width}px;height:${clip.height}px">`, clip.width, shotH, 2, path.join(out, name + ".png"));
  console.log(`[media] media/readme/${name}.png (${clip.width * 2}x${shotH * 2})`);
}

// Banner (1344x672): name and features on the left, the OmniaUI completion shot on the right, an Omnia color strip below.
const bw = 672, bh = 336;
const strip = ["--color-vividblue-80", "--color-indigo-60", "--color-violet-50", "--color-magenta-50", "--color-ral3020", "--color-orange-50", "--color-ral1023", "--color-teal-60", "--color-green-70", "--color-ral5002"]
  .map((t) => `<i style="flex:1;background:${hex(t)}"></i>`).join("");
await render(`<div style="position:relative;width:${bw}px;height:${bh}px;overflow:hidden;background:#0d0d12;font-family:'Segoe UI',system-ui,sans-serif;color:#fff">
  <div style="position:absolute;inset:0;background:radial-gradient(70% 80% at 0% 100%,${BRAND.from}55,transparent 70%),radial-gradient(50% 60% at 100% 0%,${BRAND.accent}33,transparent 70%)"></div>
  <img src="${dataUrl(stills.components)}" style="position:absolute;left:300px;top:34px;width:430px;border-radius:8px;border:1px solid #ffffff1f;box-shadow:0 24px 60px -20px #000;transform:perspective(900px) rotateY(-14deg);transform-origin:left center">
  <div style="position:absolute;left:36px;top:58px;display:grid;gap:14px;width:250px">
    <img src="${dataUrl(fs.readFileSync(path.join(root, "media", "icon.png")))}" style="width:46px;height:46px">

    <div style="font-size:30px;font-weight:700;letter-spacing:-.5px;line-height:1.05">OmniaCSS<br>IntelliSense</div>
    <div style="font-size:12.5px;line-height:1.55;opacity:.8">Utilities, variants, OKLCH and RAL colors<br>and OmniaUI classes, in VS Code and Cursor.</div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:8px;display:flex">${strip}</div></div>`, bw, bh, 2, path.join(out, "banner.png"));
console.log("[media] media/readme/banner.png (1344x672)");

// GIF frames: 2x captures halved, under a window bar that names the feature on screen.
const bars = {};
for (const c of new Set(frames.map((f) => f.caption))) bars[c] = PNG.sync.read(await render(barHtml(c), clip.width, BAR, 1));
await shooter.close();

function halve(png) {
  const w = png.width >> 1, h = png.height >> 1, src = png.data, dst = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    const i = ((y * 2) * png.width + x * 2) * 4 + c, j = i + png.width * 4;
    dst[(y * w + x) * 4 + c] = (src[i] + src[i + 4] + src[j] + src[j + 4] + 2) >> 2;
  }
  return dst;
}
const width = clip.width, height = shotH;
const decoded = frames.map((f) => {
  const body = halve(PNG.sync.read(f.buf));
  return { ...f, data: Buffer.concat([bars[f.caption].data, body.subarray(0, width * clip.height * 4)]) };
});

// One shared palette, pixels that did not change are transparent (keeps the file small),
// identical consecutive frames are merged and the delay follows the real timing.
const sample = Buffer.concat(decoded.filter((_, i) => i % Math.ceil(decoded.length / 12) === 0).map((f) => f.data));
const palette = quantize(sample, 255);
while (palette.length < 256) palette.push([0, 0, 0]);
const CLEAR = 255;
const gif = GIFEncoder();
let kept = 0, prev = null;
for (let i = 0; i < decoded.length; i++) {
  const f = decoded[i];
  while (decoded[i + 1] && decoded[i + 1].data.equals(f.data)) i++;
  const end = decoded[i + 1]?.t ?? f.t + 2500;
  const index = applyPalette(f.data, palette);
  if (prev) for (let p = 0; p < index.length; p++) if (prev.readUInt32LE(p * 4) === f.data.readUInt32LE(p * 4)) index[p] = CLEAR;
  gif.writeFrame(index, width, height, { palette: kept ? undefined : palette, delay: Math.max(40, end - f.t), repeat: 0, transparent: kept > 0, transparentIndex: CLEAR, dispose: 1 });
  prev = f.data;
  kept++;
}
gif.finish();
fs.writeFileSync(path.join(out, "demo.gif"), gif.bytes());
console.log(`[media] media/readme/demo.gif: ${width}x${height}, ${kept} frames (${frames.length} captured), ${(gif.bytes().length / 1024).toFixed(0)} KB, ${((frames.at(-1).t - frames[0].t) / 1000).toFixed(1)} s`);

setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }), 1500);
