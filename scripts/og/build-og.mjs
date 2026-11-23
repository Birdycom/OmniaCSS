// File: scripts/og/build-og.mjs
// Makes the share images (og:image / twitter:image, 1200 x 630 PNG) from scripts/og/og-image.html with headless Chrome.
// Map: find Chrome -> per site: screenshot og-image.html?site=<key> -> public/img/og-<key>.png
// Usage: node scripts/og/build-og.mjs                       (OmniaCSS: public/img/og-omniacss.png)
//        node scripts/og/build-og.mjs --omniaui ../omniaUI   (also OmniaUI: <repo>/public/img/og-omniaui.png)
// Chrome: CHROME_PATH, else the usual Chrome / Edge install folders. Not part of the build: run it when the text changes.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const args = process.argv.slice(2);
const uiRepo = args.includes("--omniaui") ? path.resolve(args[args.indexOf("--omniaui") + 1] || "../omniaUI") : null;

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chrome = candidates.find((p) => fs.existsSync(p));
if (!chrome) throw new Error("Chrome not found: set CHROME_PATH");

const jobs = [["omniacss", path.join(root, "public/img/og-omniacss.png")]];
if (uiRepo) jobs.push(["omniaui", path.join(uiRepo, "public/img/og-omniaui.png")]);

for (const [site, out] of jobs) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const url = `${pathToFileURL(path.join(here, "og-image.html")).href}?site=${site}`;
  const run = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,630", "--virtual-time-budget=2000", `--screenshot=${out}`, url], { encoding: "utf8" });
  if (run.status !== 0 || !fs.existsSync(out)) throw new Error(`[og] ${site} failed:\n${run.stderr}`);
  console.log(`[og] ${path.relative(process.cwd(), out)}`);
}
