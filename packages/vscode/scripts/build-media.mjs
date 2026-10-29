// File: packages/vscode/scripts/build-media.mjs
// Renders the extension icon in the OmniaCSS brand colors (headless Chrome or Edge).
// The demo GIF, the feature stills and the banner come from the VS Code recording in record-demo.mjs.
// Map: brand colors -> icon SVG -> PNG
// Author: Serge Cools | Framework: OmniaCSS
//
// Run via `npm run media` (needs the devDependencies: `npm install --prefix packages/vscode`).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const media = path.join(root, "media");

// The OmniaCSS accent: the same gradient as the favicon on omniacss.eu (public/favicon.svg).
const BRAND = { from: "#6366f1", to: "#ec4899", code: "#7c4fd8" };

// Icon: the OmniaCSS palette with a code badge. Rendered at 256 px so it stays sharp on HiDPI screens.

const PALETTE = "M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3a2 2 0 0 1 2-2h2.3A5.6 5.6 0 0 0 22 10c0-4.4-4.5-8-10-8z";
const ICON = `<!doctype html><style>*{margin:0}body{width:256px;height:256px;background:transparent}svg{display:block}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BRAND.from}"/><stop offset="1" stop-color="${BRAND.to}"/></linearGradient></defs>
<rect width="128" height="128" rx="28" fill="url(#g)"/>
<g transform="translate(12 12) scale(3.3)" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="${PALETTE}"/></g>
<circle cx="95" cy="95" r="25" fill="#fff"/>
<path d="M86 86l-8 9 8 9M104 86l8 9-8 9M98 84l-6 22" fill="none" stroke="${BRAND.code}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;


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
await shot(ICON, 256, 256, path.join(media, "icon.png"), true);
await browser.close();
