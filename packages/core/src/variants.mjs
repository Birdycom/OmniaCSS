// File: packages/core/src/variants.mjs
// On-demand variants for the OmniaCSS engine: hover:, md:, group-hover:, has-[..]:, aria-*, data-*, dark:, cq-md: …
// A variant maps a list of "branches" ({ sel, at }) around the utility: `sel` is a selector template where `&` stands
// for the utility class, `at` the list of wrapping at-rules (outermost first). Most variants keep one branch; dark: makes two.
// Map: breakpoints -> maps -> parseCandidate -> applyVariant -> resolveVariants
// Author: Serge Cools | Framework: OmniaCSS

/** Viewport breakpoints (min-width). sm/md/lg match the native responsive utilities (_responsive.scss). */
export const BREAKPOINTS = { sm: "36rem", md: "50rem", lg: "64rem", xl: "80rem", "2xl": "96rem" };

/** Container-query sizes for cq-<size>: (xs..xl match _containment.scss). */
export const CONTAINER_SIZES = {
  "3xs": "16rem", "2xs": "18rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem",
  "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem",
};

const PSEUDO_CLASS = {
  hover: ":hover", focus: ":focus", "focus-visible": ":focus-visible", "focus-within": ":focus-within", active: ":active",
  visited: ":visited", target: ":target", disabled: ":disabled", enabled: ":enabled", checked: ":checked", indeterminate: ":indeterminate",
  default: ":default", required: ":required", optional: ":optional", valid: ":valid", invalid: ":invalid", "user-valid": ":user-valid",
  "user-invalid": ":user-invalid", "in-range": ":in-range", "out-of-range": ":out-of-range", "read-only": ":read-only",
  "placeholder-shown": ":placeholder-shown", autofill: ":autofill", empty: ":empty",
  first: ":first-child", last: ":last-child", only: ":only-child", odd: ":nth-child(odd)", even: ":nth-child(even)",
  "first-of-type": ":first-of-type", "last-of-type": ":last-of-type", "only-of-type": ":only-of-type",
  open: ":is([open], :popover-open, :open)", "popover-open": ":popover-open", inert: ":is([inert], [inert] *)",
};
const STATE_ORDER = ["visited", "target", "open", "popover-open", "default", "checked", "indeterminate", "placeholder-shown", "autofill", "optional", "required", "valid", "invalid", "user-valid", "user-invalid", "in-range", "out-of-range", "read-only", "empty", "focus-within", "hover", "focus", "focus-visible", "active", "enabled", "disabled", "inert"];
const STRUCT_ORDER = ["first", "last", "only", "odd", "even", "first-of-type", "last-of-type", "only-of-type"];

const PSEUDO_ELEMENT = {
  before: "::before", after: "::after", "first-letter": "::first-letter", "first-line": "::first-line", marker: "::marker",
  placeholder: "::placeholder", backdrop: "::backdrop", file: "::file-selector-button", selection: "::selection", "details-content": "::details-content",
};

const MEDIA = {
  print: "print", "motion-safe": "(prefers-reduced-motion: no-preference)", "motion-reduce": "(prefers-reduced-motion: reduce)",
  portrait: "(orientation: portrait)", landscape: "(orientation: landscape)", "contrast-more": "(prefers-contrast: more)",
  "contrast-less": "(prefers-contrast: less)", "forced-colors": "(forced-colors: active)", "inverted-colors": "(inverted-colors: inverted)",
  "pointer-fine": "(pointer: fine)", "pointer-coarse": "(pointer: coarse)", "pointer-none": "(pointer: none)",
  "any-pointer-fine": "(any-pointer: fine)", "any-pointer-coarse": "(any-pointer: coarse)", "any-pointer-none": "(any-pointer: none)",
  "hover-capable": "(hover: hover)", noscript: "(scripting: none)", "auto-dark": "(prefers-color-scheme: dark)",
};

/** Scroll-state container queries (the element must sit inside a `container-scroll-state` ancestor). */
const SCROLL_STATE = {
  stuck: "not scroll-state(stuck: none)", "stuck-top": "scroll-state(stuck: top)", "stuck-bottom": "scroll-state(stuck: bottom)",
  "stuck-left": "scroll-state(stuck: left)", "stuck-right": "scroll-state(stuck: right)",
  snapped: "not scroll-state(snapped: none)", "snapped-x": "scroll-state(snapped: x)", "snapped-y": "scroll-state(snapped: y)",
  "scrollable-top": "scroll-state(scrollable: top)", "scrollable-bottom": "scroll-state(scrollable: bottom)",
  "scrollable-left": "scroll-state(scrollable: left)", "scrollable-right": "scroll-state(scrollable: right)",
};

const ARIA = ["busy", "checked", "disabled", "expanded", "hidden", "pressed", "readonly", "required", "selected"];

/** Fixed variant names per group (for editor tooling such as the OmniaCSS IntelliSense extension). */
export const VARIANT_GROUPS = {
  pseudoClass: Object.keys(PSEUDO_CLASS), pseudoElement: Object.keys(PSEUDO_ELEMENT), media: Object.keys(MEDIA),
  scrollState: Object.keys(SCROLL_STATE), aria: ARIA, other: ["dark", "rtl", "ltr", "starting", "*", "**"],
};

const DARK_EXPLICIT = ':where(.dark, [data-theme="dark"], :root:has(.oc-theme-switch input[value="dark"]:checked))';
const DARK_SYSTEM = ':where(:root:not([data-theme="light"], .light, :has(.oc-theme-switch input[value="light"]:checked)))';

/** Escape a string for use in a class selector. */
export function esc(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/[0-9]/.test(ch) && (i === 0 || (i === 1 && s[0] === "-"))) out += "\\3" + ch + " ";
    else if (/[A-Za-z0-9_\-¡-￿]/.test(ch)) out += ch;
    else out += "\\" + ch;
  }
  return out;
}

/** Split on `sep` outside of [] and (). */
export function splitTop(str, sep = ":") {
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

/** `[a_b]` -> `a b` (underscore = space, `\_` stays an underscore). */
const arbitrary = (s) => {
  const m = s.match(/^\[([\s\S]+)\]$/);
  return m ? m[1].replace(/\\_/g, "\u0000").replace(/_/g, " ").replace(/\u0000/g, "_") : null;
};

const quoteAttr = (s) => {
  const m = s.match(/^([^=~|^$*]+)([~|^$*]?=)(.*)$/);
  if (!m) return s;
  const v = /^["']/.test(m[3]) ? m[3] : `"${m[3]}"`;
  return `${m[1]}${m[2]}${v}`;
};

/** Append a simple selector in front of a trailing pseudo-element: `&::after` + `:hover` -> `&:hover::after`. */
function addSimple(sel, suffix) {
  const m = sel.match(/^(.*?)(::[a-z-]+)$/s);
  return m ? m[1] + suffix + m[2] : sel + suffix;
}

/**
 * Parse a class token: `md:hover:!bg-x` -> { variants: ["md","hover"], base: "bg-x", important: true }.
 * Returns null when there is nothing to do (no variants and no `!`).
 */
export function parseCandidate(token) {
  if (token.length > 120) return null;
  const parts = splitTop(token, ":");
  let base = parts.pop();
  if (!base) return null;
  let important = false;
  if (base.startsWith("!")) { important = true; base = base.slice(1); }
  else if (base.endsWith("!")) { important = true; base = base.slice(0, -1); }
  if (!/^-?[A-Za-z]/.test(base)) return null;
  if (!parts.length && !important) return null;
  if (parts.some((p) => !p)) return null;
  return { token, variants: parts, base, important };
}

const state = (sel = "&", at = []) => ({ sel, at });

/** Selector pattern of a variant that only changes the element's selector ("&:hover"), or null. */
function innerPattern(name) {
  const r = applyVariant(name, [state()]);
  return r && r.length === 1 && !r[0].at.length ? r[0].sel : null;
}

const patternOf = (name) => {
  const a = arbitrary(name);
  if (a !== null) return a.includes("&") ? a : `&${a}`;
  return innerPattern(name);
};

/**
 * Apply one variant to a list of branches.
 * @returns {{sel:string, at:string[]}[]|null} null when the variant is unknown
 */
export function applyVariant(name, branches) {
  const mapSel = (fn) => branches.map((b) => ({ ...b, sel: fn(b.sel) }));
  const wrap = (at) => branches.map((b) => ({ ...b, at: [...b.at, at] }));
  let m;

  if (Object.hasOwn(PSEUDO_CLASS, name)) return mapSel((s) => addSimple(s, PSEUDO_CLASS[name]));
  // marker: and selection: also reach the descendants (<ul class="marker:…"> colors the bullets of its <li>s).
  if (name === "marker" || name === "selection") {
    return branches.flatMap((b) => [{ ...b, sel: b.sel + PSEUDO_ELEMENT[name] }, { ...b, sel: `${b.sel} *${PSEUDO_ELEMENT[name]}` }]);
  }
  if (Object.hasOwn(PSEUDO_ELEMENT, name)) return mapSel((s) => s + PSEUDO_ELEMENT[name]);
  if (Object.hasOwn(MEDIA, name)) return wrap(`@media ${MEDIA[name]}`);
  if (Object.hasOwn(SCROLL_STATE, name)) return wrap(`@container ${SCROLL_STATE[name]}`);
  if (name === "starting") return wrap("@starting-style");
  if (name === "rtl" || name === "ltr") return mapSel((s) => addSimple(s, `:where(:dir(${name}), [dir="${name}"], [dir="${name}"] *)`));
  if (name === "dark") {
    return branches.flatMap((b) => [
      { sel: `${DARK_EXPLICIT} ${b.sel}`, at: b.at },
      { sel: `${DARK_SYSTEM} ${b.sel}`, at: [...b.at, "@media (prefers-color-scheme: dark)"] },
    ]);
  }
  if (name === "*") return mapSel((s) => `${s} > *`);
  if (name === "**") return mapSel((s) => `${s} *`);

  // viewport: sm, max-sm, min-sm, min-[600px], max-[600px]
  if (Object.hasOwn(BREAKPOINTS, name)) return wrap(`@media (min-width: ${BREAKPOINTS[name]})`);
  if ((m = name.match(/^(min|max)-(.+)$/))) {
    const [, kind, rest] = m;
    const a = arbitrary(rest);
    const v = a ?? BREAKPOINTS[rest];
    if (v) return wrap(kind === "min" ? `@media (min-width: ${v})` : `@media (width < ${v})`);
  }
  // container queries: cq-md, cq-max-md, cq-[400px], cq-md/name (and the short form @md)
  if ((m = name.match(/^(?:cq-|@)(?:(min|max)-)?(.+?)(?:\/([\w-]+))?$/))) {
    const [, kind, size, cname] = m;
    const a = arbitrary(size);
    const v = a ?? CONTAINER_SIZES[size];
    if (v) return wrap(`@container ${cname ? cname + " " : ""}${kind === "max" ? `(width < ${v})` : `(min-width: ${v})`}`);
  }
  // supports
  if ((m = name.match(/^(not-)?supports-(.+)$/))) {
    const a = arbitrary(m[2]);
    const cond = a !== null ? (/^[\w-]+\s*:/.test(a) ? `(${a})` : /^[\w-]+$/.test(a) ? `(${a}: inherit)` : a) : `(${m[2]}: inherit)`;
    return wrap(`@supports ${m[1] ? "not " : ""}${cond}`);
  }
  // data-* / aria-*
  if ((m = name.match(/^data-(.+)$/))) {
    const a = arbitrary(m[1]);
    return mapSel((s) => addSimple(s, a !== null ? `[data-${quoteAttr(a)}]` : `[data-${m[1]}]`));
  }
  if ((m = name.match(/^aria-(.+)$/))) {
    const a = arbitrary(m[1]);
    if (a === null && !ARIA.includes(m[1])) return null;
    return mapSel((s) => addSimple(s, a !== null ? `[aria-${quoteAttr(a)}]` : `[aria-${m[1]}="true"]`));
  }
  // group-* / peer-*  (optionally named: group-hover/card)
  if ((m = name.match(/^(group|peer)-(.+?)(?:\/([\w-]+))?$/))) {
    const [, kind, innerName, gname] = m;
    const pattern = patternOf(innerName);
    if (!pattern) return null;
    const marker = `:where(.${kind}${gname ? "\\/" + esc(gname) : ""})`;
    const rel = pattern.replace(/&/g, marker);
    return mapSel((s) => addSimple(s, `:is(${rel} ${kind === "group" ? "*" : "~ *"})`));
  }
  // has-* / not-* / in-*
  if ((m = name.match(/^(has|not|in)-(.+)$/))) {
    const [, kind, innerName] = m;
    const pattern = patternOf(innerName);
    if (!pattern && kind === "not") {
      // not-md, not-print, not-supports-[..]
      const inner = applyVariant(innerName, [state()]);
      if (inner && inner.length === 1 && inner[0].at.length === 1) {
        const at = inner[0].at[0];
        if (/^@media /.test(at)) { const p = at.slice(7); return wrap(`@media not ${p.startsWith("(") ? "all and " : ""}${p}`); }
        if (/^@supports not /.test(at)) return wrap(at.replace("@supports not ", "@supports "));
        if (/^@supports /.test(at)) return wrap(at.replace("@supports ", "@supports not "));
      }
      return null;
    }
    if (!pattern || !pattern.startsWith("&")) return null;
    const rest = pattern.slice(1);
    if (kind === "has") return mapSel((s) => addSimple(s, `:has(${rest})`));
    if (kind === "not") return mapSel((s) => addSimple(s, `:not(${rest})`));
    return mapSel((s) => `:where(${rest || "*"}) ${s}`);
  }
  if ((m = name.match(/^nth-(last-)?(of-type-)?(.+)$/))) {
    const a = arbitrary(m[3]);
    const arg = a ?? (/^\d+$/.test(m[3]) ? m[3] : /^(odd|even)$/.test(m[3]) ? m[3] : null);
    if (arg === null) return null;
    return mapSel((s) => addSimple(s, `:nth-${m[1] ? "last-" : ""}${m[2] ? "of-type" : "child"}(${arg})`));
  }
  // arbitrary variant: [&>svg]:, [&_p]:, [@media(min-width:900px)]:
  if ((m = name.match(/^\[([\s\S]+)\]$/))) {
    const body = arbitrary(name);
    if (body.startsWith("@")) return wrap(body.replace(/^@(media|supports|container)\s*/, "@$1 "));
    if (!body.includes("&")) return null;
    return mapSel((s) => body.replace(/&/g, s));
  }
  return null;
}

/** Apply all variants left to right. Returns branches or null if any variant is unknown. */
export function resolveVariants(variants) {
  let branches = [state()];
  for (const v of variants) {
    branches = applyVariant(v, branches);
    if (!branches) return null;
  }
  return branches;
}

/** Cascade rank of a variant list: states < group/peer < attribute < media < dark < screens < containers. */
export function rankOf(variants) {
  let rank = 0;
  for (const v of variants) {
    let r;
    if (Object.hasOwn(PSEUDO_ELEMENT, v)) r = 100;
    else if (STRUCT_ORDER.includes(v)) r = 200 + STRUCT_ORDER.indexOf(v);
    else if (Object.hasOwn(PSEUDO_CLASS, v)) r = 300 + STATE_ORDER.indexOf(v);
    else if (/^(group|peer|in)-/.test(v)) r = 400;
    else if (/^(has|not|aria|data|nth)-|^[*\[]/.test(v)) r = 500;
    else if (/^(not-)?supports-/.test(v)) r = 600;
    else if (v === "rtl" || v === "ltr") r = 650;
    else if (Object.hasOwn(MEDIA, v) || Object.hasOwn(SCROLL_STATE, v)) r = 700;
    else if (v === "dark") r = 800;
    else if (v === "starting") r = 900;
    else if (/^max-/.test(v)) r = 1000 - Object.keys(BREAKPOINTS).indexOf(v.slice(4)) * 10;
    else if (Object.hasOwn(BREAKPOINTS, v) || /^min-/.test(v)) r = 1100 + Object.keys(BREAKPOINTS).indexOf(v.replace(/^min-/, "")) * 10;
    else r = 2000;
    rank += r;
  }
  return rank;
}
