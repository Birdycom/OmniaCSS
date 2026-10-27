// File: packages/migrate/src/scan.mjs
// Coverage scan: how many of the Tailwind-style classes in a project can the compat layer resolve?
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import { classStrings, walk, DEFAULT_EXTENSIONS } from "./extract.mjs";
import { parseToken, resolveToken, createContext } from "./resolve.mjs";
import { HANDLERS, STATIC } from "./utilities.mjs";
import { applyVariant } from "./variants.mjs";

const EXTRA_ROOTS = ["mask", "text-shadow", "bg-opacity", "text-opacity", "border-opacity", "ring-opacity", "divide-opacity", "placeholder-opacity", "font-stretch", "prose", "icon", "scrollbar",
  "bg-position", "bg-size", "border-spacing", "grid-cols", "bg-linear", "bg-radial", "bg-conic", "text-balance", "stroke", "fill", "ring", "size", "outline", "container", "mix", "bg-blend", "line-clamp",
  "scheme", "wrap", "perspective", "transform", "backface", "snap", "touch", "motion", "overflow", "sr", "not-sr", "decoration", "underline", "break", "hyphens", "font", "caption", "forced"];
const ROOTS = new Set([...Object.keys(HANDLERS), ...Object.keys(STATIC).map((k) => k.split("-")[0]), ...Object.keys(STATIC), ...EXTRA_ROOTS]);

const VARIANT_LIKE = /^(group|peer|data|aria|has|not|in|supports|min|max|nth|@|\[)/;

/** Does an unresolved token look like a Tailwind class (so it counts as "unsupported" rather than "custom")? */
export function looksLikeTailwind(token, ctx) {
  const p = parseToken(token, ctx);
  for (const v of p.variants) {
    const st = { sels: ["&"], media: [], prelude: [], rank: 0 };
    if (applyVariant(v, st, ctx) || VARIANT_LIKE.test(v)) return true;
  }
  const body = p.body.split("/")[0];
  if (/^\[/.test(body)) return /^\[[a-z-]+:/i.test(body);
  const words = body.split("-");
  if (words.length === 1 && !p.variants.length) return false;
  if (ROOTS.has(words[0])) return true;
  return false;
}

/** Heuristic: is a quoted string a list of class names? (>= 30% of its words resolve, or a class-ish attribute/call precedes it) */
export function isClassString(kinds, hinted) {
  const hits = kinds.filter((k) => k === "supported").length;
  return hits >= 1 && (hits / kinds.length >= 0.3 || hinted) && (kinds.length >= 2 || hinted);
}

/**
 * Scan a directory.
 * @param {string} dir
 * @param {{ ctx?: object, extensions?: string[], onFile?: (f:string)=>void }} [o]
 */
export function makeKind(ctx, cache = new Map()) {
  return (t) => {
    let k = cache.get(t);
    if (k) return k;
    k = resolveToken(t, ctx) ? "supported" : looksLikeTailwind(t, ctx) ? "unsupported" : "custom";
    cache.set(t, k);
    return k;
  };
}

export async function scanDir(dir, o = {}) {
  const ctx = o.ctx || createContext();
  const cache = new Map();
  const kind = (t) => {
    let k = cache.get(t);
    if (k) return k;
    const r = resolveToken(t, ctx);
    k = r ? (r.marker ? "supported" : "supported") : looksLikeTailwind(t, ctx) ? "unsupported" : "custom";
    cache.set(t, k);
    return k;
  };
  const files = await walk(dir, { extensions: o.extensions || DEFAULT_EXTENSIONS });
  const stats = { dir, files: files.length, occurrences: 0, supported: 0, unsupportedCount: 0, customCount: 0, unsupported: new Map(), custom: new Map(), uniqueSupported: new Set(), approximatedColors: 0 };
  for (const file of files) {
    let text;
    try { text = await fs.readFile(file, "utf8"); } catch { continue; }
    for (const s of classStrings(text)) {
      const words = s.words;
      if (!words.length) continue;
      const kinds = words.map(kind);
      const hits = kinds.filter((k) => k === "supported").length;
      if (!isClassString(kinds, s.hinted)) continue;
      words.forEach((w, i) => {
        if (kinds[i] === "supported") {
          stats.occurrences++; stats.supported++; stats.uniqueSupported.add(w);
          if (/^[^:]*:?[a-z-]+-\[#|\[#[0-9a-f]{3,8}\]/i.test(w)) stats.approximatedColors++;
        } else if (kinds[i] === "unsupported") {
          stats.occurrences++; stats.unsupportedCount++; stats.unsupported.set(w, (stats.unsupported.get(w) || 0) + 1);
        } else {
          stats.customCount++; stats.custom.set(w, (stats.custom.get(w) || 0) + 1);
        }
      });
    }
  }
  stats.coverage = stats.occurrences ? (stats.supported / stats.occurrences) * 100 : 100;
  return stats;
}

/** Plain-text report. */
export function formatScan(stats, { top = 40 } = {}) {
  const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const lines = [];
  lines.push(`Scanned ${stats.files} files in ${stats.dir}`);
  lines.push(`Tailwind-style class occurrences: ${stats.occurrences}`);
  lines.push(`  supported:   ${stats.supported} (${stats.coverage.toFixed(2)}%)  [${stats.uniqueSupported.size} unique]`);
  lines.push(`  unsupported: ${stats.unsupportedCount} (${stats.unsupported.size} unique)`);
  lines.push(`  custom (not Tailwind, left alone): ${stats.customCount} occurrences, ${stats.custom.size} unique`);
  if (stats.unsupported.size) {
    lines.push("", `Top unsupported classes:`);
    for (const [t, n] of sort(stats.unsupported).slice(0, top)) lines.push(`  ${String(n).padStart(5)}  ${t}`);
  }
  return lines.join("\n");
}
