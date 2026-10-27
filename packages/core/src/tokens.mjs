// File: packages/core/src/tokens.mjs
// Semantic theme tokens: one JSON source (tokens/semantic.json) -> theme CSS for the web and resolved exports for
// non-web targets (desktop apps: Tkinter, Qt, WinUI, ...).
// Map: palette parsing -> OKLCH math + CSS Color 4 gamut mapping -> resolve per mode -> formats (css | json | dtcg | python)
// Author: Serge Cools | Framework: OmniaCSS
//
// Why: native toolkits know no light-dark(), var() or oklch(). The export resolves every token per mode to a final
// sRGB hex (gamut mapped like CSS Color 4, not clipped per channel), keeps the source oklch and alpha next to it,
// and stamps the OmniaCSS version so an app knows which release its colors match.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SEMANTIC_FILE = path.join(coreDir, "tokens/semantic.json");
export const MODES = ["light", "dark"];

/* ===================================================================
   PALETTE — --color-<name>-<step>: oklch(...) from oc-colors.css
   =================================================================== */

/** Map "red-70" -> { l, c, h } (l 0..1). Later declarations win, as in the cascade. */
export function parsePalette(css) {
  const palette = new Map();
  const re = /--color-([a-z0-9-]+):\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:deg)?|--color-([a-z0-9-]+):\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+none/g;
  for (const m of css.matchAll(re)) {
    if (m[1]) palette.set(m[1], { l: +m[2] / 100, c: +m[3], h: +m[4] });
    else palette.set(m[5], { l: +m[6] / 100, c: +m[7], h: 0 });
  }
  return palette;
}

/* ===================================================================
   COLOR MATH — OKLCH <-> OKLab <-> linear sRGB <-> sRGB
   =================================================================== */

const toLab = ({ l, c, h }) => ({ L: l, a: c * Math.cos((h * Math.PI) / 180), b: c * Math.sin((h * Math.PI) / 180) });

function labToLinear({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearToLab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

const gamma = (v) => (Math.abs(v) <= 0.0031308 ? 12.92 * v : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - 0.055));
const ungamma = (v) => (Math.abs(v) <= 0.04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4);

const toSrgb = (lch) => labToLinear(toLab(lch)).map(gamma);
const srgbToLab = (rgb) => linearToLab(rgb.map(ungamma));
const inGamut = (rgb, eps = 0.000075) => rgb.every((v) => v >= -eps && v <= 1 + eps);
const clip = (rgb) => rgb.map((v) => Math.min(1, Math.max(0, v)));
const deltaEOK = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

/**
 * CSS Color 4 gamut mapping to sRGB (https://www.w3.org/TR/css-color-4/#binsearch):
 * lower the OKLCH chroma until the clipped color is within a just-noticeable difference (deltaEOK 0.02).
 * Keeps lightness and hue, unlike clipping each channel.
 */
export function gamutMap(lch) {
  if (lch.l >= 1) return [1, 1, 1];
  if (lch.l <= 0) return [0, 0, 0];
  const origin = toSrgb(lch);
  if (inGamut(origin)) return clip(origin);
  const JND = 0.02;
  const EPS = 0.0001;
  let current = { ...lch };
  let clipped = clip(origin);
  if (deltaEOK(srgbToLab(clipped), toLab(current)) < JND) return clipped;
  let min = 0;
  let max = lch.c;
  let minInGamut = true;
  while (max - min > EPS) {
    const chroma = (min + max) / 2;
    current = { ...current, c: chroma };
    const rgb = toSrgb(current);
    if (minInGamut && inGamut(rgb)) { min = chroma; continue; }
    clipped = clip(rgb);
    const E = deltaEOK(srgbToLab(clipped), toLab(current));
    if (E < JND) {
      if (JND - E < EPS) return clipped;
      minInGamut = false;
      min = chroma;
    } else {
      max = chroma;
    }
  }
  return clipped;
}

/** Per-channel clipping (what a naive conversion does) — only used to report the difference. */
export const clipSrgb = (lch) => clip(toSrgb(lch));
export const isInSrgb = (lch) => inGamut(toSrgb(lch));

export const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
const round = (n, d) => Number(n.toFixed(d));
export const oklchString = ({ l, c, h }) => `oklch(${round(l * 100, 2)}% ${round(c, 4)} ${round(h, 2)})`;

/** Alpha-blend rgb over a background (sRGB, gamma space, as browsers composite). */
const blend = (rgb, alpha, bg) => rgb.map((v, i) => v * alpha + bg[i] * (1 - alpha));

/* ===================================================================
   RESOLVE — semantic.json -> final values per mode
   A color value is a palette name ("frostblue-2"), a token reference ("@foreground"),
   or { "color": <name or @ref>, "alpha": 0..1 }. Light/dark: { "light": v, "dark": v } or one value for both.
   =================================================================== */

export async function loadSemantic(file = SEMANTIC_FILE) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function loadPalette(dist = path.join(coreDir, "dist")) {
  return parsePalette(await fs.readFile(path.join(dist, "oc-colors.css"), "utf8"));
}

const perMode = (v) => (v && typeof v === "object" && ("light" in v || "dark" in v) ? v : { light: v, dark: v });

/** { name, alpha } for one token in one mode, references followed to a palette color. */
function resolveColor(tokens, name, mode, seen = []) {
  if (seen.includes(name)) throw new Error(`token cycle: ${[...seen, name].join(" -> ")}`);
  const def = tokens[name];
  if (!def) throw new Error(`unknown token "@${name}"`);
  let v = perMode(def.value)[mode];
  let alpha = 1;
  if (v && typeof v === "object") { alpha = v.alpha ?? 1; v = v.color; }
  if (typeof v === "string" && v.startsWith("@")) {
    const inner = resolveColor(tokens, v.slice(1), mode, [...seen, name]);
    return { ...inner, alpha: inner.alpha * alpha, via: [v.slice(1), ...inner.via] };
  }
  return { color: v, alpha, via: [] };
}

/** Resolve every color token per mode: hex (gamut mapped), oklch source, alpha, palette name. */
export function resolveTokens(semantic, palette) {
  const out = {};
  for (const name of Object.keys(semantic.color)) {
    out[name] = {};
    for (const mode of MODES) {
      const { color, alpha } = resolveColor(semantic.color, name, mode);
      const lch = palette.get(color);
      if (!lch) throw new Error(`token "${name}" (${mode}): palette color "${color}" not found in oc-colors.css`);
      const rgb = gamutMap(lch);
      const entry = { hex: toHex(rgb), oklch: oklchString(lch), palette: color };
      if (alpha !== 1) entry.alpha = alpha;
      if (!isInSrgb(lch)) { entry.gamutMapped = true; entry.clippedHex = toHex(clipSrgb(lch)); }
      entry._rgb = rgb;
      out[name][mode] = entry;
    }
  }
  // Transparent tokens also get an opaque hex pre-blended over --oc-background (toolkits without alpha).
  for (const name of Object.keys(out)) {
    for (const mode of MODES) {
      const e = out[name][mode];
      if (e.alpha !== undefined) e.opaqueHex = toHex(blend(e._rgb, e.alpha, out.background[mode]._rgb));
    }
  }
  for (const t of Object.values(out)) for (const mode of MODES) delete t[mode]._rgb;
  return out;
}

/* ===================================================================
   FORMATS
   =================================================================== */

const cssColor = (tokens, v) => {
  let alpha = 1;
  if (v && typeof v === "object") { alpha = v.alpha ?? 1; v = v.color; }
  const ref = v.startsWith("@") ? `var(--oc-${v.slice(1)})` : `var(--color-${v})`;
  return alpha === 1 ? ref : `oklch(from ${ref} l c h / ${alpha})`;
};

/** oc-theme.css: the semantic tokens as light-dark() custom properties (the web side of the same source). */
export function toCss(semantic, version) {
  const lines = [];
  const pad = (s) => "  " + s;
  lines.push(`/* File: oc-theme.css — generated from tokens/semantic.json by @birdycom/omniacss ${version}. Do not edit. */`);
  lines.push("/* Semantic theme tokens: every color is light-dark() of an Omnia palette token (oc-colors.css). */");
  lines.push("/* Same source as the desktop export: npx omniacss tokens --format json|dtcg|python */");
  lines.push(":root {");
  lines.push(pad("color-scheme: light dark;"));
  let group = null;
  for (const [name, def] of Object.entries(semantic.color)) {
    if (def.group !== group) { group = def.group; lines.push("", pad(`/* ${group} */`)); }
    const v = def.value;
    const value = v && typeof v === "object" && "light" in v
      ? (JSON.stringify(v.light) === JSON.stringify(v.dark) ? cssColor(semantic.color, v.light) : `light-dark(${cssColor(semantic.color, v.light)}, ${cssColor(semantic.color, v.dark)})`)
      : cssColor(semantic.color, v);
    lines.push(pad(`--oc-${name}: ${value};`));
  }
  lines.push("", pad("/* Gradients */"));
  for (const [name, g] of Object.entries(semantic.gradient || {})) {
    const stops = g.stops.map((s, i) => `var(--oc-${s.color})${s.at !== undefined && i > 0 && i < g.stops.length - 1 ? ` ${s.at}%` : ""}`);
    lines.push(pad(`--oc-gradient-${name}: linear-gradient(${g.angle}deg, ${stops.join(", ")});`));
  }
  lines.push("", pad("/* Shape, focus, motion, fonts */"));
  lines.push(pad(`--oc-radius: ${semantic.size.radius.rem}rem;`));
  lines.push(pad(`--oc-focus-width: ${semantic.size["focus-width"].px}px;`));
  for (const [name, t] of Object.entries(semantic.transition)) lines.push(pad(`--oc-transition-${name}: ${t.ms}ms ${t.easing};`));
  for (const [name, f] of Object.entries(semantic.font)) lines.push(pad(`--oc-font-${name}: ${f.css};`));
  // Shadows: the color is its own light-dark() token, so the shadow follows the color-scheme without media queries.
  lines.push("", pad("/* Shadows (x y blur spread; color + alpha per mode in --oc-shadow-<name>-color) */"));
  for (const [name, s] of Object.entries(semantic.shadow)) {
    const c = (mode) => `oklch(from var(--color-${perMode(s.color)[mode]}) l c h / ${perMode(s.alpha)[mode]})`;
    lines.push(pad(`--oc-shadow-${name}-color: light-dark(${c("light")}, ${c("dark")});`));
    lines.push(pad(`--oc-shadow-${name}: ${s.x}px ${s.y}px ${s.blur}px ${s.spread}px var(--oc-shadow-${name}-color);`));
  }
  lines.push("}", "");
  return lines.join("\n");
}

const px = (rem) => rem * 16;
const pt = (pxv) => round(pxv * 0.75, 2);

/** Everything a non-web app needs, resolved: the data behind json, dtcg and python. */
export function buildExport(semantic, palette, version) {
  const colors = resolveTokens(semantic, palette);
  const shadows = {};
  for (const [name, s] of Object.entries(semantic.shadow)) {
    shadows[name] = { x: s.x, y: s.y, blur: s.blur, spread: s.spread };
    for (const mode of MODES) {
      const lch = palette.get(perMode(s.color)[mode]);
      shadows[name][mode] = { hex: toHex(gamutMap(lch)), alpha: perMode(s.alpha)[mode] };
    }
  }
  const gradients = {};
  for (const [name, g] of Object.entries(semantic.gradient || {})) {
    gradients[name] = { angle: g.angle };
    for (const mode of MODES) gradients[name][mode] = g.stops.map((s, i) => ({ hex: colors[s.color][mode].hex, at: s.at ?? (i === 0 ? 0 : 100) }));
  }
  const text = Object.fromEntries(Object.entries(semantic.text).map(([k, v]) => [k, { px: v.px, pt: pt(v.px) }]));
  return {
    omniacss: version,
    generated: "npx omniacss tokens",
    modes: MODES,
    colors,
    sizes: {
      radius: { rem: semantic.size.radius.rem, px: px(semantic.size.radius.rem), pt: pt(px(semantic.size.radius.rem)) },
      "focus-width": { px: semantic.size["focus-width"].px, pt: pt(semantic.size["focus-width"].px) },
    },
    text,
    fonts: Object.fromEntries(Object.entries(semantic.font).map(([k, f]) => [k, { windows: f.windows, macos: f.macos, linux: f.linux, css: f.css }])),
    transitions: semantic.transition,
    shadows,
    gradients,
  };
}

/** JSON: { omniacss, tokens: { background: { light: { hex, oklch }, dark: {…} }, radius: { px }, … } } */
export function toJson(data) {
  const tokens = {};
  for (const [name, t] of Object.entries(data.colors)) tokens[name] = t;
  for (const [name, s] of Object.entries(data.sizes)) tokens[name] = s;
  for (const [name, s] of Object.entries(data.text)) tokens[`text-${name}`] = s;
  for (const [name, f] of Object.entries(data.fonts)) tokens[`font-${name}`] = f;
  for (const [name, t] of Object.entries(data.transitions)) tokens[`transition-${name}`] = t;
  for (const [name, s] of Object.entries(data.shadows)) tokens[`shadow-${name}`] = s;
  for (const [name, g] of Object.entries(data.gradients)) tokens[`gradient-${name}`] = g;
  return JSON.stringify({ omniacss: data.omniacss, generated: data.generated, modes: data.modes, tokens }, null, 2) + "\n";
}

const hexToComponents = (hex) => [1, 3, 5].map((i) => round(parseInt(hex.slice(i, i + 2), 16) / 255, 4));
const dtcgColor = (e) => ({ colorSpace: "srgb", components: hexToComponents(e.hex), alpha: e.alpha ?? 1, hex: e.hex });

/** W3C Design Tokens (DTCG): $value = light mode; dark mode in $extensions["com.birdycom.omniacss"].modes.dark. */
export function toDtcg(data) {
  const ext = (extra) => ({ "com.birdycom.omniacss": extra });
  const color = {};
  for (const [name, t] of Object.entries(data.colors)) {
    color[name] = {
      $type: "color",
      $value: dtcgColor(t.light),
      $extensions: ext({ modes: { dark: dtcgColor(t.dark) }, oklch: { light: t.light.oklch, dark: t.dark.oklch }, palette: { light: t.light.palette, dark: t.dark.palette } }),
    };
  }
  const dim = (v) => ({ $type: "dimension", $value: { value: v, unit: "px" } });
  const out = {
    $description: `OmniaCSS ${data.omniacss} semantic tokens (generated by npx omniacss tokens --format dtcg)`,
    $extensions: ext({ version: data.omniacss, modes: data.modes }),
    color,
    radius: dim(data.sizes.radius.px),
    "focus-width": dim(data.sizes["focus-width"].px),
    text: Object.fromEntries(Object.entries(data.text).map(([k, v]) => [k, dim(v.px)])),
    font: Object.fromEntries(Object.entries(data.fonts).map(([k, f]) => [k, { $type: "fontFamily", $value: f.windows, $extensions: ext({ macos: f.macos, linux: f.linux, css: f.css }) }])),
    shadow: Object.fromEntries(Object.entries(data.shadows).map(([k, s]) => [k, {
      $type: "shadow",
      $value: { color: dtcgColor(s.light), offsetX: { value: s.x, unit: "px" }, offsetY: { value: s.y, unit: "px" }, blur: { value: s.blur, unit: "px" }, spread: { value: s.spread, unit: "px" } },
      $extensions: ext({ modes: { dark: { color: dtcgColor(s.dark) } } }),
    }])),
  };
  return JSON.stringify(out, null, 2) + "\n";
}

const py = (v) => JSON.stringify(v);
const pyKey = (k) => k.replace(/-/g, "_");

/** Python module: PALETTES = {"light": {...}, "dark": {...}} with plain hex (alpha tokens pre-blended), plus sizes and fonts. */
export function toPython(data) {
  const L = [];
  L.push(`# omnia_tokens.py — OmniaCSS ${data.omniacss} semantic tokens for non-web apps (Tkinter, Qt, ...).`);
  L.push("# Generated by: npx omniacss tokens --format python  (do not edit; regenerate after an OmniaCSS update)");
  L.push("# Map: OMNIACSS_VERSION -> PALETTES (hex per mode) -> ALPHA -> OKLCH -> SIZES/TEXT -> FONTS -> SHADOWS -> font()");
  L.push("#");
  L.push("# Colors are resolved from light-dark(var(--color-...)) and gamut mapped to sRGB the CSS Color 4 way.");
  L.push("# Tokens with transparency (see ALPHA) are pre-blended over \"background\" in PALETTES.");
  L.push("");
  L.push(`OMNIACSS_VERSION = ${py(data.omniacss)}`);
  L.push("");
  L.push("PALETTES = {");
  for (const mode of data.modes) {
    L.push(`    ${py(mode)}: {`);
    for (const [name, t] of Object.entries(data.colors)) L.push(`        ${py(pyKey(name))}: ${py(t[mode].opaqueHex ?? t[mode].hex)},`);
    L.push("    },");
  }
  L.push("}");
  L.push("");
  L.push("# Transparent tokens: (hex of the color itself, alpha). PALETTES holds the blended result.");
  L.push("ALPHA = {");
  for (const mode of data.modes) {
    const items = Object.entries(data.colors).filter(([, t]) => t[mode].alpha !== undefined).map(([n, t]) => `${py(pyKey(n))}: (${py(t[mode].hex)}, ${t[mode].alpha})`);
    L.push(`    ${py(mode)}: {${items.join(", ")}},`);
  }
  L.push("}");
  L.push("");
  L.push("# Source colors (for wide-gamut renderers).");
  L.push("OKLCH = {");
  for (const mode of data.modes) {
    L.push(`    ${py(mode)}: {`);
    for (const [name, t] of Object.entries(data.colors)) L.push(`        ${py(pyKey(name))}: ${py(t[mode].oklch)},`);
    L.push("    },");
  }
  L.push("}");
  L.push("");
  L.push("# Sizes in px (rem base 16 px); pt = px * 0.75.");
  L.push(`SIZES = {${Object.entries(data.sizes).map(([k, v]) => `${py(pyKey(k))}: ${v.px}`).join(", ")}}`);
  L.push(`TEXT = {${Object.entries(data.text).map(([k, v]) => `${py(k)}: ${v.px}`).join(", ")}}`);
  L.push(`TEXT_PT = {${Object.entries(data.text).map(([k, v]) => `${py(k)}: ${v.pt}`).join(", ")}}`);
  L.push("");
  L.push("FONTS = {");
  for (const [k, f] of Object.entries(data.fonts)) L.push(`    ${py(k)}: {"windows": ${py(f.windows)}, "macos": ${py(f.macos)}, "linux": ${py(f.linux)}},`);
  L.push("}");
  L.push("");
  L.push("# Shadows: x, y, blur, spread in px; color hex + alpha per mode.");
  L.push("SHADOWS = {");
  for (const [k, s] of Object.entries(data.shadows)) {
    L.push(`    ${py(k)}: {"x": ${s.x}, "y": ${s.y}, "blur": ${s.blur}, "spread": ${s.spread}, ` +
      `"light": (${py(s.light.hex)}, ${s.light.alpha}), "dark": (${py(s.dark.hex)}, ${s.dark.alpha})},`);
  }
  L.push("}");
  L.push("");
  L.push("");
  L.push("def font(name=\"sans\", platform=None):");
  L.push("    \"\"\"Font family for this platform (sys.platform: win32 / darwin / linux).\"\"\"");
  L.push("    import sys");
  L.push("    key = {\"win32\": \"windows\", \"darwin\": \"macos\"}.get(platform or sys.platform, \"linux\")");
  L.push("    return FONTS[name][key]");
  L.push("");
  return L.join("\n");
}

export const FORMATS = { json: toJson, dtcg: toDtcg, python: toPython };
export const EXTENSIONS = { json: "omnia.tokens.json", dtcg: "omnia.dtcg.json", python: "omnia_tokens.py" };
