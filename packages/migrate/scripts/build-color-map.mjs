// File: packages/migrate/scripts/build-color-map.mjs
// Build-time: maps every Tailwind default palette color to the nearest Omnia token (OKLab distance)
// and writes src/data/colors.json. Run: node packages/migrate/scripts/build-color-map.mjs
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nearestOmnia } from "../../../scripts/lib/omnia-color.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const { colors } = JSON.parse(fs.readFileSync(path.join(here, "tailwind-palette.json"), "utf8"));

/** oklch(L% C H) -> #rrggbb (gamut clipped). */
function oklchToHex(str) {
  const [, L, C, H] = str.match(/oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)/).map(Number);
  const l = L / 100, a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
  const enc = (v) => { v = Math.min(1, Math.max(0, v)); return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255); };
  return "#" + lin.map((v) => enc(v).toString(16).padStart(2, "0")).join("");
}

const map = { black: "--color-black-100", white: "--color-white-100" };
for (const [name, value] of Object.entries(colors)) map[name] = nearestOmnia(oklchToHex(value), root).token;
const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
fs.writeFileSync(path.join(here, "../src/data/colors.json"), JSON.stringify(sorted, null, 1) + "\n");
console.log(`colors.json: ${Object.keys(sorted).length} entries`);
