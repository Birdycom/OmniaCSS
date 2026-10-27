// File: packages/vscode/src/lib/color.cjs
// Color math for swatches and the color picker: CSS color text -> #rrggbb[aa], hex -> OKLab, nearest match.
// Map: parse (oklch | oklab | hex | rgb | hsl | color-mix with transparent) -> sRGB -> hex; hex -> OKLab
// Author: Serge Cools | Framework: OmniaCSS

"use strict";

const clamp = (x) => Math.min(1, Math.max(0, x));
const toGamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const toLinear = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

/** Number or percentage: `62.7%` -> 0.627 (scale = what 100% stands for). */
function num(s, scale = 1) {
  if (s === undefined || s === "none") return 0;
  const v = parseFloat(s);
  return s.trim().endsWith("%") ? (v / 100) * scale : v;
}

function hue(s) {
  const v = parseFloat(s);
  if (/turn$/.test(s)) return v * 360;
  if (/rad$/.test(s)) return (v * 180) / Math.PI;
  return v;
}

function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => clamp(toGamma(x)));
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
}

/** Split the arguments of a color function: `62% 0.2 29 / 50%` -> { parts, alpha }. */
function args(body) {
  const [main, alpha] = body.split("/");
  return { parts: main.trim().split(/[\s,]+/), alpha: alpha === undefined ? 1 : clamp(num(alpha.trim())) };
}

/** Parse one CSS color to [r, g, b, a] (0..1), or null. */
function parseColor(text) {
  const v = text.trim().toLowerCase();
  let m;
  if ((m = v.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  if ((m = v.match(/^oklch\((.*)\)$/))) {
    const { parts, alpha } = args(m[1]);
    const L = num(parts[0]), C = num(parts[1], 0.4), H = (hue(parts[2] || "0") * Math.PI) / 180;
    return [...oklabToRgb(L, C * Math.cos(H), C * Math.sin(H)), alpha];
  }
  if ((m = v.match(/^oklab\((.*)\)$/))) {
    const { parts, alpha } = args(m[1]);
    return [...oklabToRgb(num(parts[0]), num(parts[1], 0.4), num(parts[2], 0.4)), alpha];
  }
  if ((m = v.match(/^rgba?\((.*)\)$/))) {
    const { parts, alpha } = args(m[1]);
    const a = parts[3] !== undefined ? clamp(num(parts[3])) : alpha;
    return [num(parts[0], 255) / 255, num(parts[1], 255) / 255, num(parts[2], 255) / 255, a].map(clamp);
  }
  if ((m = v.match(/^hsla?\((.*)\)$/))) {
    const { parts, alpha } = args(m[1]);
    const a = parts[3] !== undefined ? clamp(num(parts[3])) : alpha;
    return [...hslToRgb(hue(parts[0]), num(parts[1], 1) / (parts[1].endsWith("%") ? 1 : 100), num(parts[2], 1) / (parts[2].endsWith("%") ? 1 : 100)), a];
  }
  // color-mix(in <space>, <color> <p>%, transparent): the color with alpha p.
  if ((m = v.match(/^color-mix\(\s*in\s+[\w-]+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/))) {
    const c = parseColor(m[1]);
    return c && [c[0], c[1], c[2], c[3] * clamp(parseFloat(m[2]) / 100)];
  }
  if (v === "white") return [1, 1, 1, 1];
  if (v === "black") return [0, 0, 0, 1];
  return null;
}

/** CSS color text -> `#rrggbb` or `#rrggbbaa`, or null when it is not a single parsable color. */
function colorToHex(text) {
  const c = parseColor(text);
  if (!c || c.some((x) => Number.isNaN(x))) return null;
  const h = (x) => Math.round(clamp(x) * 255).toString(16).padStart(2, "0");
  return "#" + h(c[0]) + h(c[1]) + h(c[2]) + (c[3] < 1 ? h(c[3]) : "");
}

/** `#rrggbb[aa]` -> [r, g, b, a] (0..1). */
function hexToRgba(hex) {
  return parseColor(hex);
}

/** sRGB (0..1) -> OKLab [L, a, b]. */
function rgbToOklab(r, g, b) {
  const [R, G, B] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance between two [r, g, b, a] colors (OKLab, alpha weighted in). */
function distance(x, y) {
  const a = rgbToOklab(x[0], x[1], x[2]), b = rgbToOklab(y[0], y[1], y[2]);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], (x[3] - y[3]) * 0.5);
}

module.exports = { parseColor, colorToHex, hexToRgba, rgbToOklab, distance };
