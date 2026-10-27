// File: packages/migrate/src/variants.mjs
// Variant handling: hover:, md:, dark:, group-hover:, data-[state=open]:, [&>svg]:, has-[...]: …
// A variant transforms a "state" ({ sels, media, prelude, rank }) around the utility's class selector.
// Author: Serge Cools | Framework: OmniaCSS

import { arb, normalizeArb } from "./values.mjs";

/** Escape a string for use in a CSS class selector. */
export function esc(s) {
  return s.replace(/^\d/, (c) => `\\3${c} `).replace(/[^A-Za-z0-9_ -￿-]/g, (c) => `\\${c}`).replace(/^-(\d)/, "-\\3$1 ");
}

/** Split on `sep` outside of [] and (). */
export function splitTop(str, sep) {
  const out = [];
  let depth = 0, cur = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "\\") { cur += ch + (str[++i] ?? ""); continue; }
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

// Rank: static pseudo-classes in cascade order (hover < focus < active < disabled …), then group/peer, dark, media, screens.
const PSEUDO_ORDER = ["first-letter", "first-line", "marker", "selection", "file", "placeholder", "backdrop", "before", "after", "first", "last", "only", "odd", "even", "first-of-type", "last-of-type", "only-of-type",
  "visited", "target", "open", "default", "checked", "indeterminate", "placeholder-shown", "autofill", "optional", "required", "valid", "invalid", "user-valid", "user-invalid", "in-range", "out-of-range", "read-only", "empty",
  "focus-within", "hover", "focus", "focus-visible", "active", "enabled", "disabled"];

const PSEUDO_CLASS = {
  first: ":first-child", last: ":last-child", only: ":only-child", odd: ":nth-child(odd)", even: ":nth-child(even)", "first-of-type": ":first-of-type", "last-of-type": ":last-of-type", "only-of-type": ":only-of-type",
  visited: ":visited", target: ":target", open: ":is([open], :popover-open, :open)", default: ":default", checked: ":checked", indeterminate: ":indeterminate", "placeholder-shown": ":placeholder-shown", autofill: ":autofill",
  optional: ":optional", required: ":required", valid: ":valid", invalid: ":invalid", "user-valid": ":user-valid", "user-invalid": ":user-invalid", "in-range": ":in-range", "out-of-range": ":out-of-range", "read-only": ":read-only",
  empty: ":empty", "focus-within": ":focus-within", hover: ":hover", focus: ":focus", "focus-visible": ":focus-visible", active: ":active", enabled: ":enabled", disabled: ":disabled", inert: ":is([inert], [inert] *)",
};
const PSEUDO_ELEMENT = {
  before: "::before", after: "::after", "first-letter": "::first-letter", "first-line": "::first-line", marker: "::marker", placeholder: "::placeholder", backdrop: "::backdrop", file: "::file-selector-button",
};
const MEDIA = {
  print: "print", "motion-safe": "(prefers-reduced-motion: no-preference)", "motion-reduce": "(prefers-reduced-motion: reduce)", portrait: "(orientation: portrait)", landscape: "(orientation: landscape)",
  "contrast-more": "(prefers-contrast: more)", "contrast-less": "(prefers-contrast: less)", "forced-colors": "(forced-colors: active)", "pointer-fine": "(pointer: fine)", "pointer-coarse": "(pointer: coarse)",
  "pointer-none": "(pointer: none)", "any-pointer-fine": "(any-pointer: fine)", "any-pointer-coarse": "(any-pointer: coarse)", "noscript": "(scripting: none)",
};
const ARIA = ["busy", "checked", "disabled", "expanded", "hidden", "pressed", "readonly", "required", "selected"];

const quoteAttr = (s) => {
  const m = s.match(/^([^=~|^$*]+)([~|^$*]?=)(.*)$/);
  if (!m) return s;
  let v = m[3];
  if (!/^["']/.test(v)) v = `"${v}"`;
  return `${m[1]}${m[2]}${v}`;
};

/** Selector pattern ("&:hover", "&[data-x]") that a pseudo-ish variant name applies to the element, or null. */
function innerPattern(name, ctx) {
  const st = { sels: ["&"], media: [], prelude: [], rank: 0 };
  const ok = applyVariant(name, st, ctx, { inner: true });
  return ok && !st.media.length ? st.sels[0] : null;
}

/**
 * Apply one variant to the state.
 * @returns {boolean} false when the variant is unknown
 */
export function applyVariant(name, st, ctx, { inner = false } = {}) {
  const mapSels = (fn) => { st.sels = st.sels.map(fn); };
  const rankOf = (n) => { const i = PSEUDO_ORDER.indexOf(n); return (i < 0 ? 40 : i) + 1; };

  if (PSEUDO_CLASS[name]) { mapSels((s) => addSimple(s, PSEUDO_CLASS[name])); st.rank += rankOf(name) * 10; return true; }
  if (name === "selection") { st.sels = st.sels.flatMap((s) => [`${s} ::selection`, `${s}::selection`]); st.rank += 40; return true; }
  if (PSEUDO_ELEMENT[name]) {
    mapSels((s) => s + PSEUDO_ELEMENT[name]);
    if (name === "before" || name === "after") st.prelude.push(["content", "var(--oc-content, \"\")"]);
    st.rank += rankOf(name) * 10; return true;
  }
  if (name === "dark") {
    if (ctx.darkMode === "media") st.media.unshift("@media (prefers-color-scheme: dark)");
    else mapSels((s) => `${ctx.darkSelector} ${s}`);
    st.rank += 5000; return true;
  }
  if (name === "ltr" || name === "rtl") { mapSels((s) => `[dir="${name}"] ${s}`); st.rank += 4000; return true; }
  if (MEDIA[name]) { st.media.unshift(`@media ${MEDIA[name]}`); st.rank += 6000; return true; }
  if (name === "starting") { st.media.unshift("@starting-style"); st.rank += 6500; return true; }
  if (name === "*") { mapSels((s) => `${s} > *`); st.rank += 3000; return true; }
  if (name === "**") { mapSels((s) => `${s} *`); st.rank += 3000; return true; }

  // screens
  if (ctx.screens[name]) { st.media.unshift(`@media (min-width: ${ctx.screens[name]})`); st.rank += 10000 + ctx.screenRank(name); return true; }
  let m = name.match(/^max-(.+)$/);
  if (m && ctx.screens[m[1]]) { st.media.unshift(`@media (width < ${ctx.screens[m[1]]})`); st.rank += 9000 - ctx.screenRank(m[1]); return true; }
  m = name.match(/^(min|max)-(\[.+\])$/);
  if (m) { const a = arb(m[2]); st.media.unshift(`@media (${m[1]}-width: ${a.value})`); st.rank += m[1] === "min" ? 10050 : 8999; return true; }
  // container queries
  m = name.match(/^@(?:(min|max)-)?(.+?)(?:\/([\w-]+))?$/);
  if (m) {
    const [, kind, size, cname] = m;
    const sizes = { "3xs": 16, "2xs": 18, xs: 20, sm: 24, md: 28, lg: 32, xl: 36, "2xl": 42, "3xl": 48, "4xl": 56, "5xl": 64, "6xl": 72, "7xl": 80 };
    const a = arb(size);
    const width = a ? a.value : sizes[size] ? `${sizes[size]}rem` : null;
    if (width) {
      const cond = kind === "max" ? `(width < ${width})` : `(min-width: ${width})`;
      st.media.unshift(`@container ${cname ? cname + " " : ""}${cond}`);
      st.rank += 20000 + (sizes[size] || 0); return true;
    }
  }
  // supports
  m = name.match(/^(not-)?supports-(.+)$/);
  if (m) {
    const a = arb(m[2]);
    const cond = a ? (/^[\w-]+:/.test(a.value) ? `(${a.value})` : a.value) : `(${m[2]}: var(--oc-x))`;
    st.media.unshift(`@supports ${m[1] ? "not " : ""}${cond}`); st.rank += 6200; return true;
  }
  // data- / aria-
  m = name.match(/^data-(.+)$/);
  if (m) {
    const a = arb(m[1]);
    const attr = a ? `[data-${quoteAttr(a.value)}]` : `[data-${m[1]}]`;
    mapSels((s) => addSimple(s, attr)); st.rank += 3500; return true;
  }
  m = name.match(/^aria-(.+)$/);
  if (m) {
    const a = arb(m[1]);
    const attr = a ? `[aria-${quoteAttr(a.value)}]` : `[aria-${m[1]}="true"]`;
    mapSels((s) => addSimple(s, attr)); st.rank += 3500; return true;
  }
  // group / peer
  m = name.match(/^(group|peer)(?:-(.+?))?(?:\/([\w-]+))?$/);
  if (m && m[2] !== undefined) {
    const [, kind, innerName, gname] = m;
    const base = `.${kind}${gname ? "\\/" + esc(gname) : ""}`;
    let pattern;
    const a = arb(innerName);
    if (a) pattern = a.value.includes("&") ? a.value : `&${a.value}`;
    else pattern = innerPattern(innerName, ctx);
    if (!pattern) return false;
    const rel = pattern.replace(/&/g, base);
    mapSels((s) => (kind === "group" ? `${rel} ${s}` : `${rel} ~ ${s}`));
    st.rank += 2000; return true;
  }
  // has / not / in / nth
  m = name.match(/^(has|not|in)-(.+)$/);
  if (m) {
    const [, kind, innerName] = m;
    const a = arb(innerName);
    let pattern;
    if (a) pattern = a.value.includes("&") ? a.value : `&${a.value}`;
    else pattern = innerPattern(innerName, ctx);
    if (kind === "not" && !pattern) {
      const med = MEDIA[innerName];
      if (med) { st.media.unshift(`@media not ${med}`); st.rank += 6000; return true; }
      if (ctx.screens[innerName]) { st.media.unshift(`@media (width < ${ctx.screens[innerName]})`); st.rank += 9000; return true; }
    }
    if (!pattern) return false;
    const rest = pattern.startsWith("&") ? pattern.slice(1) : pattern;
    if (kind === "has") mapSels((s) => addSimple(s, `:has(${rest})`));
    else if (kind === "not") mapSels((s) => addSimple(s, `:not(${rest})`));
    else mapSels((s) => `:where(${rest || "*"}) ${s}`);
    st.rank += 3200; return true;
  }
  m = name.match(/^nth-(last-)?(of-type-)?(.+)$/);
  if (m) {
    const a = arb(m[3]);
    const arg = a ? a.value : m[3];
    mapSels((s) => `${s}:nth-${m[1] ? "last-" : ""}${m[2] ? "of-type" : "child"}(${arg})`); st.rank += 450; return true;
  }
  if (ctx.customVariants && Object.hasOwn(ctx.customVariants, name)) {
    const p = ctx.customVariants[name].trim();
    if (p.startsWith("@")) st.media.unshift(p); else mapSels((s) => p.replace(/&/g, s));
    st.rank += 3000; return true;
  }
  // arbitrary variant: [&>*]:, [&_svg]:, [@media(min-width:900px)]:
  m = name.match(/^\[([\s\S]+)\]$/);
  if (m) {
    const body = normalizeArb(m[1]);
    if (body.startsWith("@")) { st.media.unshift(body.replace(/^@(media|supports|container)\s*/, "@$1 ")); st.rank += 6100; return true; }
    if (!body.includes("&")) return false;
    mapSels((s) => body.replace(/&/g, s)); st.rank += 3000; return true;
  }
  return false;
}

/** Append a simple selector (pseudo-class, attribute …) in front of a trailing pseudo-element: `.a::after` + `:hover` -> `.a:hover::after`. */
function addSimple(sel, suffix) {
  const m = sel.match(/^(.*?)(::[a-z-]+)$/s);
  return m ? m[1] + suffix + m[2] : sel + suffix;
}
