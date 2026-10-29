// File: packages/mcp/scripts/build.mjs
// Collects the knowledge the MCP server ships with into packages/mcp/dist.
// The class index and the lookup code are the ones the editor extension uses, so both answer the same way.
// Map: ../vscode/dist (index, components, variants.mjs) + ../vscode/src/lib (omnia, components, color)
//      + public/data/search-index.json (docs pages) -> dist/
// Run: "npm run build" here, after "npm run vscode:build" in the repository root. Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(pkgDir, "../..");
const vscode = path.join(repo, "packages/vscode");
const out = path.join(pkgDir, "dist");

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

const pages = JSON.parse(await fs.readFile(path.join(out, "search-index.json"), "utf8")).length;
console.log(`[mcp] dist ready: class index, OmniaUI components, ${pages} docs pages`);
