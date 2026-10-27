// File: packages/migrate/src/bootstrap/convert.mjs
// Convert one Bootstrap class to OmniaCSS / OmniaUI. Utilities are matched on their CSS declarations against the
// shipped OmniaCSS build (so `mt-3` = 1rem becomes `mt-1`, whatever the names), responsive infixes become variants.
// Map: declaration index -> breakpoint -> legacy check -> convertClass
// Author: Serge Cools | Framework: OmniaCSS

import { loadOmniaIndex } from "../native.mjs";
import { BREAKPOINTS, OMNIA_BREAKPOINTS, utilityDecls, RENAMES, COMPONENTS, MANUAL, JS_STATE, isGridClass } from "./rules.mjs";

/** Canonical declaration: no spaces around ":" and "/", zero lengths written as 0. */
const canon = (decl) => decl.trim().replace(/\s*:\s*/, ":").replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").replace(/(^|[\s:(,-])0(?:rem|px|em|%)(?=$|[\s),;])/g, "$10");
const sortKey = (decls) => decls.map(canon).sort().join(";");
const PREFIXED = /^-(webkit|moz|ms|o)-|:-(webkit|moz|ms|o)-/;

/** OmniaCSS index keyed on sorted declarations (order inside a rule does not matter). */
export function loadDeclIndex(cwd) {
  const index = loadOmniaIndex(cwd);
  if (index.sorted) return index;
  index.sorted = new Map();
  for (const [key, names] of index.byDecls) {
    // Also index without vendor-prefixed fallbacks (position: -webkit-sticky; position: sticky).
    const all = key.split(";");
    for (const k of new Set([sortKey(all), sortKey(all.filter((x) => !PREFIXED.test(x.trim())))])) {
      if (k) index.sorted.set(k, [...(index.sorted.get(k) || []), ...names]);
    }
  }
  return index;
}

/** Pick the OmniaCSS class for one declaration group: the Bootstrap name itself when it means the same, else the shortest. */
function pick(names, preferred) {
  if (names.includes(preferred)) return preferred;
  return [...names].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

/** Bootstrap breakpoint -> OmniaCSS variant prefix ("md:" or "min-[48rem]:"). */
export function bpVariant(bp, version, mode = "omnia") {
  const px = BREAKPOINTS[version][bp];
  if (!px) return "";
  if (mode === "exact") return `min-[${px / 16}rem]:`;
  const [name] = Object.entries(OMNIA_BREAKPOINTS).sort((a, b) => Math.abs(a[1] - px) - Math.abs(b[1] - px))[0];
  return `${name}:`;
}

/** Bootstrap 3/4 names that do nothing in a newer major version (the project may style them itself). */
const LEGACY = [
  [/^col-xs-/, 3], [/^col-(sm|md|lg)-(offset|push|pull)-/, 3], [/^panel/, 3], [/^well$/, 3], [/^label-/, 3], [/^help-block$/, 3],
  [/^img-(responsive|rounded|circle)$/, 3], [/^pull-(left|right)$/, 3], [/^center-block$/, 3], [/^(hidden|visible)-/, 3], [/^glyphicon/, 3],
  [/^btn-(default|xs)$/, 3], [/^input-group-addon$/, 3], [/^control-label$/, 3], [/^table-condensed$/, 3], [/^hidden$/, 3],
  [/^[mp][lr]-/, 4], [/^font-(weight|italic)/, 4], [/^(float|text)-(left|right)$/, 4], [/^badge-/, 4], [/^sr-only/, 4], [/^custom-select$/, 4],
  [/^embed-responsive/, 4], [/^btn-block$/, 4], [/^jumbotron$/, 4], [/^form-group$/, 4],
];
const legacyMax = (name) => LEGACY.find(([re]) => re.test(name))?.[1];

const HIDDEN_ORDER = { 3: ["xs", "sm", "md", "lg"] };

/**
 * @param {string} name a single Bootstrap class
 * @param {{ version: 3|4|5, breakpoints?: "omnia"|"exact", index: object }} ctx
 * @returns {{ kind: "utility"|"component"|"grid"|"manual"|"state"|"inactive"|"unmapped"|"custom", to?: string, hint?: string }}
 */
export function convertClass(name, ctx) {
  const { version: v, breakpoints = "omnia", index } = ctx;
  if (JS_STATE.has(name)) return { kind: "state" };
  const max = legacyMax(name);
  if (max && v > max) return { kind: "inactive", hint: `Bootstrap ${max} class: does nothing in Bootstrap ${v}` };
  if (isGridClass(name)) return { kind: "grid" };
  if (Object.hasOwn(COMPONENTS, name)) return { kind: "component", to: COMPONENTS[name] };
  if (/^btn-outline-/.test(name)) return { kind: "component", to: "oc-btn--outline" };
  if (Object.hasOwn(RENAMES, name)) return { kind: "utility", to: RENAMES[name] };
  for (const [re, hint] of MANUAL) if (re.test(name)) return { kind: "manual", hint };

  // Bootstrap 3 hidden-{bp}: hide inside that breakpoint range only.
  let m;
  if (v === 3 && (m = name.match(/^hidden-(xs|sm|md|lg)$/))) {
    const order = HIDDEN_ORDER[3];
    const i = order.indexOf(m[1]);
    const from = i > 0 ? bpVariant(order[i], 3, breakpoints) : "";
    const next = order[i + 1] ? bpVariant(order[i + 1], 3, breakpoints) : "";
    const to = next.startsWith("min-") ? "max-" + next.slice(4) : next ? "max-" + next : "";
    return { kind: "utility", to: `${from}${to}d-none` };
  }

  // Responsive infix: d-md-none, mt-lg-3, text-md-center, justify-content-md-between
  let base = name, prefix = "";
  if ((m = name.match(/^([a-z]+(?:-[a-z]+)*?)-(sm|md|lg|xl|xxl)-(.+)$/)) && BREAKPOINTS[v][m[2]]) {
    base = `${m[1]}-${m[3]}`;
    prefix = bpVariant(m[2], v, breakpoints);
  }

  const groups = utilityDecls(base, v);
  if (!groups) return { kind: "custom" };
  const out = [];
  for (const g of groups) {
    const names = index.sorted.get(sortKey(g));
    if (!names) return { kind: "unmapped", hint: `no OmniaCSS class with ${g.join("; ")}` };
    out.push(prefix + pick(names, base));
  }
  return { kind: "utility", to: out.join(" ") };
}

export { sortKey };
