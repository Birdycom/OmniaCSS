// File: packages/migrate/scripts/extract-palette.mjs
// One-off helper: re-extract the default palette (oklch) from an installed tailwindcss theme.css into tailwind-palette.json.
// Usage: node scripts/extract-palette.mjs <path/to/node_modules/tailwindcss/theme.css>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(process.argv[2], "utf8");
const colors = {};
for (const m of css.matchAll(/--color-([a-z]+-\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+(none|[\d.]+)\)/g)) colors[m[1]] = `oklch(${m[2]}% ${m[3]} ${m[4] === "none" ? 0 : m[4]})`;
fs.writeFileSync(path.join(here, "tailwind-palette.json"), JSON.stringify({ _note: "Tailwind default palette (oklch), input for build-color-map.mjs", colors }, null, 1));
console.log(Object.keys(colors).length, "colors");
