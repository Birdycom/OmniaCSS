// File: packages/migrate/src/extract.mjs
// Extract class-like tokens from source text (Blade, Vue, JSX/TSX, JS, HTML …), keeping arbitrary values
// such as `w-[37px]`, `[&_svg:not([class*='size-'])]:size-4` and `bg-(--brand)` intact.
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_EXTENSIONS = ["blade.php", "php", "vue", "jsx", "tsx", "js", "ts", "mjs", "html", "svelte", "astro", "mdx", "twig", "erb"];
const IGNORE_DIRS = new Set(["node_modules", "vendor", ".git", "storage", "dist", "build", "public", ".next", ".nuxt", ".output", "bootstrap", ".cache", ".turbo", ".astro"]);

const DELIM = /[\s"'`{},;<>=|\\$+?^~]/;

/**
 * Call `cb(token, start, end)` for every class-like token in `text`.
 * Arbitrary values such as `w-[37px]` stay in one piece.
 */
export function scanTokens(text, cb) {
  let cur = "", depth = 0, mark = 0, start = 0;
  const flush = (end) => {
    if (cur) {
      const lead = cur.length - cur.replace(/^[.:]+/, "").length;
      const t = cur.replace(/^[.:]+/, "").replace(/[.:,]+$/, "");
      if (t && t.length <= 250 && /^[A-Za-z0-9!@\[*(-]/.test(t)) cb(t, start + lead, start + lead + t.length);
    }
    cur = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (depth > 0) {
      if (/\s/.test(ch) || cur.length > 250) { i = mark; cur = ""; depth = 0; continue; } // not an arbitrary value after all
      cur += ch;
      if (ch === "[" || ch === "(") depth++;
      else if (ch === "]" || ch === ")") depth--;
      continue;
    }
    if (ch === "[" || ch === "(") {
      const prev = cur.slice(-1);
      const next = text[i + 1];
      const attach = ch === "[" ? (cur === "" ? !!next && !/[\s"'`\]]/.test(next) : /[-:!]/.test(prev)) : /[-:!]/.test(prev);
      if (attach) { if (!cur) start = i; mark = i; depth = 1; cur += ch; continue; }
      flush(i); continue;
    }
    if (DELIM.test(ch) || ch === ")" || ch === "]" || ch === "&" || (ch === "#" && cur === "")) { flush(i); continue; }
    if (!cur) start = i;
    cur += ch;
  }
  flush(text.length);
}

/** Class-like tokens in a text (duplicates are kept, so callers can count occurrences). */
export function extractTokens(text) {
  const out = [];
  scanTokens(text, (t) => out.push(t));
  return out;
}

/** Walk `dir` and return files with one of the given extensions. */
export async function walk(dir, { extensions = DEFAULT_EXTENSIONS, ignore = IGNORE_DIRS } = {}) {
  const files = [];
  async function rec(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!ignore.has(e.name) && !e.name.startsWith(".")) await rec(path.join(d, e.name)); continue; }
      if (extensions.some((x) => e.name.endsWith("." + x))) files.push(path.join(d, e.name));
    }
  }
  await rec(dir);
  return files;
}

const STRING_RE = /"(?:[^"\\\n]|\\.){0,3000}"|'(?:[^'\\\n]|\\.){0,3000}'|`(?:[^`\\]|\\.){0,4000}`/g;
const CLASS_CONTEXT = /(class(Name)?|:class|\bcn|clsx|cva|twMerge|classNames|tv|@class)\W{0,6}$/;

/**
 * Candidate class strings: quoted strings (and attribute values) with their preceding context.
 * @returns {Array<{ words: string[], spans: Array<{token:string,start:number,end:number}>, hinted: boolean }>}
 */
export function classStrings(text) {
  const out = [];
  for (const m of text.matchAll(STRING_RE)) {
    const inner = m[0].slice(1, -1);
    if (!inner.trim()) continue;
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    const tokens = [];
    scanTokens(inner, (t, s, e) => tokens.push({ token: t, start: m.index + 1 + s, end: m.index + 1 + e }));
    out.push({ words: tokens.map((t) => t.token), spans: tokens, hinted: CLASS_CONTEXT.test(before) });
  }
  return out;
}
