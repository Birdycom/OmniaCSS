// File: packages/vscode/scripts/build-media.mjs
// Renders the extension icon in Omnia palette colors (headless Chrome or Edge).
// The demo GIF, the feature stills and the banner come from the VS Code recording in record-demo.mjs.
// Map: Omnia tokens -> icon HTML -> PNG
// Author: Serge Cools | Framework: OmniaCSS
//
// Run via `npm run media` (needs the devDependencies: `npm install --prefix packages/vscode`).

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const { load } = require("../src/lib/omnia.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const media = path.join(root, "media");
const o = await load();

// Omnia palette (sRGB fallbacks from the index).
const hex = (token) => o.tokens[token][1];
const BRAND = { from: hex("--color-indigo-50"), to: hex("--color-blue-50"), accent: hex("--color-violet-50") };

// Icon

const ICON = `<!doctype html><style>*{margin:0}body{width:128px;height:128px;background:transparent}
div{width:128px;height:128px;border-radius:26px;background:linear-gradient(135deg,${BRAND.from},${BRAND.to});display:flex;align-items:center;justify-content:center;
font:800 50px/1 "Cascadia Code",Consolas,monospace;color:#fff;letter-spacing:-4px;white-space:nowrap}span{color:${BRAND.accent}}</style><div>oc<span>:</span></div>`;


// ---------------------------------------------------------------------------------------------------------------

const browser = await chromium.launch({ channel: process.env.OMNIA_BROWSER || "chrome" }).catch(() => chromium.launch({ channel: "msedge" }));
await fs.mkdir(path.join(media, "readme"), { recursive: true });

async function shot(html, w, h, file, transparent = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: file, omitBackground: transparent });
  await page.close();
  console.log("[media]", path.relative(root, file));
}
await shot(ICON, 128, 128, path.join(media, "icon.png"), true);
await browser.close();
