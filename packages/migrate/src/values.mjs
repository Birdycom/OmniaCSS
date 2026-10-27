// File: packages/migrate/src/values.mjs
// Value helpers for the compat resolver: arbitrary values, spacing scale, colors (Omnia tokens only), theme lookup.
// Author: Serge Cools | Framework: OmniaCSS

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
export const COLOR_MAP = JSON.parse(fs.readFileSync(path.join(here, "data/colors.json"), "utf8"));

const fmt = (n) => String(+n.toFixed(5));
export const isNum = (s) => /^-?(\d+\.?\d*|\.\d+)$/.test(s);
export const rem = (n) => (n === 0 ? "0px" : `${fmt(n * 0.25)}rem`);

export const TYPE_HINTS = "length|color|percentage|number|url|string|angle|family-name|image|position|size|line-width|absolute-size|relative-size|bg-size|integer|ratio|vector|shadow|any";

/** `[37px]`, `[length:var(--x)]`, `(--x)`, `(length:--x)` -> { type, value } or null. */
export function arb(v) {
  if (typeof v !== "string") return null;
  let m = v.match(/^\[(?:([a-z-]+):(?!:))?([\s\S]*)\]$/);
  if (m && (!m[1] || new RegExp(`^(${TYPE_HINTS})$`).test(m[1]))) return { type: m[1] || null, value: normalizeArb(m[2]) };
  if (m && m[1]) return { type: null, value: normalizeArb(m[1] + ":" + m[2]) };
  m = v.match(/^\((?:([a-z-]+):)?(--[^)]+)\)$/);
  if (m) return { type: m[1] || null, value: `var(${m[2]})` };
  return null;
}

/** Underscores are spaces inside arbitrary values (except url() and escaped `\_`). */
export function normalizeArb(s) {
  if (/^url\(/.test(s)) return s;
  return s.replace(/\\_/g, "\u0000").replace(/_/g, " ").replace(/\u0000/g, "_");
}

export function inferType(val) {
  if (/^(#[0-9a-f]{3,8}$|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\(|color-mix\(|hwb\()/i.test(val)) return "color";
  if (/^(url\(|(repeating-)?(linear|radial|conic)-gradient\()/.test(val)) return "image";
  if (/^-?(\d+\.?\d*|\.\d+)(px|rem|em|%|vw|vh|vmin|vmax|svh|dvh|lvh|ch|ex|cm|mm|in|pt|pc|fr|cqw|cqh)$/.test(val) || /^(calc|clamp|min|max)\(/.test(val)) return "length";
  if (isNum(val)) return "number";
  return null;
}

/** Negate a CSS length. */
export function negate(val) {
  if (val === "0px" || val === "0") return val;
  if (/^[\d.]/.test(val)) return "-" + val;
  if (val.startsWith("-") && /^-[\d.]/.test(val)) return val.slice(1);
  return `calc(${val} * -1)`;
}

/**
 * Spacing value (margin, padding, gap, inset, sizing …).
 * @param {string} v token value ("4", "px", "1/2", "[37px]", "full", "auto" …)
 * @param {object} ctx resolver context
 * @param {{ neg?: boolean, keywords?: Record<string,string>, fractions?: boolean }} [o]
 */
export function spacing(v, ctx, o = {}) {
  let out = null;
  if (o.keywords && Object.hasOwn(o.keywords, v)) out = o.keywords[v];
  else if (arb(v)) out = arb(v).value;
  else if (ctx.hasTheme(`--spacing-${v}`)) out = `var(--spacing-${v})`;
  else if (v === "px") out = "1px";
  else if (isNum(v) && +v >= 0) out = rem(+v);
  else if (o.fractions !== false && /^(\d+)\/(\d+)$/.test(v)) { const [a, b] = v.split("/").map(Number); out = b ? `${fmt((a / b) * 100)}%` : null; }
  if (out == null) return null;
  return o.neg ? negate(out) : out;
}

// --- colors -----------------------------------------------------------------------------------------------

let paletteCache;
/** Omnia palette (from @birdycom/omniacss dist/oc-colors.css) as OKLab points, for approximating arbitrary colors. */
function palette(ctx) {
  if (paletteCache) return paletteCache;
  const files = [ctx.tokensFile, path.resolve(here, "../../core/dist/oc-colors.css")].filter(Boolean);
  try { files.unshift(require.resolve("@birdycom/omniacss/tokens")); } catch { /* monorepo fallback */ }
  let css = "";
  for (const f of files) { try { css = fs.readFileSync(f, "utf8"); break; } catch { /* next */ } }
  const FAMILIES = new Set("red pink orange yellow violet magenta purple indigo lime green teal cyan turquoise blue shallowblue duskblue twilightblue stormblue frostblue mistblue vividblue skycyan wheat peru brown white snow azure beige ivory linen silver gray black".split(" "));
  paletteCache = [];
  for (const m of css.matchAll(/--color-([a-z]+)-(\d+): oklch\(([\d.]+)% ([\d.]+) (none|[\d.]+)(?:deg)?\)/g)) {
    if (!FAMILIES.has(m[1]) || m[2] === "100") continue;
    const L = +m[3] / 100, C = +m[4], H = m[5] === "none" ? 0 : (+m[5] * Math.PI) / 180;
    paletteCache.push({ token: `--color-${m[1]}-${m[2]}`, lab: [L, C * Math.cos(H), C * Math.sin(H)] });
  }
  return paletteCache;
}

function rgbToOklab(r, g, b) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  [r, g, b] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** Parse #hex / rgb() / hsl() into [r,g,b,alpha] or null. */
export function parseColor(str) {
  str = str.trim();
  let m = str.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
  }
  m = str.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (m) return [+m[1], +m[2], +m[3], m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]) : 1];
  m = str.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0) * 255, f(8) * 255, f(4) * 255, m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]) : 1];
  }
  m = str.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+(none|[\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/i);
  if (m) {
    const l = m[2] ? +m[1] / 100 : +m[1], C = +m[3], H = m[4] === "none" ? 0 : (+m[4] * Math.PI) / 180;
    const a = C * Math.cos(H), b = C * Math.sin(H);
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3, m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
    const enc = (v) => { v = Math.min(1, Math.max(0, v)); return (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255; };
    return [...lin.map(enc), m[5] ? (m[5].endsWith("%") ? parseFloat(m[5]) / 100 : +m[5]) : 1];
  }
  return null;
}

/** Nearest Omnia token (`--color-x-y`) for a color string; null if it cannot be parsed. */
export function nearestToken(str, ctx) {
  const c = parseColor(str);
  if (!c) return null;
  const [L, A, B] = rgbToOklab(c[0], c[1], c[2]);
  let best = null;
  for (const p of palette(ctx)) {
    const d = (L - p.lab[0]) ** 2 * 1.4 + (A - p.lab[1]) ** 2 + (B - p.lab[2]) ** 2;
    if (!best || d < best.d) best = { d, token: p.token };
  }
  return best ? { token: best.token, alpha: c[3] } : null;
}

/** Wrap an Omnia-token color with an alpha (0..100 %). */
export const withAlpha = (color, pct) => `color-mix(in oklab, ${color} ${fmt(pct)}%, transparent)`;

/** Color for an arbitrary/literal value, mapped to the Omnia palette unless ctx.arbitraryColors === "keep". */
function literalColor(val, ctx) {
  if (ctx.arbitraryColors === "keep") return val;
  const n = nearestToken(val, ctx);
  if (!n) return val;
  const base = `var(${n.token})`;
  return n.alpha < 1 ? withAlpha(base, n.alpha * 100) : base;
}

/**
 * Resolve a color name/value ("red-500", "white", "primary", "[#fff]", "(--x)") with an optional opacity modifier.
 * @returns {string|null}
 */
export function color(v, mod, ctx, { hinted = false } = {}) {
  let out = null;
  const a = arb(v);
  if (a) {
    if (a.type && a.type !== "color") return null;
    if (!a.type && !hinted && inferType(a.value) !== "color" && !/^var\(/.test(a.value)) return null;
    out = /^var\(/.test(a.value) ? a.value : literalColor(a.value, ctx);
  } else if (v === "transparent" || v === "current" || v === "inherit") out = v === "current" ? "currentColor" : v;
  else if (ctx.hasTheme(`--color-${v}`)) out = `var(--color-${v})`;
  else if (ctx.customColors?.has(v)) out = ctx.customColors.get(v);
  else if (COLOR_MAP[v]) out = `var(${COLOR_MAP[v]})`;
  if (out == null) return null;
  if (mod != null && mod !== "") {
    const ma = arb(mod);
    let pct = ma ? (+ma.value <= 1 ? +ma.value * 100 : +ma.value) : +mod;
    if (!Number.isFinite(pct)) return out;
    if (out === "transparent") return out;
    out = withAlpha(out, pct);
  }
  return out;
}

/** Shared by utilities: 0-100 style number -> fraction (opacity-50 -> 0.5). */
export const frac = (n) => fmt(+n / 100);
export { fmt };
