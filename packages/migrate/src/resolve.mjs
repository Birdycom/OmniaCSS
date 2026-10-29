// File: packages/migrate/src/resolve.mjs
// Resolver: a Tailwind-style class token (with variants, !important, negatives, modifiers) -> CSS rules
// that only use OmniaCSS tokens. Entry points: createContext(), resolveToken(), compileTokens().
// Author: Serge Cools | Framework: OmniaCSS

import { applyVariant, esc, splitTop } from "./variants.mjs";
import { HANDLERS, KEYFRAMES, MARKERS, STATIC } from "./utilities.mjs";
import { arb, normalizeArb } from "./values.mjs";

export const SCREENS = {
  omnia: { sm: "36rem", md: "50rem", lg: "64rem", xl: "80rem", "2xl": "96rem" },
  tailwind: { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", "2xl": "96rem" },
};

/**
 * Build the resolver context.
 * @param {object} [o]
 * @param {boolean} [o.v4=true]            Tailwind 4 naming (shadow-sm, rounded-sm, ring …)
 * @param {"class"|"media"} [o.darkMode="class"]
 * @param {string} [o.darkSelector=".dark"] selector for class based dark mode
 * @param {"omnia"|"tailwind"} [o.breakpoints="omnia"]
 * @param {Record<string,string>} [o.screens] extra/override screens
 * @param {"nearest"|"keep"} [o.arbitraryColors="nearest"]
 * @param {Iterable<string>} [o.themeVars] custom properties defined in the user's @theme (e.g. "--color-primary")
 * @param {Record<string,string>} [o.customColors] extra color names -> css value (from tailwind.config)
 * @param {string} [o.prefix]               Tailwind `prefix` option
 */
export function createContext(o = {}) {
  const screens = { ...SCREENS[o.breakpoints || "omnia"], ...(o.screens || {}) };
  const order = Object.keys(screens).sort((a, b) => parseFloat(screens[a]) - parseFloat(screens[b]));
  const themeVars = new Set(o.themeVars || []);
  return {
    v4: o.v4 ?? true,
    darkMode: o.darkMode || "class",
    darkSelector: o.darkSelector || ".dark",
    screens,
    screenRank: (n) => order.indexOf(n) * 10,
    arbitraryColors: o.arbitraryColors || "nearest",
    themeVars,
    hasTheme: (n) => themeVars.has(n),
    customColors: new Map(Object.entries(o.customColors || {})),
    prefix: o.prefix || "",
    container: o.container || {},
    tokensFile: o.tokensFile,
    important: !!o.important,
  };
}

/** Roots that accept a leading `-` (negative values). */
const NEG_OK = /^(m[xytrblse]?|scroll-m[xytrblse]?|inset(-[xy])?|top|right|bottom|left|start|end|z|order|translate(-[xyz])?|rotate(-[xy])?|scale(-[xy])?|skew(-[xy])?|hue-rotate|backdrop-hue-rotate|tracking|indent|underline-offset|outline-offset|col(-start|-end)?|row(-start|-end)?|space-[xy]|spin-in|spin-out|bg)$/;

// ---------------------------------------------------------------------------------------------- parsing

/**
 * Parse a raw class token.
 * @returns {{ raw: string, variants: string[], utility: string, important: boolean, neg: boolean, body: string }}
 */
export function parseToken(raw, ctx) {
  const parts = splitTop(raw, ":");
  const variants = parts.slice(0, -1);
  let utility = parts[parts.length - 1];
  let important = false, neg = false;
  if (utility.startsWith("!")) { important = true; utility = utility.slice(1); }
  if (utility.endsWith("!")) { important = true; utility = utility.slice(0, -1); }
  if (ctx?.prefix) {
    const p = ctx.prefix;
    if (utility.startsWith("-" + p)) utility = "-" + utility.slice(p.length + 1);
    else if (utility.startsWith(p)) utility = utility.slice(p.length);
    else if (utility.startsWith("[") === false && !MARKERS.test(utility)) return { raw, variants, utility, important, neg, body: utility, foreign: true };
  }
  if (utility.startsWith("-") && utility.length > 1) { neg = true; utility = utility.slice(1); }
  return { raw, variants, utility, important, neg, body: utility };
}

/** Split `a-b-[c-d]` on dashes outside brackets. */
function splitDash(s) {
  return splitTop(s, "-");
}

/** Split `bg-red-500/50` into [body, modifier]; ignores slashes inside brackets. */
function splitModifier(body) {
  const parts = splitTop(body, "/");
  if (parts.length < 2) return [body, undefined];
  return [parts.slice(0, -1).join("/"), parts[parts.length - 1]];
}

const norm = (r) => (!r ? null : Array.isArray(r) ? { decls: r } : r);

/** Resolve the utility part (no variants). Returns { decls, tail?, keyframes?, extraRules?, marker? } or null. */
export function resolveUtility(p, ctx) {
  const { body, neg } = p;
  if (!neg) {
    const m = body.match(/^\[(--[A-Za-z0-9_-]+|-?[a-z][a-z-]*):([^:\s].*)\]$/);
    if (m && !/^[\s;{}]/.test(m[2])) return { decls: [[m[1], normalizeArb(m[2])]] };
    if (MARKERS.test(body)) return { decls: [], marker: true };
    if (Object.hasOwn(STATIC, body)) return { decls: STATIC[body], static: true, ...(body.startsWith("animate-in") || body.startsWith("animate-out") ? { keyframes: [body.slice(8)] } : {}) };
    if (body === "container") return containerRule(ctx);
  }
  const [bare, mod] = splitModifier(body);
  const words = splitDash(bare);
  for (let i = words.length; i >= 1; i--) {
    const root = words.slice(0, i).join("-");
    const fn = Object.hasOwn(HANDLERS, root) ? HANDLERS[root] : null;
    if (!fn) continue;
    if (neg && !NEG_OK.test(root)) continue;
    const value = words.slice(i).join("-");
    if (!value && i === words.length && false) continue;
    // `w-1/2`, `translate-x-1/2`: try the fraction first, then value + opacity/line-height modifier
    let r = mod !== undefined ? norm(fn({ root, value: `${value}/${mod}`, mod: undefined, neg, ctx })) : null;
    if (!r) r = norm(fn({ root, value, mod, neg, ctx }));
    if (r) return r;
  }
  return null;
}

function containerRule(ctx) {
  const decls = [["width", "100%"]];
  if (ctx.container.center) decls.push(["margin-inline", "auto"]);
  if (ctx.container.padding) decls.push(["padding-inline", ctx.container.padding]);
  const extraRules = Object.entries(ctx.screens).map(([k, w]) => ({ media: [`@media (min-width: ${w})`], decls: [["max-width", w]], rank: ctx.screenRank(k) }));
  return { decls, extraRules };
}

// property rank so shorthands sort before longhands (`p-4` before `px-2` before `pl-1`)
const SHORTHANDS = new Set(["margin", "padding", "inset", "gap", "border-width", "border-color", "border-radius", "border", "overflow", "scroll-margin", "scroll-padding", "transition-property", "flex", "background", "font", "outline", "translate", "rotate", "scale", "size"]);
export function propRank(prop) {
  if (SHORTHANDS.has(prop)) return 0;
  if (/-(top|right|bottom|left|start|end)\b|^(top|right|bottom|left)$|-(x|y)$/.test(prop)) return 2;
  return 1;
}

/**
 * Resolve one token.
 * @param {string} raw class token, e.g. "md:hover:bg-red-500/50"
 * @param {object} ctx from createContext()
 * @param {{ selector?: string }} [opts] selector: use instead of `.escaped-token` (for @apply)
 * @returns {null | { token: string, rules: Array<{selectors:string[], media:string[], decls:string[][], rank:number}>, keyframes: string[], marker?: boolean }}
 */
export function resolveToken(raw, ctx, opts = {}) {
  const p = parseToken(raw, ctx);
  if (p.foreign || !p.body) return null;
  const util = resolveUtility(p, ctx);
  if (!util) return null;
  if (util.marker) return { token: raw, rules: [], keyframes: [], marker: true };

  const st = { sels: [opts.selector || `.${esc(raw)}`], media: [], prelude: [], rank: 0 };
  for (let i = p.variants.length - 1; i >= 0; i--) {
    if (!applyVariant(p.variants[i], st, ctx)) return null;
  }
  // a pseudo-element can only end a selector: `[&_.x]:placeholder:italic` would give `::placeholder .x` (invalid, dropped)
  if (st.sels.some((s) => /::[a-z-]+(?:\([^)]*\))?[\s>+~.[#]/.test(s))) return null;
  const important = p.important || ctx.important;
  const fix = (decls) => decls.map(([k, v]) => [k, important && !/ !important$/.test(v) ? `${v} !important` : v]);
  const hasContent = util.decls.some(([k]) => k === "content");
  const base = fix([...(hasContent ? [] : st.prelude), ...util.decls]);
  const urank = propRank((util.decls[0] || [""])[0]);
  const tail = util.tail || "";
  const selectors = st.sels.map((s) => s + tail);
  const rules = [];
  if (base.length) rules.push({ selectors, media: st.media, decls: base, rank: st.rank, urank });
  for (const x of util.extraRules || []) rules.push({ selectors, media: [...st.media, ...x.media], decls: fix(x.decls), rank: st.rank + 1 + (x.rank || 0), urank });
  return { token: raw, rules, keyframes: util.keyframes || [] };
}

// ---------------------------------------------------------------------------------------------- compile

const fmtDecls = (decls, indent) => decls.map(([k, v]) => `${indent}${k}: ${v};`).join("\n");

/**
 * Compile a list of resolved tokens into one stylesheet (ordered like a utility framework: base < pseudo < dark < responsive).
 * @param {Array<ReturnType<typeof resolveToken>>} resolved
 */
export function serialize(resolved) {
  const rules = [];
  const frames = new Set();
  for (const r of resolved) {
    if (!r) continue;
    r.keyframes.forEach((k) => frames.add(k));
    for (const rule of r.rules) rules.push({ ...rule, token: r.token });
  }
  // Like Tailwind: variants after the base class, shorthands before longhands, then the class that sets more
  // properties first (so `leading-*` overrides the line-height of `text-sm`), then by name.
  rules.sort((a, b) => a.rank - b.rank || a.urank - b.urank || propCount(b) - propCount(a) || (a.token < b.token ? -1 : a.token > b.token ? 1 : 0));
  const renderRule = (r, ind = "") => `${r.selectors.map((x) => ind + x).join(",\n")} {\n${fmtDecls(r.decls, ind + "  ")}\n${ind}}`;
  const out = [];
  for (const k of frames) if (KEYFRAMES[k]) out.push(KEYFRAMES[k]);
  let group = null;
  const flush = () => {
    if (!group) return;
    let inner = group.rules.map((r) => renderRule(r, "  ".repeat(group.media.length))).join("\n");
    for (let i = group.media.length - 1; i >= 0; i--) {
      const ind = "  ".repeat(i);
      inner = `${ind}${group.media[i]} {\n${inner}\n${ind}}`;
    }
    out.push(inner);
    group = null;
  };
  for (const rule of rules) {
    if (!rule.media.length) { flush(); out.push(renderRule(rule)); continue; }
    const key = rule.media.join("|");
    if (!group || group.key !== key) { flush(); group = { key, media: rule.media, rules: [] }; }
    group.rules.push(rule);
  }
  flush();
  return out.join("\n");
}

/** Number of real (not custom) properties a rule sets. */
const propCount = (rule) => new Set(rule.decls.map(([k]) => k).filter((k) => !k.startsWith("--"))).size;

/** Resolve many tokens and report what could not be resolved. */
export function compileTokens(tokens, ctx) {
  const resolved = [], unsupported = [];
  for (const t of tokens) {
    const r = resolveToken(t, ctx);
    if (r) resolved.push(r); else unsupported.push(t);
  }
  return { css: serialize(resolved), resolved, unsupported };
}

/** Convenience: one token -> css string (or null). */
export function compileToken(raw, ctx = createContext()) {
  const r = resolveToken(raw, ctx);
  return r ? serialize([r]) : null;
}
