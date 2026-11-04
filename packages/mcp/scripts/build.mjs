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
// A package file from ../omniaUI/<folder>, else from jsDelivr (this version, then the latest release: OmniaUI is
// released after OmniaCSS, so on a fresh tag the same version may not be on npm yet).
const LOCAL = { "@birdycom/omniaui": "packages/ui", "@birdycom/omniaui-blocks": "packages/blocks", "@birdycom/omniaui-react": "packages/react", "@birdycom/omniaui-vue": "packages/vue" };
const cdnTag = {};
/** The latest version number on npm. jsDelivr caches "@latest" files for days (it served a 0.14.0 manifest while
 *  0.14.1 was out), so files are fetched by exact version; "latest" only when the registry cannot be reached. */
async function latestVersion(pkg) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  return data?.version || "latest";
}
async function read(pkg, file) {
  const local = await fs.readFile(path.join(omniaUI, LOCAL[pkg], file), "utf8").catch(() => null);
  if (local !== null) return local;
  for (const tag of cdnTag[pkg] ? [cdnTag[pkg]] : [version, await latestVersion(pkg)]) {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/${pkg}@${tag}/${file}`).catch(() => null);
    // jsDelivr can answer 200 with an HTML page (rate limit, error): only a real file counts.
    if (res?.ok && !(res.headers.get("content-type") || "").includes("text/html")) { cdnTag[pkg] = tag; return res.text(); }
  }
  return null;
}
/** JSON from text, or the fallback when it is not JSON (a CDN or host can answer with an HTML error page). */
function parseJson(text, fallback, what) {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch { console.warn(`[mcp] ${what}: not JSON (an HTML page?), left out`); return fallback; }
}
const readJson = async (pkg, file) => parseJson(await read(pkg, file), null, `${pkg}/${file}`);

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
// The Pro blocks and components by name and description only: their HTML is licensed and comes from the customer's own
// install. "extends": the free component a Pro addition belongs to (tint card, data table): that one is "Free + Pro".
const proJson = await readJson("@birdycom/omniaui-blocks", "pro.json");
const pro = (proJson?.items || []).map(({ name, description }) => ({ name, description }));
const proComponents = (proJson?.components || []).map(({ name, extends: base, description }) => ({ name, ...(base ? { extends: base } : {}), description }));

// The OmniaUI docs search index: ../omniaUI, else the committed file in the OmniaUI repo (this version's tag, then
// main), else the live site. The live site alone failed CI while omniaui.eu was being deployed (it served HTML).
async function uiSearchIndex() {
  const local = await fs.readFile(path.join(omniaUI, "public/data/search-index.json"), "utf8").catch(() => null);
  if (local !== null) return local;
  for (const url of [
    `https://raw.githubusercontent.com/Birdycom/OmniaUI/v${version}/public/data/search-index.json`,
    "https://raw.githubusercontent.com/Birdycom/OmniaUI/main/public/data/search-index.json",
    "https://omniaui.eu/data/search-index.json",
  ]) {
    const text = await fetch(url).then((r) => (r.ok ? r.text() : null), () => null);
    if (text && parseJson(text, null, url)) return text;
  }
  return "[]";
}
const uiDocs = parseJson(await uiSearchIndex(), [], "omniaui.eu search index");

await fs.writeFile(path.join(out, "omniaui.json.gz"), zlib.gzipSync(JSON.stringify({ items, pro, proComponents }), { level: 9 }));
await fs.writeFile(path.join(out, "search-index-ui.json"), JSON.stringify(uiDocs));

const pages = JSON.parse(await fs.readFile(path.join(out, "search-index.json"), "utf8")).length;
const count = (k) => items.filter((i) => i.kind === k).length;
console.log(`[mcp] dist ready: class index, ${count("component")} components + ${count("block")} blocks (${pro.length} Pro blocks and ${proComponents.length} Pro components listed), ` +
  `${pages} + ${uiDocs.length} docs pages`);
