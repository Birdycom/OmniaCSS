// File: packages/mcp/scripts/build.mjs
// Collects the knowledge the MCP server ships with into packages/mcp/dist.
// The class index and the lookup code are the ones the editor extension uses, so both answer the same way.
// Map: ../vscode/dist (index, components, variants.mjs) + ../vscode/src/lib (omnia, components, color)
//      + public/data/search-index.json (docs pages)
//      + OmniaUI (components, blocks, their HTML, the React/Vue names, the Pro list, omniaui.eu docs) -> dist/
// OmniaUI comes from ../omniaUI next to this repo (or $OMNIAUI_DIR) when present, otherwise from jsDelivr (CI).
// Run: "npm run build" here, after "npm run vscode:build" in the repository root. Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(pkgDir, "../..");
const vscode = path.join(repo, "packages/vscode");
const omniaUI = process.env.OMNIAUI_DIR ?? path.resolve(repo, "../omniaUI");
const out = path.join(pkgDir, "dist");
const version = JSON.parse(await fs.readFile(path.join(repo, "packages/core/package.json"), "utf8")).version;

const FILES = [
  [path.join(vscode, "dist/index.json.gz"), "index.json.gz"],
  [path.join(vscode, "dist/components.json.gz"), "components.json.gz"],
  [path.join(vscode, "dist/variants.mjs"), "variants.mjs"],
  [path.join(vscode, "src/lib/omnia.cjs"), "lib/omnia.cjs"],
  [path.join(vscode, "src/lib/components.cjs"), "lib/components.cjs"],
  [path.join(vscode, "src/lib/color.cjs"), "lib/color.cjs"],
  [path.join(repo, "public/data/search-index.json"), "search-index.json"],
];

const missing = [];
for (const [from] of FILES) await fs.access(from).catch(() => missing.push(path.relative(repo, from)));
if (missing.length) {
  console.error(`[mcp] missing: ${missing.join(", ")}\n[mcp] run "npm run vscode:build" (and the docs build) in the repository root first.`);
  process.exit(1);
}

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, "lib"), { recursive: true });
for (const [from, to] of FILES) await fs.copyFile(from, path.join(out, to));

// ---- OmniaUI ----------------------------------------------------------------------------------------------
// A package file from ../omniaUI/<folder>, else from jsDelivr (this version, then latest: OmniaUI is released
// after OmniaCSS, so on a fresh tag the same version may not be on npm yet).
const LOCAL = { "@birdycom/omniaui": "packages/ui", "@birdycom/omniaui-blocks": "packages/blocks", "@birdycom/omniaui-react": "packages/react", "@birdycom/omniaui-vue": "packages/vue" };
const cdnTag = {};
async function read(pkg, file) {
  const local = await fs.readFile(path.join(omniaUI, LOCAL[pkg], file), "utf8").catch(() => null);
  if (local !== null) return local;
  for (const tag of cdnTag[pkg] ? [cdnTag[pkg]] : [version, "latest"]) {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/${pkg}@${tag}/${file}`).catch(() => null);
    if (res?.ok) { cdnTag[pkg] = tag; return res.text(); }
  }
  return null;
}
const readJson = async (pkg, file) => JSON.parse((await read(pkg, file)) ?? "null");

/** Component name used in code: "src/components/OcAccordion.vue" -> "OcAccordion". */
const codeName = (file) => path.basename(file).replace(/\.[^.]+$/, "");

const wrappers = {};
for (const [fw, pkg] of [["react", "@birdycom/omniaui-react"], ["vue", "@birdycom/omniaui-vue"]]) {
  for (const item of (await readJson(pkg, "manifest.json"))?.items || []) {
    if (!item.snippet) continue;
    (wrappers[item.snippet] ??= {})[fw] = codeName(item.file);
  }
}

const items = [];
for (const [pkg, kind] of [["@birdycom/omniaui", "component"], ["@birdycom/omniaui-blocks", "block"]]) {
  const manifest = await readJson(pkg, "manifest.json");
  if (!manifest) { console.warn(`[mcp] ${pkg}: manifest not found (../omniaUI or jsDelivr), left out`); continue; }
  for (const item of manifest.items) {
    const html = await read(pkg, item.file);
    if (html === null) { console.warn(`[mcp] ${pkg}: ${item.file} not found, left out`); continue; }
    items.push({ name: item.name, kind, package: pkg, description: item.description, requires: item.requires, html: html.replace(/\r\n/g, "\n").trim(), frameworks: wrappers[`${pkg}/${item.file}`] || {} });
  }
}
// The Pro blocks by name and description only: their HTML is licensed and comes from the customer's own install.
const pro = ((await readJson("@birdycom/omniaui-blocks", "pro.json"))?.items || []).map(({ name, description }) => ({ name, description }));

const uiDocs = JSON.parse((await fs.readFile(path.join(omniaUI, "public/data/search-index.json"), "utf8").catch(() => null))
  ?? (await fetch("https://omniaui.eu/data/search-index.json").then((r) => (r.ok ? r.text() : "[]"), () => "[]")));

await fs.writeFile(path.join(out, "omniaui.json.gz"), zlib.gzipSync(JSON.stringify({ items, pro }), { level: 9 }));
await fs.writeFile(path.join(out, "search-index-ui.json"), JSON.stringify(uiDocs));

const pages = JSON.parse(await fs.readFile(path.join(out, "search-index.json"), "utf8")).length;
const count = (k) => items.filter((i) => i.kind === k).length;
console.log(`[mcp] dist ready: class index, ${count("component")} components + ${count("block")} blocks (${pro.length} Pro listed), ` +
  `${pages} + ${uiDocs.length} docs pages`);
