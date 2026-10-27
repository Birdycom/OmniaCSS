// File: packages/vscode/scripts/build-index.mjs
// Builds the class index the editor extension ships with, from the full OmniaCSS build in packages/core/dist.
// Map: parse omnia.css -> base utilities (one class per selector) -> colors -> tokens -> variants -> dist/index.json.gz
// Run: "npm run vscode:build" (after "npm run build:packages"). Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { VARIANT_GROUPS, BREAKPOINTS, CONTAINER_SIZES } from "../../core/src/variants.mjs";
import { colorToHex } from "../src/lib/color.cjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, "..");
const coreDir = path.resolve(pkgDir, "../core");
const outDir = path.join(pkgDir, "dist");

const CLASS_IN_SELECTOR = /\.((?:\\.|[A-Za-z0-9_-])+)/g;
const unescape = (s) => s.replace(/\\(.)/g, "$1");
const OPTIONAL = /:(?:not|where|is|has)\((?:[^()]|\([^()]*\))*\)/g;

/** Same rule as the engine: classes inside :not()/:where()/:is()/:has() are optional. */
const requiredClasses = (sel) => [...sel.replace(OPTIONAL, "").matchAll(CLASS_IN_SELECTOR)].map((m) => unescape(m[1]));

/** Replace the top-level `.base` in a selector by `&` (the extension puts the full token back). */
function template(sel, base) {
  for (const m of sel.matchAll(CLASS_IN_SELECTOR)) {
    if (unescape(m[1]) !== base) continue;
    let depth = 0;
    for (const ch of sel.slice(0, m.index)) { if (ch === "(") depth++; else if (ch === ")") depth--; }
    if (depth === 0) return sel.slice(0, m.index) + "&" + sel.slice(m.index + m[0].length);
  }
  return null;
}

function atChain(rule) {
  const chain = [];
  for (let p = rule.parent; p && p.type === "atrule"; p = p.parent) chain.unshift(`@${p.name} ${p.params}`.trim());
  return chain;
}

/** Declarations as [prop, value, important(0|1), comment?]; a comment right after a declaration belongs to it. */
function declsOf(rule) {
  const out = [];
  for (const node of rule.nodes) {
    if (node.type === "decl") out.push([node.prop, node.value, node.important ? 1 : 0]);
    else if (node.type === "comment" && out.length && out.at(-1).length === 3) out.at(-1).push(node.text.trim());
  }
  return out;
}

const [main, tokensCss, corePkg] = await Promise.all([
  fs.readFile(path.join(coreDir, "dist/omnia.css"), "utf8"),
  fs.readFile(path.join(coreDir, "dist/oc-colors.css"), "utf8"),
  fs.readFile(path.join(coreDir, "package.json"), "utf8").then(JSON.parse),
]);

// 1. Tokens: the first definition wins (the oklch block; later blocks are fallbacks).
const tokens = {};
const addToken = (decl) => {
  const sel = decl.parent?.selector || "";
  if (!/^(:root|:host|html)\b/.test(sel) || Object.hasOwn(tokens, decl.prop)) return;
  tokens[decl.prop] = decl.value;
};
postcss.parse(tokensCss).walkDecls(/^--/, addToken);
const root = postcss.parse(main);
root.walkDecls(/^--/, addToken);

const resolveVar = (value, seen = 0) =>
  seen > 8 ? value : value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (all, name, fallback) =>
    Object.hasOwn(tokens, name) ? resolveVar(tokens[name], seen + 1) : fallback ?? all);

const tokenHex = {};
for (const [name, value] of Object.entries(tokens)) {
  const hex = colorToHex(resolveVar(value));
  if (hex) tokenHex[name] = hex;
}

// 2. Base utilities: every rule whose selector needs exactly one class. Classes with a variant prefix
//    (`hover:bg-red-50`) are left out: the extension derives them from the base like the engine does.
const classes = {};
const native = new Set();
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
  let entry;
  for (const sel of rule.selectors) {
    const req = requiredClasses(sel);
    if (req.length !== 1) continue;
    const [cls] = req;
    if (cls.includes(":")) { native.add(cls); continue; }
    const tpl = template(sel, cls);
    if (!tpl) continue;
    entry ??= { chain: atChain(rule), decls: declsOf(rule) };
    if (!entry.decls.length) continue;
    const list = (classes[cls] ??= []);
    const item = [entry.chain, tpl, entry.decls];
    const key = JSON.stringify(item);
    if (!list.some((x) => JSON.stringify(x) === key)) list.push(item);
  }
});

// Native variant classes whose base is not a utility on its own (rare) still count as known.
const nativeOnly = [...native].filter((c) => !Object.hasOwn(classes, c.slice(c.lastIndexOf(":") + 1)));

// 3. Colors: the first declaration whose value is one color (a token or a literal) gives the swatch.
const colors = {};
for (const [cls, entries] of Object.entries(classes)) {
  for (const [, , decls] of entries) {
    const hit = decls.find(([prop, value]) => !/^(content|font|transition|animation)/.test(prop) && /^(var\(--[\w-]+\)|#[0-9a-f]{3,8}|(?:oklch|oklab|rgba?|hsla?|color-mix)\(.*\))$/i.test(value.trim()));
    if (!hit) continue;
    const m = hit[1].trim().match(/^var\((--[\w-]+)\)$/);
    const hex = m ? tokenHex[m[1]] : colorToHex(resolveVar(hit[1]));
    if (hex) { colors[cls] = m ? [hex, m[1]] : [hex]; break; }
  }
}

const index = {
  version: corePkg.version,
  classes,
  nativeOnly,
  colors,
  tokens: Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, tokenHex[k] ? [v, tokenHex[k]] : [v]])),
  variants: { ...VARIANT_GROUPS, breakpoints: Object.keys(BREAKPOINTS), containers: Object.keys(CONTAINER_SIZES) },
};

await fs.mkdir(outDir, { recursive: true });
const json = JSON.stringify(index);
const gz = zlib.gzipSync(json, { level: 9 });
await fs.writeFile(path.join(outDir, "index.json.gz"), gz);
// The extension resolves variants with the engine's own module (loaded with import() at runtime).
await fs.copyFile(path.join(coreDir, "src/variants.mjs"), path.join(outDir, "variants.mjs"));

console.log(`[vscode] index ${index.version}: ${Object.keys(classes).length} utilities, ${Object.keys(colors).length} colors, ` +
  `${Object.keys(tokens).length} tokens, ${nativeOnly.length} native-only variant classes; ` +
  `${(json.length / 1e6).toFixed(1)} MB json, ${(gz.length / 1e3).toFixed(0)} KB gzip`);
