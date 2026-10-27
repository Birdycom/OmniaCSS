// File: packages/migrate/src/utilities.mjs
// Utility table of the compat resolver: Tailwind-style class (without variants) -> declarations.
// Colors only ever resolve to Omnia palette tokens. Scales are rem based (same numbers as the familiar 0.25rem step).
// Author: Serge Cools | Framework: OmniaCSS

import { arb, color, fmt, frac, inferType, isNum, negate, rem, spacing, withAlpha } from "./values.mjs";

/** Parse "a:b;c:d" into [["a","b"],["c","d"]] (semicolons inside parentheses are kept). */
export function decls(str) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of str + ";") {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      const i = cur.indexOf(":");
      if (i > 0 && cur.trim()) out.push([cur.slice(0, i).trim(), cur.slice(i + 1).trim()]);
      cur = "";
    } else cur += ch;
  }
  return out;
}
const d = (prop, val) => [[prop, val]];

// ---------------------------------------------------------------------------------------------- scales

const BLACK = "var(--color-black-50)";
const sh = (y, blur, spread, a) => `0 ${y}px ${blur}px ${spread}px oklch(from var(--oc-shadow-color, ${BLACK}) l c h / ${a})`;
/** Omnia's own shadow values (core dist), plus the extra steps. */
const SHADOWS = {
  "2xs": sh(1, 0, 0, 0.05),
  xs: sh(1, 2, 0, 0.06),
  sm: sh(1, 2, 0, 0.08),
  DEFAULT: `${sh(1, 3, 0, 0.12)}, ${sh(1, 2, -1, 0.1)}`,
  md: `${sh(4, 6, -1, 0.15)}, ${sh(2, 4, -2, 0.12)}`,
  lg: `${sh(10, 15, -3, 0.18)}, ${sh(4, 6, -4, 0.14)}`,
  xl: `${sh(20, 25, -5, 0.22)}, ${sh(8, 10, -6, 0.16)}`,
  "2xl": sh(25, 50, -12, 0.35),
  inner: `inset 0 2px 4px 0 oklch(from var(--oc-shadow-color, ${BLACK}) l c h / 0.12)`,
};
// Tailwind 3 naming: shadow-sm = small, shadow = default. Tailwind 4 shifted every name one step down.
const SHADOW_NAMES = (name, ctx) => {
  if (name === "none") return "0 0 transparent";
  if (name === "inner") return SHADOWS.inner;
  if (ctx.v4) return ({ sm: "DEFAULT" })[name] ? SHADOWS[({ sm: "DEFAULT" })[name]] : SHADOWS[name];
  return SHADOWS[name];
};

const FONT_SIZES = {
  xs: ["0.75rem", "calc(1 / 0.75)"], sm: ["0.875rem", "calc(1.25 / 0.875)"], base: ["1rem", "calc(1.5 / 1)"], lg: ["1.125rem", "calc(1.75 / 1.125)"],
  xl: ["1.25rem", "calc(1.75 / 1.25)"], "2xl": ["1.5rem", "calc(2 / 1.5)"], "3xl": ["1.875rem", "calc(2.25 / 1.875)"], "4xl": ["2.25rem", "calc(2.5 / 2.25)"],
  "5xl": ["3rem", "1"], "6xl": ["3.75rem", "1"], "7xl": ["4.5rem", "1"], "8xl": ["6rem", "1"], "9xl": ["8rem", "1"],
};
const LEADING = { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2" };
const TRACKING = { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" };
const WEIGHTS = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const FAMILIES = {
  sans: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};
const RADIUS = { none: "0px", xs: "0.125rem", sm: "0.25rem", DEFAULT: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", "4xl": "2rem", full: "calc(infinity * 1px)" };
const RADIUS_V3 = { sm: "0.125rem", DEFAULT: "0.25rem" };
const CONTAINERS = { "3xs": 16, "2xs": 18, xs: 20, sm: 24, md: 28, lg: 32, xl: 36, "2xl": 42, "3xl": 48, "4xl": 56, "5xl": 64, "6xl": 72, "7xl": 80 };
const BLUR = { none: "", "3xs": "", xs: "4px", sm: "8px", DEFAULT: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" };
const BLUR_V3 = { sm: "4px", DEFAULT: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" };
const EASE = { linear: "linear", in: "cubic-bezier(0.4, 0, 1, 1)", out: "cubic-bezier(0, 0, 0.2, 1)", "in-out": "cubic-bezier(0.4, 0, 0.2, 1)" };
const TRANSITION_ALL = "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, backdrop-filter, display, content-visibility, overlay, pointer-events";
const TRANSITION_DEFAULT = "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, backdrop-filter";
const T = (props) => `transition-property:${props};transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:0.15s`;

// ---------------------------------------------------------------------------------------------- static table

const S = {};
const add = (obj) => { for (const [k, v] of Object.entries(obj)) S[k] = decls(v); };

add({
  // display
  block: "display:block", "inline-block": "display:inline-block", inline: "display:inline", flex: "display:flex", "inline-flex": "display:inline-flex",
  grid: "display:grid", "inline-grid": "display:inline-grid", contents: "display:contents", hidden: "display:none", table: "display:table",
  "inline-table": "display:inline-table", "table-row": "display:table-row", "table-cell": "display:table-cell", "table-caption": "display:table-caption",
  "table-column": "display:table-column", "table-column-group": "display:table-column-group", "table-footer-group": "display:table-footer-group",
  "table-header-group": "display:table-header-group", "table-row-group": "display:table-row-group", "flow-root": "display:flow-root", "list-item": "display:list-item",
  visible: "visibility:visible", invisible: "visibility:hidden", collapse: "visibility:collapse",
  "sr-only": "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border-width:0",
  "not-sr-only": "position:static;width:auto;height:auto;padding:0;margin:0;overflow:visible;clip-path:none;white-space:normal",
  // position
  static: "position:static", fixed: "position:fixed", absolute: "position:absolute", relative: "position:relative", sticky: "position:sticky",
  isolate: "isolation:isolate", "isolation-auto": "isolation:auto",
  // box
  "box-border": "box-sizing:border-box", "box-content": "box-sizing:content-box",
  "float-left": "float:left", "float-right": "float:right", "float-none": "float:none", "float-start": "float:inline-start", "float-end": "float:inline-end",
  "clear-left": "clear:left", "clear-right": "clear:right", "clear-both": "clear:both", "clear-none": "clear:none",
  // flex
  "flex-row": "flex-direction:row", "flex-row-reverse": "flex-direction:row-reverse", "flex-col": "flex-direction:column", "flex-col-reverse": "flex-direction:column-reverse",
  "flex-wrap": "flex-wrap:wrap", "flex-wrap-reverse": "flex-wrap:wrap-reverse", "flex-nowrap": "flex-wrap:nowrap",
  "flex-1": "flex:1", "flex-auto": "flex:1 1 auto", "flex-initial": "flex:0 1 auto", "flex-none": "flex:none",
  grow: "flex-grow:1", "grow-0": "flex-grow:0", "flex-grow": "flex-grow:1", "flex-grow-0": "flex-grow:0",
  shrink: "flex-shrink:1", "shrink-0": "flex-shrink:0", "flex-shrink": "flex-shrink:1", "flex-shrink-0": "flex-shrink:0",
  // alignment
  "justify-normal": "justify-content:normal", "justify-start": "justify-content:flex-start", "justify-end": "justify-content:flex-end", "justify-center": "justify-content:center",
  "justify-between": "justify-content:space-between", "justify-around": "justify-content:space-around", "justify-evenly": "justify-content:space-evenly", "justify-stretch": "justify-content:stretch",
  "justify-center-safe": "justify-content:safe center", "justify-end-safe": "justify-content:safe flex-end",
  "justify-items-start": "justify-items:start", "justify-items-end": "justify-items:end", "justify-items-center": "justify-items:center", "justify-items-stretch": "justify-items:stretch",
  "justify-self-auto": "justify-self:auto", "justify-self-start": "justify-self:start", "justify-self-end": "justify-self:end", "justify-self-center": "justify-self:center", "justify-self-stretch": "justify-self:stretch",
  "items-start": "align-items:flex-start", "items-end": "align-items:flex-end", "items-center": "align-items:center", "items-baseline": "align-items:baseline", "items-stretch": "align-items:stretch",
  "items-center-safe": "align-items:safe center", "items-baseline-last": "align-items:last baseline",
  "content-normal": "align-content:normal", "content-center": "align-content:center", "content-start": "align-content:flex-start", "content-end": "align-content:flex-end",
  "content-between": "align-content:space-between", "content-around": "align-content:space-around", "content-evenly": "align-content:space-evenly", "content-baseline": "align-content:baseline", "content-stretch": "align-content:stretch",
  "self-auto": "align-self:auto", "self-start": "align-self:flex-start", "self-end": "align-self:flex-end", "self-center": "align-self:center", "self-stretch": "align-self:stretch", "self-baseline": "align-self:baseline",
  "place-content-center": "place-content:center", "place-content-start": "place-content:start", "place-content-end": "place-content:end", "place-content-between": "place-content:space-between",
  "place-content-around": "place-content:space-around", "place-content-evenly": "place-content:space-evenly", "place-content-stretch": "place-content:stretch",
  "place-items-start": "place-items:start", "place-items-end": "place-items:end", "place-items-center": "place-items:center", "place-items-baseline": "place-items:baseline", "place-items-stretch": "place-items:stretch",
  "place-self-auto": "place-self:auto", "place-self-start": "place-self:start", "place-self-end": "place-self:end", "place-self-center": "place-self:center", "place-self-stretch": "place-self:stretch",
  // grid
  "grid-flow-row": "grid-auto-flow:row", "grid-flow-col": "grid-auto-flow:column", "grid-flow-dense": "grid-auto-flow:dense", "grid-flow-row-dense": "grid-auto-flow:row dense", "grid-flow-col-dense": "grid-auto-flow:column dense",
  "grid-cols-none": "grid-template-columns:none", "grid-cols-subgrid": "grid-template-columns:subgrid", "grid-rows-none": "grid-template-rows:none", "grid-rows-subgrid": "grid-template-rows:subgrid",
  "col-auto": "grid-column:auto", "col-span-full": "grid-column:1 / -1", "row-auto": "grid-row:auto", "row-span-full": "grid-row:1 / -1",
  "col-start-auto": "grid-column-start:auto", "col-end-auto": "grid-column-end:auto", "row-start-auto": "grid-row-start:auto", "row-end-auto": "grid-row-end:auto",
  "auto-cols-auto": "grid-auto-columns:auto", "auto-cols-min": "grid-auto-columns:min-content", "auto-cols-max": "grid-auto-columns:max-content", "auto-cols-fr": "grid-auto-columns:minmax(0, 1fr)",
  "auto-rows-auto": "grid-auto-rows:auto", "auto-rows-min": "grid-auto-rows:min-content", "auto-rows-max": "grid-auto-rows:max-content", "auto-rows-fr": "grid-auto-rows:minmax(0, 1fr)",
  "order-first": "order:-9999", "order-last": "order:9999", "order-none": "order:0",
  // overflow & scroll
  "overflow-auto": "overflow:auto", "overflow-hidden": "overflow:hidden", "overflow-clip": "overflow:clip", "overflow-visible": "overflow:visible", "overflow-scroll": "overflow:scroll",
  "overflow-x-auto": "overflow-x:auto", "overflow-x-hidden": "overflow-x:hidden", "overflow-x-clip": "overflow-x:clip", "overflow-x-visible": "overflow-x:visible", "overflow-x-scroll": "overflow-x:scroll",
  "overflow-y-auto": "overflow-y:auto", "overflow-y-hidden": "overflow-y:hidden", "overflow-y-clip": "overflow-y:clip", "overflow-y-visible": "overflow-y:visible", "overflow-y-scroll": "overflow-y:scroll",
  "overscroll-auto": "overscroll-behavior:auto", "overscroll-contain": "overscroll-behavior:contain", "overscroll-none": "overscroll-behavior:none",
  "overscroll-x-auto": "overscroll-behavior-x:auto", "overscroll-x-contain": "overscroll-behavior-x:contain", "overscroll-x-none": "overscroll-behavior-x:none",
  "overscroll-y-auto": "overscroll-behavior-y:auto", "overscroll-y-contain": "overscroll-behavior-y:contain", "overscroll-y-none": "overscroll-behavior-y:none",
  "scroll-auto": "scroll-behavior:auto", "scroll-smooth": "scroll-behavior:smooth",
  "snap-none": "scroll-snap-type:none", "snap-x": "scroll-snap-type:x var(--oc-snap-strictness, proximity)", "snap-y": "scroll-snap-type:y var(--oc-snap-strictness, proximity)", "snap-both": "scroll-snap-type:both var(--oc-snap-strictness, proximity)",
  "snap-mandatory": "--oc-snap-strictness:mandatory", "snap-proximity": "--oc-snap-strictness:proximity",
  "snap-start": "scroll-snap-align:start", "snap-end": "scroll-snap-align:end", "snap-center": "scroll-snap-align:center", "snap-align-none": "scroll-snap-align:none",
  "snap-normal": "scroll-snap-stop:normal", "snap-always": "scroll-snap-stop:always",
  // typography
  "text-left": "text-align:left", "text-center": "text-align:center", "text-right": "text-align:right", "text-justify": "text-align:justify", "text-start": "text-align:start", "text-end": "text-align:end",
  "text-wrap": "text-wrap:wrap", "text-nowrap": "text-wrap:nowrap", "text-balance": "text-wrap:balance", "text-pretty": "text-wrap:pretty",
  "text-ellipsis": "text-overflow:ellipsis", "text-clip": "text-overflow:clip", truncate: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap",
  uppercase: "text-transform:uppercase", lowercase: "text-transform:lowercase", capitalize: "text-transform:capitalize", "normal-case": "text-transform:none",
  underline: "text-decoration-line:underline", overline: "text-decoration-line:overline", "line-through": "text-decoration-line:line-through", "no-underline": "text-decoration-line:none",
  "decoration-solid": "text-decoration-style:solid", "decoration-double": "text-decoration-style:double", "decoration-dotted": "text-decoration-style:dotted", "decoration-dashed": "text-decoration-style:dashed", "decoration-wavy": "text-decoration-style:wavy",
  "decoration-auto": "text-decoration-thickness:auto", "decoration-from-font": "text-decoration-thickness:from-font",
  "underline-offset-auto": "text-underline-offset:auto",
  italic: "font-style:italic", "not-italic": "font-style:normal", antialiased: "-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale", "subpixel-antialiased": "-webkit-font-smoothing:auto;-moz-osx-font-smoothing:auto",
  "whitespace-normal": "white-space:normal", "whitespace-nowrap": "white-space:nowrap", "whitespace-pre": "white-space:pre", "whitespace-pre-line": "white-space:pre-line", "whitespace-pre-wrap": "white-space:pre-wrap", "whitespace-break-spaces": "white-space:break-spaces",
  "break-normal": "overflow-wrap:normal;word-break:normal", "break-words": "overflow-wrap:break-word", "break-all": "word-break:break-all", "break-keep": "word-break:keep-all",
  "hyphens-none": "hyphens:none", "hyphens-manual": "hyphens:manual", "hyphens-auto": "hyphens:auto",
  "normal-nums": "font-variant-numeric:normal", ordinal: "font-variant-numeric:ordinal", "slashed-zero": "font-variant-numeric:slashed-zero", "lining-nums": "font-variant-numeric:lining-nums",
  "oldstyle-nums": "font-variant-numeric:oldstyle-nums", "proportional-nums": "font-variant-numeric:proportional-nums", "tabular-nums": "font-variant-numeric:tabular-nums",
  "diagonal-fractions": "font-variant-numeric:diagonal-fractions", "stacked-fractions": "font-variant-numeric:stacked-fractions",
  "list-none": "list-style-type:none", "list-disc": "list-style-type:disc", "list-decimal": "list-style-type:decimal", "list-inside": "list-style-position:inside", "list-outside": "list-style-position:outside",
  "align-baseline": "vertical-align:baseline", "align-top": "vertical-align:top", "align-middle": "vertical-align:middle", "align-bottom": "vertical-align:bottom", "align-text-top": "vertical-align:text-top", "align-text-bottom": "vertical-align:text-bottom", "align-sub": "vertical-align:sub", "align-super": "vertical-align:super",
  "line-clamp-none": "overflow:visible;display:block;-webkit-box-orient:horizontal;-webkit-line-clamp:unset;line-clamp:unset",
  // borders
  "border-solid": "border-style:solid", "border-dashed": "border-style:dashed", "border-dotted": "border-style:dotted", "border-double": "border-style:double", "border-hidden": "border-style:hidden", "border-none": "border-style:none",
  "divide-solid": "border-style:solid", "divide-dashed": "border-style:dashed", "divide-dotted": "border-style:dotted", "divide-none": "border-style:none",
  "border-collapse": "border-collapse:collapse", "border-separate": "border-collapse:separate",
  "outline-none": "outline-style:none", "outline-hidden": "outline:2px solid transparent;outline-offset:2px", "outline-solid": "outline-style:solid", "outline-dashed": "outline-style:dashed", "outline-dotted": "outline-style:dotted", "outline-double": "outline-style:double",
  outline: "outline-style:solid;outline-width:1px",
  // backgrounds
  "bg-fixed": "background-attachment:fixed", "bg-local": "background-attachment:local", "bg-scroll": "background-attachment:scroll",
  "bg-clip-border": "background-clip:border-box", "bg-clip-padding": "background-clip:padding-box", "bg-clip-content": "background-clip:content-box", "bg-clip-text": "-webkit-background-clip:text;background-clip:text",
  "bg-origin-border": "background-origin:border-box", "bg-origin-padding": "background-origin:padding-box", "bg-origin-content": "background-origin:content-box",
  "bg-repeat": "background-repeat:repeat", "bg-no-repeat": "background-repeat:no-repeat", "bg-repeat-x": "background-repeat:repeat-x", "bg-repeat-y": "background-repeat:repeat-y", "bg-repeat-round": "background-repeat:round", "bg-repeat-space": "background-repeat:space",
  "bg-auto": "background-size:auto", "bg-cover": "background-size:cover", "bg-contain": "background-size:contain", "bg-none": "background-image:none",
  "bg-center": "background-position:center", "bg-top": "background-position:top", "bg-bottom": "background-position:bottom", "bg-left": "background-position:left", "bg-right": "background-position:right",
  "bg-left-top": "background-position:left top", "bg-left-bottom": "background-position:left bottom", "bg-right-top": "background-position:right top", "bg-right-bottom": "background-position:right bottom",
  "bg-top-left": "background-position:left top", "bg-top-right": "background-position:right top", "bg-bottom-left": "background-position:left bottom", "bg-bottom-right": "background-position:right bottom",
  "bg-blend-normal": "background-blend-mode:normal", "bg-blend-multiply": "background-blend-mode:multiply", "bg-blend-screen": "background-blend-mode:screen", "bg-blend-overlay": "background-blend-mode:overlay",
  // objects
  "object-contain": "object-fit:contain", "object-cover": "object-fit:cover", "object-fill": "object-fit:fill", "object-none": "object-fit:none", "object-scale-down": "object-fit:scale-down",
  "object-center": "object-position:center", "object-top": "object-position:top", "object-bottom": "object-position:bottom", "object-left": "object-position:left", "object-right": "object-position:right",
  "object-left-top": "object-position:left top", "object-right-top": "object-position:right top", "object-left-bottom": "object-position:left bottom", "object-right-bottom": "object-position:right bottom",
  "aspect-auto": "aspect-ratio:auto", "aspect-square": "aspect-ratio:1 / 1", "aspect-video": "aspect-ratio:16 / 9",
  // interactivity
  "pointer-events-none": "pointer-events:none", "pointer-events-auto": "pointer-events:auto",
  "select-none": "-webkit-user-select:none;user-select:none", "select-text": "-webkit-user-select:text;user-select:text", "select-all": "-webkit-user-select:all;user-select:all", "select-auto": "-webkit-user-select:auto;user-select:auto",
  "resize-none": "resize:none", resize: "resize:both", "resize-x": "resize:horizontal", "resize-y": "resize:vertical",
  "appearance-none": "appearance:none", "appearance-auto": "appearance:auto",
  "touch-auto": "touch-action:auto", "touch-none": "touch-action:none", "touch-manipulation": "touch-action:manipulation", "touch-pan-x": "touch-action:pan-x", "touch-pan-y": "touch-action:pan-y", "touch-pinch-zoom": "touch-action:pinch-zoom",
  "will-change-auto": "will-change:auto", "will-change-scroll": "will-change:scroll-position", "will-change-contents": "will-change:contents", "will-change-transform": "will-change:transform",
  "field-sizing-content": "field-sizing:content", "field-sizing-fixed": "field-sizing:fixed",
  "scheme-light": "color-scheme:light", "scheme-dark": "color-scheme:dark", "scheme-light-dark": "color-scheme:light dark", "scheme-normal": "color-scheme:normal",
  // effects
  "mix-blend-normal": "mix-blend-mode:normal", "mix-blend-multiply": "mix-blend-mode:multiply", "mix-blend-screen": "mix-blend-mode:screen", "mix-blend-overlay": "mix-blend-mode:overlay",
  "mix-blend-darken": "mix-blend-mode:darken", "mix-blend-lighten": "mix-blend-mode:lighten", "mix-blend-difference": "mix-blend-mode:difference", "mix-blend-plus-lighter": "mix-blend-mode:plus-lighter",
  // transitions & animation
  transition: T(TRANSITION_DEFAULT), "transition-all": T("all"), "transition-colors": T("color, background-color, border-color, outline-color, text-decoration-color, fill, stroke"),
  "transition-opacity": T("opacity"), "transition-shadow": T("box-shadow"), "transition-transform": T("transform, translate, scale, rotate"), "transition-none": "transition-property:none",
  "transition-discrete": "transition-behavior:allow-discrete", "transition-normal": "transition-behavior:normal",
  "ease-linear": `transition-timing-function:${EASE.linear}`, "ease-in": `transition-timing-function:${EASE.in}`, "ease-out": `transition-timing-function:${EASE.out}`, "ease-in-out": `transition-timing-function:${EASE["in-out"]}`,
  "ease-initial": "transition-timing-function:initial",
  "animate-none": "animation:none",
  // transforms
  "transform-none": "transform:none", "transform-gpu": "transform:translateZ(0)", transform: "", "transform-cpu": "",
  "origin-center": "transform-origin:center", "origin-top": "transform-origin:top", "origin-top-right": "transform-origin:top right", "origin-right": "transform-origin:right",
  "origin-bottom-right": "transform-origin:bottom right", "origin-bottom": "transform-origin:bottom", "origin-bottom-left": "transform-origin:bottom left", "origin-left": "transform-origin:left", "origin-top-left": "transform-origin:top left",
  "backface-visible": "backface-visibility:visible", "backface-hidden": "backface-visibility:hidden",
  "transform-style-3d": "transform-style:preserve-3d", "transform-3d": "transform-style:preserve-3d", "transform-flat": "transform-style:flat",
  // misc
  "container-type-normal": "container-type:normal", "@container": "container-type:inline-size", "@container-normal": "container-type:normal",
  "fill-none": "fill:none", "stroke-none": "stroke:none",
  "table-auto": "table-layout:auto", "table-fixed": "table-layout:fixed", "caption-top": "caption-side:top", "caption-bottom": "caption-side:bottom",
  "filter-none": "filter:none", filter: "", "backdrop-filter-none": "backdrop-filter:none", "backdrop-filter": "",
  "forced-color-adjust-auto": "forced-color-adjust:auto", "forced-color-adjust-none": "forced-color-adjust:none",
  "break-before-auto": "break-before:auto", "break-after-auto": "break-after:auto", "break-inside-avoid": "break-inside:avoid", "break-inside-auto": "break-inside:auto",
  "content-none": "content:none", "text-shadow-none": "text-shadow:none",
  "animate-in": "animation-name:enter;animation-duration:150ms;--oc-enter-opacity:initial;--oc-enter-scale:initial;--oc-enter-rotate:initial;--oc-enter-translate-x:initial;--oc-enter-translate-y:initial",
  "animate-out": "animation-name:exit;animation-duration:150ms;--oc-exit-opacity:initial;--oc-exit-scale:initial;--oc-exit-rotate:initial;--oc-exit-translate-x:initial;--oc-exit-translate-y:initial",
  "running": "animation-play-state:running", "paused": "animation-play-state:paused",
  "fill-mode-none": "animation-fill-mode:none", "fill-mode-forwards": "animation-fill-mode:forwards", "fill-mode-backwards": "animation-fill-mode:backwards", "fill-mode-both": "animation-fill-mode:both",
  "direction-normal": "animation-direction:normal", "direction-reverse": "animation-direction:reverse", "direction-alternate": "animation-direction:alternate", "direction-alternate-reverse": "animation-direction:alternate-reverse",
  "repeat-0": "animation-iteration-count:0", "repeat-1": "animation-iteration-count:1", "repeat-infinite": "animation-iteration-count:infinite",
});

export const KEYFRAMES = {
  spin: "@keyframes spin{to{transform:rotate(360deg)}}",
  ping: "@keyframes ping{75%,100%{transform:scale(2);opacity:0}}",
  pulse: "@keyframes pulse{50%{opacity:0.5}}",
  bounce: "@keyframes bounce{0%,100%{transform:translateY(-25%);animation-timing-function:cubic-bezier(0.8,0,1,1)}50%{transform:none;animation-timing-function:cubic-bezier(0,0,0.2,1)}}",
  enter: "@keyframes enter{from{opacity:var(--oc-enter-opacity,1);transform:translate3d(var(--oc-enter-translate-x,0),var(--oc-enter-translate-y,0),0) scale3d(var(--oc-enter-scale,1),var(--oc-enter-scale,1),var(--oc-enter-scale,1)) rotate(var(--oc-enter-rotate,0))}}",
  exit: "@keyframes exit{to{opacity:var(--oc-exit-opacity,1);transform:translate3d(var(--oc-exit-translate-x,0),var(--oc-exit-translate-y,0),0) scale3d(var(--oc-exit-scale,1),var(--oc-exit-scale,1),var(--oc-exit-scale,1)) rotate(var(--oc-exit-rotate,0))}}",
};
const ANIMATIONS = {
  spin: "spin 1s linear infinite", ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite", pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", bounce: "bounce 1s infinite",
};

// ---------------------------------------------------------------------------------------------- handler helpers

/** Tokens that only mark an element (no CSS). */
export const MARKERS = /^(group|peer|dark|light|not-prose|prose-invert|container-query|@container\/[\w-]+|group\/[\w-]+|peer\/[\w-]+|theme-[\w-]+)$/;

const num = (v) => isNum(v);
const sp = (u, v = u.value, o = {}) => spacing(v, u.ctx, { neg: u.neg, ...o });
const SIZE_KW = { auto: "auto", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", screen: "100vw", svw: "100svw", lvw: "100lvw", dvw: "100dvw", px: "1px" };

function sizeValue(u, axis, kind) {
  const v = u.value;
  if (kind === "size") return sp(u, v, { keywords: { ...SIZE_KW, screen: undefined, auto: "auto", full: "100%" } });
  const kw = { ...SIZE_KW };
  if (axis === "h") Object.assign(kw, { screen: "100vh", svh: "100svh", lvh: "100lvh", dvh: "100dvh", lh: "1lh" });
  else Object.assign(kw, { svw: "100svw", lvw: "100lvw", dvw: "100dvw" });
  if (axis === "h") { delete kw.svw; delete kw.lvw; delete kw.dvw; }
  if (kind === "min" || kind === "max") {
    if (kind === "max" && CONTAINERS[v] && axis === "w") return `${CONTAINERS[v]}rem`;
    if (kind === "max" && v === "none") return "none";
    if (kind === "max" && v === "prose") return "65ch";
    if (kind === "max" && axis === "w" && /^screen-/.test(v)) return u.ctx.screens[v.slice(7)] || null;
    if (kind === "max" && v === "screen" && axis === "w") return "100vw";
    if (kind === "min") kw.auto = undefined;
    if (kind === "max") kw.auto = undefined;
    if (kind === "min" && v === "0") return "0px";
    if (kind === "max" && v === "0") return "0px";
  }
  if (kind === "w" && CONTAINERS[v] && v !== "full" && !/^\d/.test(v)) return `${CONTAINERS[v]}rem`;
  return sp(u, v, { keywords: kw });
}

const sideProps = (base, sides) => sides.map((s) => (s ? `${base}-${s}` : base));
const SIDE = { t: "top", r: "right", b: "bottom", l: "left", s: "inline-start", e: "inline-end" };

function boxHandler(prop) {
  // m, mx, my, mt … (margin / padding / scroll-margin / scroll-padding)
  return (u, root) => {
    const key = root.slice(prefixLen(prop));
    const v = sp(u, u.value, { keywords: { auto: "auto" }, fractions: false });
    if (v == null) return null;
    if (u.value === "auto" && u.neg) return null;
    const mk = (sides) => sides.map((s) => [s, v]);
    const p = (s) => (s ? `${prop}-${s}` : prop);
    if (key === "") return d(prop, v);
    if (key === "x") return [[`${prop}-inline`, v]];
    if (key === "y") return [[`${prop}-block`, v]];
    if (SIDE[key]) return [[p(SIDE[key]), v]];
    return null;
  };
}
const prefixLen = (prop) => ({ margin: 1, padding: 1, "scroll-margin": 2, "scroll-padding": 2 })[prop];

function insetHandler(prop) {
  return (u) => {
    const v = sp(u, u.value, { keywords: { auto: "auto", full: "100%" } });
    return v == null ? null : d(prop, v);
  };
}

function colorDecl(prop) {
  return (u) => { const c = color(u.value, u.mod, u.ctx); return c == null ? null : d(prop, c); };
}

/** Rule for `from-`, `via-`, `to-` gradient stops. */
function stopHandler(which) {
  return (u) => {
    const a = arb(u.value);
    if (a && (a.type === "length" || a.type === "percentage" || (!a.type && inferType(a.value) === "length"))) return null;
    if (!a && /^\d+%$/.test(u.value)) return null;
    const c = color(u.value, u.mod, u.ctx);
    if (c == null) return null;
    if (which === "via") return [["--oc-via", c], ["--oc-stops", "var(--oc-from, transparent), var(--oc-via), var(--oc-to, transparent)"]];
    return [[`--oc-${which}`, c]];
  };
}
const GRADIENT_DIRS = { t: "to top", tr: "to top right", r: "to right", br: "to bottom right", b: "to bottom", bl: "to bottom left", l: "to left", tl: "to top left" };
const STOPS = "var(--oc-stops, var(--oc-from, transparent), var(--oc-to, transparent))";

function filterHandler(varName, fnName, { backdrop = false, scale = (v) => frac(v), unit = "" } = {}) {
  return (u) => {
    let val;
    const a = arb(u.value);
    if (a) val = a.value;
    else if (u.value === "") val = "";
    else if (num(u.value)) val = scale(u.value) + unit;
    else return null;
    if (u.neg && val) val = negate(val);
    return [[`--oc-${backdrop ? "bd-" : ""}${varName}`, `${fnName}(${val})`], ...filterCompose(backdrop)];
  };
}
const FILTER_VARS = ["blur", "brightness", "contrast", "grayscale", "hue-rotate", "invert", "saturate", "sepia", "drop-shadow"];
const BD_VARS = ["blur", "brightness", "contrast", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia"];
function filterCompose(backdrop) {
  const vars = backdrop ? BD_VARS : FILTER_VARS;
  const pre = backdrop ? "--oc-bd-" : "--oc-";
  const val = vars.map((n) => `var(${pre}${n},)`).join(" ");
  return backdrop ? [["-webkit-backdrop-filter", val], ["backdrop-filter", val]] : [["filter", val]];
}

function ringShadow(width, inset) {
  return [
    [inset ? "--oc-inset-ring-shadow" : "--oc-ring-shadow", `${inset ? "inset " : ""}0 0 0 calc(${width} + var(--oc-ring-offset-width, 0px)) var(${inset ? "--oc-inset-ring-color" : "--oc-ring-color"}, currentColor)`],
    ["box-shadow", "var(--oc-inset-shadow, 0 0 transparent), var(--oc-inset-ring-shadow, 0 0 transparent), var(--oc-ring-offset-shadow, 0 0 transparent), var(--oc-ring-shadow, 0 0 transparent), var(--oc-shadow, 0 0 transparent)"],
  ];
}
const SHADOW_COMPOSE = ["box-shadow", "var(--oc-inset-shadow, 0 0 transparent), var(--oc-inset-ring-shadow, 0 0 transparent), var(--oc-ring-offset-shadow, 0 0 transparent), var(--oc-ring-shadow, 0 0 transparent), var(--oc-shadow, 0 0 transparent)"];

function translate(axis) {
  return (u) => {
    let v = u.value;
    const kw = { full: "100%" };
    const val = spacing(v, u.ctx, { neg: u.neg, keywords: kw });
    if (val == null) return null;
    if (axis === "z") return d("translate", `0 0 ${val}`);
    return [[`--oc-translate-${axis}`, val], ["translate", "var(--oc-translate-x, 0) var(--oc-translate-y, 0)"]];
  };
}
function scaleHandler(axis) {
  return (u) => {
    const a = arb(u.value);
    const v = a ? a.value : num(u.value) ? frac(u.value) : null;
    if (v == null) return null;
    const val = u.neg ? negate(v) : v;
    const out = [];
    if (axis !== "y") out.push(["--oc-scale-x", val]);
    if (axis !== "x") out.push(["--oc-scale-y", val]);
    out.push(["scale", "var(--oc-scale-x, 1) var(--oc-scale-y, 1)"]);
    return out;
  };
}

function lenOrNum(u, unit, allowNeg = true) {
  const a = arb(u.value);
  let v = a ? a.value : num(u.value) ? u.value + unit : null;
  if (v == null) return null;
  return u.neg && allowNeg ? negate(v) : v;
}

/** `border-*`/`ring-*`/`outline-*`/`divide-*` width-or-color resolver. */
function widthOrColor(u, widthProp, colorProp, opts = {}) {
  const v = u.value;
  const a = arb(v);
  const widths = opts.widths || ["0", "1", "2", "4", "8"];
  if (a) {
    const t = a.type || (inferType(a.value) === "color" ? "color" : inferType(a.value) === "length" || inferType(a.value) === "number" ? "length" : null);
    if (t === "color") { const c = color(v, u.mod, u.ctx, { hinted: true }); return c == null ? null : d(colorProp, c); }
    if (t === "length" || t === "line-width" || t === "number") return d(widthProp, a.type === "number" || inferType(a.value) === "number" ? a.value + "px" : a.value);
    const c = color(v, u.mod, u.ctx, { hinted: true });
    return c == null ? null : d(colorProp, c);
  }
  if (widths.includes(v)) return d(widthProp, `${v}px`);
  const c = color(v, u.mod, u.ctx);
  return c == null ? null : d(colorProp, c);
}

// ---------------------------------------------------------------------------------------------- handlers

const H = {};

// spacing
for (const root of ["m", "mx", "my", "mt", "mr", "mb", "ml", "ms", "me"]) H[root] = (u) => boxHandler("margin")(u, root);
for (const root of ["p", "px", "py", "pt", "pr", "pb", "pl", "ps", "pe"]) H[root] = (u) => boxHandler("padding")(u, root);
for (const root of ["scroll-m", "scroll-mx", "scroll-my", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml", "scroll-ms", "scroll-me"]) H[root] = (u) => boxHandler("scroll-margin")(u, root);
for (const root of ["scroll-p", "scroll-px", "scroll-py", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl", "scroll-ps", "scroll-pe"]) H[root] = (u) => boxHandler("scroll-padding")(u, root);

H.gap = (u) => { const v = sp(u, u.value, { fractions: false }); return v == null ? null : d("gap", v); };
H["gap-x"] = (u) => { const v = sp(u, u.value, { fractions: false }); return v == null ? null : d("column-gap", v); };
H["gap-y"] = (u) => { const v = sp(u, u.value, { fractions: false }); return v == null ? null : d("row-gap", v); };
H["space-x"] = (u) => { if (u.value === "reverse") return null; const v = sp(u, u.value, { fractions: false }); return v == null ? null : { decls: d("margin-inline-start", v), tail: " > :not(:first-child)" }; };
H["space-y"] = (u) => { if (u.value === "reverse") return null; const v = sp(u, u.value, { fractions: false }); return v == null ? null : { decls: d("margin-block-start", v), tail: " > :not(:first-child)" }; };

// positioning
H.inset = (u) => { const v = sp(u, u.value, { keywords: { auto: "auto", full: "100%" } }); return v == null ? null : d("inset", v); };
H["inset-x"] = (u) => { const v = sp(u, u.value, { keywords: { auto: "auto", full: "100%" } }); return v == null ? null : d("inset-inline", v); };
H["inset-y"] = (u) => { const v = sp(u, u.value, { keywords: { auto: "auto", full: "100%" } }); return v == null ? null : d("inset-block", v); };
for (const [r, p] of [["top", "top"], ["right", "right"], ["bottom", "bottom"], ["left", "left"], ["start", "inset-inline-start"], ["end", "inset-inline-end"]]) H[r] = insetHandler(p);
H.z = (u) => { const a = arb(u.value); const v = u.value === "auto" ? "auto" : a ? a.value : num(u.value) ? (u.neg ? "-" : "") + u.value : null; return v == null ? null : d("z-index", v); };
H.order = (u) => { const a = arb(u.value); const v = a ? a.value : num(u.value) ? (u.neg ? "-" : "") + u.value : null; return v == null ? null : d("order", v); };

// sizing
H.w = (u) => { const v = sizeValue(u, "w", "w"); return v == null ? null : d("width", v); };
H.h = (u) => { const v = sizeValue(u, "h", "h"); return v == null ? null : d("height", v); };
H.size = (u) => { const v = sizeValue(u, "w", "size"); return v == null ? null : [["width", v], ["height", v]]; };
H["min-w"] = (u) => { const v = sizeValue(u, "w", "min"); return v == null ? null : d("min-width", v); };
H["max-w"] = (u) => { const v = sizeValue(u, "w", "max"); return v == null ? null : d("max-width", v); };
H["min-h"] = (u) => { const v = sizeValue(u, "h", "min"); return v == null ? null : d("min-height", v); };
H["max-h"] = (u) => { const v = sizeValue(u, "h", "max"); return v == null ? null : d("max-height", v); };
H.basis = (u) => { const v = sp(u, u.value, { keywords: { auto: "auto", full: "100%", ...Object.fromEntries(Object.entries(CONTAINERS).map(([k, n]) => [k, `${n}rem`])) } }); return v == null ? null : d("flex-basis", v); };
H.aspect = (u) => { const a = arb(u.value); if (a) return d("aspect-ratio", a.value); const m = u.value.match(/^(\d+)\/(\d+)$/); return m ? d("aspect-ratio", `${m[1]} / ${m[2]}`) : null; };
H.columns = (u) => { const a = arb(u.value); const v = a ? a.value : num(u.value) ? u.value : u.value === "auto" ? "auto" : CONTAINERS[u.value] ? `${CONTAINERS[u.value]}rem` : null; return v == null ? null : d("columns", v); };

// flex / grid
H.flex = (u) => { const a = arb(u.value); if (a) return d("flex", a.value); if (num(u.value)) return d("flex", `${u.value} ${u.value} 0%`); const m = u.value.match(/^(\d+)\/(\d+)$/); return m ? d("flex", `calc(${m[1]} / ${m[2]} * 100%)`) : null; };
H.grow = (u) => { const a = arb(u.value); return a ? d("flex-grow", a.value) : num(u.value) ? d("flex-grow", u.value) : null; };
H.shrink = (u) => { const a = arb(u.value); return a ? d("flex-shrink", a.value) : num(u.value) ? d("flex-shrink", u.value) : null; };
const track = (prop) => (u) => { const a = arb(u.value); if (a) return d(prop, a.value); return num(u.value) && +u.value > 0 ? d(prop, `repeat(${u.value}, minmax(0, 1fr))`) : null; };
H["grid-cols"] = track("grid-template-columns");
H["grid-rows"] = track("grid-template-rows");
const span = (prop) => (u) => { const a = arb(u.value); if (a) return d(prop, a.value); return num(u.value) ? d(prop, `span ${u.value} / span ${u.value}`) : null; };
H["col-span"] = span("grid-column");
H["row-span"] = span("grid-row");
const line = (prop) => (u) => { const a = arb(u.value); const v = a ? a.value : num(u.value) ? (u.neg ? "-" : "") + u.value : null; return v == null ? null : d(prop, v); };
H["col-start"] = line("grid-column-start"); H["col-end"] = line("grid-column-end"); H["row-start"] = line("grid-row-start"); H["row-end"] = line("grid-row-end");
H.col = (u) => { const a = arb(u.value); return a ? d("grid-column", a.value) : num(u.value) ? d("grid-column", (u.neg ? "-" : "") + u.value) : null; };
H.row = (u) => { const a = arb(u.value); return a ? d("grid-row", a.value) : num(u.value) ? d("grid-row", (u.neg ? "-" : "") + u.value) : null; };
H["auto-cols"] = (u) => { const a = arb(u.value); return a ? d("grid-auto-columns", a.value) : null; };
H["auto-rows"] = (u) => { const a = arb(u.value); return a ? d("grid-auto-rows", a.value) : null; };

// typography
H.text = (u) => {
  const v = u.value;
  const a = arb(v);
  const sizeDecl = (size, lh) => {
    const out = [["font-size", size]];
    const m = u.mod;
    if (m) {
      const ma = arb(m);
      out.push(["line-height", ma ? ma.value : LEADING[m] || (num(m) ? rem(+m) : m)]);
    } else if (lh) out.push(["line-height", lh]);
    return out;
  };
  if (a) {
    const t = a.type || inferType(a.value);
    if (t === "length" || t === "percentage" || t === "absolute-size" || t === "relative-size") return sizeDecl(a.value);
    if (t === "color") { const c = color(v, u.mod, u.ctx, { hinted: true }); return c == null ? null : d("color", c); }
    if (a.type === null && /^var\(/.test(a.value)) { const c = color(v, u.mod, u.ctx, { hinted: true }); return d("color", c); }
    if (a.type === "number" || t === "number") return sizeDecl(a.value + "px");
    return null;
  }
  if (u.ctx.hasTheme(`--text-${v}`)) return sizeDecl(`var(--text-${v})`, u.ctx.hasTheme(`--text-${v}--line-height`) ? `var(--text-${v}--line-height)` : undefined);
  if (FONT_SIZES[v]) return sizeDecl(...FONT_SIZES[v]);
  const c = color(v, u.mod, u.ctx);
  return c == null ? null : d("color", c);
};
H.font = (u) => {
  const v = u.value; const a = arb(v);
  if (a) {
    if (a.type === "family-name" || /[a-z]/i.test(a.value) && !/^\d/.test(a.value) && a.type !== "number") return d("font-family", a.value);
    return d("font-weight", a.value);
  }
  if (WEIGHTS[v] != null) return d("font-weight", u.ctx.hasTheme(`--font-weight-${v}`) ? `var(--font-weight-${v})` : String(WEIGHTS[v]));
  if (u.ctx.hasTheme(`--font-${v}`)) return d("font-family", `var(--font-${v})`);
  if (FAMILIES[v]) return d("font-family", FAMILIES[v]);
  return null;
};
H.leading = (u) => {
  const a = arb(u.value); if (a) return d("line-height", a.value);
  if (LEADING[u.value]) return d("line-height", LEADING[u.value]);
  const v = sp(u, u.value, { fractions: false }); return v == null ? null : d("line-height", v);
};
H.tracking = (u) => { const a = arb(u.value); const v = a ? a.value : TRACKING[u.value]; return v == null ? null : d("letter-spacing", u.neg ? negate(v) : v); };
H.indent = (u) => { const v = sp(u, u.value, { fractions: false }); return v == null ? null : d("text-indent", v); };
H["line-clamp"] = (u) => {
  const a = arb(u.value); const n = a ? a.value : num(u.value) ? u.value : null;
  return n == null ? null : [["overflow", "hidden"], ["display", "-webkit-box"], ["-webkit-box-orient", "vertical"], ["-webkit-line-clamp", n], ["line-clamp", n]];
};
H["underline-offset"] = (u) => { const v = lenOrNum(u, "px"); return v == null ? null : d("text-underline-offset", v); };
H.decoration = (u) => {
  const a = arb(u.value);
  if (num(u.value)) return d("text-decoration-thickness", `${u.value}px`);
  if (a && (a.type === "length" || inferType(a.value) === "length")) return d("text-decoration-thickness", a.value);
  const c = color(u.value, u.mod, u.ctx); return c == null ? null : d("text-decoration-color", c);
};

// colors
H.bg = (u) => {
  const v = u.value; const a = arb(v);
  if (a) {
    const t = a.type || inferType(a.value);
    if (t === "image" || a.type === "url") return d("background-image", a.value);
    if (t === "length" || t === "size" || t === "bg-size" || t === "percentage") return d(a.type === "position" ? "background-position" : "background-size", a.value);
    if (t === "position") return d("background-position", a.value);
    const c = color(v, u.mod, u.ctx, { hinted: true }); return c == null ? null : d("background-color", c);
  }
  const lin = v.match(/^(?:gradient|linear)-to-(t|tr|r|br|b|bl|l|tl)$/);
  if (lin) return [["background-image", `linear-gradient(${GRADIENT_DIRS[lin[1]]}, ${STOPS})`]];
  const ang = v.match(/^linear-(\d+)$/);
  if (ang) return [["background-image", `linear-gradient(${u.neg ? "-" : ""}${ang[1]}deg, ${STOPS})`]];
  if (v === "radial") return d("background-image", `radial-gradient(in oklab, ${STOPS})`);
  if (v === "conic") return d("background-image", `conic-gradient(from 0deg, ${STOPS})`);
  const c = color(v, u.mod, u.ctx); return c == null ? null : d("background-color", c);
};
H.from = stopHandler("from"); H.via = stopHandler("via"); H.to = stopHandler("to");
H.fill = colorDecl("fill");
H.stroke = (u) => {
  const a = arb(u.value);
  if (num(u.value)) return d("stroke-width", u.value);
  if (a && (a.type === "length" || a.type === "number" || inferType(a.value) === "length")) return d("stroke-width", a.value);
  const c = color(u.value, u.mod, u.ctx); return c == null ? null : d("stroke", c);
};
H.accent = colorDecl("accent-color");
H.caret = colorDecl("caret-color");
H.placeholder = (u) => { const c = color(u.value, u.mod, u.ctx); return c == null ? null : { decls: d("color", c), tail: "::placeholder" }; };

// borders & radius
const borderSides = { "": "", x: "-inline", y: "-block", t: "-top", r: "-right", b: "-bottom", l: "-left", s: "-inline-start", e: "-inline-end" };
for (const [k, side] of Object.entries(borderSides)) {
  const root = k ? `border-${k}` : "border";
  H[root] = (u) => {
    if (u.value === "") return d(`border${side}-width`, "1px");
    return widthOrColor(u, `border${side}-width`, `border${side}-color`);
  };
}
H["border-spacing"] = (u) => { const v = sp(u, u.value, { fractions: false }); return v == null ? null : d("border-spacing", v); };
const divide = (axis) => (u) => {
  if (u.value === "" ) return { decls: [[`border-${axis}-width`, "1px"], ["border-style", "solid"]], tail: " > :not(:first-child)" };
  if (u.value === "reverse") return null;
  const r = widthOrColor(u, `border-${axis}-width`, "border-color");
  if (!r) return null;
  return { decls: r, tail: " > :not(:first-child)" };
};
H["divide-x"] = divide("inline-start");
H["divide-y"] = divide("block-start");
H.divide = (u) => { const c = color(u.value, u.mod, u.ctx); return c == null ? null : { decls: d("border-color", c), tail: " > :not(:first-child)" }; };

const radiusCorners = { "": ["border-radius"], t: ["border-top-left-radius", "border-top-right-radius"], r: ["border-top-right-radius", "border-bottom-right-radius"], b: ["border-bottom-right-radius", "border-bottom-left-radius"], l: ["border-top-left-radius", "border-bottom-left-radius"],
  tl: ["border-top-left-radius"], tr: ["border-top-right-radius"], br: ["border-bottom-right-radius"], bl: ["border-bottom-left-radius"],
  s: ["border-start-start-radius", "border-end-start-radius"], e: ["border-start-end-radius", "border-end-end-radius"], ss: ["border-start-start-radius"], se: ["border-start-end-radius"], ee: ["border-end-end-radius"], es: ["border-end-start-radius"] };
for (const [k, props] of Object.entries(radiusCorners)) {
  H[k ? `rounded-${k}` : "rounded"] = (u) => {
    const v = u.value || "DEFAULT";
    const a = arb(v);
    let val;
    if (a) val = a.value;
    else if (u.ctx.hasTheme(`--radius-${v}`) && v !== "DEFAULT") val = `var(--radius-${v})`;
    else if (v === "DEFAULT" && u.ctx.hasTheme("--radius") && false) val = "var(--radius)";
    else if (!u.ctx.v4 && RADIUS_V3[v]) val = RADIUS_V3[v];
    else if (RADIUS[v]) val = RADIUS[v];
    else return null;
    if (val === "calc(infinity * 1px)") val = "9999px";
    return props.map((p) => [p, val]);
  };
}

// effects
H.opacity = (u) => { const a = arb(u.value); const v = a ? a.value : num(u.value) ? frac(u.value) : null; return v == null ? null : d("opacity", v); };
H.shadow = (u) => {
  const v = u.value || "DEFAULT"; const a = arb(v);
  if (a) {
    if (a.type === "color" || (!a.type && inferType(a.value) === "color")) { const c = color(v, u.mod, u.ctx, { hinted: true }); return d("--oc-shadow-color", c); }
    const val = a.value;
    return [["--oc-shadow", val], SHADOW_COMPOSE];
  }
  if (u.ctx.hasTheme(`--shadow-${v}`) && v !== "DEFAULT") return [["--oc-shadow", `var(--shadow-${v})`], SHADOW_COMPOSE];
  const known = v === "none" || v === "inner" || Object.hasOwn(SHADOWS, v) || v === "3xl";
  if (known && v !== "3xl") { const s = SHADOW_NAMES(v, u.ctx); if (s) return [["--oc-shadow", s], SHADOW_COMPOSE]; }
  const c = color(v, u.mod, u.ctx); return c == null ? null : d("--oc-shadow-color", c);
};
H["inset-shadow"] = (u) => {
  const v = u.value || "sm"; const a = arb(v);
  if (a) return [["--oc-inset-shadow", `inset ${a.value}`], SHADOW_COMPOSE];
  const map = { "2xs": "inset 0 1px 0 0", xs: "inset 0 1px 1px 0", sm: "inset 0 2px 4px 0" };
  if (map[v]) return [["--oc-inset-shadow", `${map[v]} oklch(from var(--oc-shadow-color, ${BLACK}) l c h / 0.1)`], SHADOW_COMPOSE];
  const c = color(v, u.mod, u.ctx); return c == null ? null : d("--oc-shadow-color", c);
};
H.ring = (u) => {
  const v = u.value;
  if (v === "") return ringShadow(u.ctx.v4 ? "1px" : "3px");
  if (v === "inset") return [["--oc-ring-inset", "inset"]];
  if (num(u.value)) return ringShadow(`${u.value}px`);
  const a = arb(v); if (a && (a.type === "length" || inferType(a.value) === "length")) return ringShadow(a.value);
  const c = color(v, u.mod, u.ctx); return c == null ? null : d("--oc-ring-color", c);
};
H["inset-ring"] = (u) => {
  if (u.value === "") return ringShadow("1px", true);
  if (num(u.value)) return ringShadow(`${u.value}px`, true);
  const c = color(u.value, u.mod, u.ctx); return c == null ? null : d("--oc-inset-ring-color", c);
};
H["ring-offset"] = (u) => {
  if (num(u.value)) return [["--oc-ring-offset-width", `${u.value}px`], ["--oc-ring-offset-shadow", "0 0 0 var(--oc-ring-offset-width) var(--oc-ring-offset-color, var(--color-white-100))"]];
  const c = color(u.value, u.mod, u.ctx); return c == null ? null : d("--oc-ring-offset-color", c);
};
H.outline = (u) => {
  if (u.value === "") return [["outline-style", "solid"], ["outline-width", "1px"]];
  return widthOrColor(u, "outline-width", "outline-color");
};
H["outline-offset"] = (u) => { const v = lenOrNum(u, "px"); return v == null ? null : d("outline-offset", v); };

// transitions
H.duration = (u) => { const a = arb(u.value); const v = a ? a.value : num(u.value) ? `${u.value}ms` : null; return v == null ? null : [["--oc-duration", v], ["transition-duration", v]]; };
H.delay = (u) => { const a = arb(u.value); const v = a ? a.value : num(u.value) ? `${u.value}ms` : null; return v == null ? null : [["transition-delay", v], ["animation-delay", v]]; };
H.ease = (u) => { const a = arb(u.value); const v = a ? a.value : EASE[u.value]; return v == null ? null : d("transition-timing-function", v); };
H.animate = (u) => {
  const a = arb(u.value); if (a) return d("animation", a.value);
  if (ANIMATIONS[u.value]) return { decls: d("animation", ANIMATIONS[u.value]), keyframes: [u.value] };
  return null;
};

// transforms
H["translate-x"] = translate("x"); H["translate-y"] = translate("y"); H["translate-z"] = translate("z");
H.translate = (u) => { const v = spacing(u.value, u.ctx, { neg: u.neg, keywords: { full: "100%" } }); return v == null ? null : [["--oc-translate-x", v], ["--oc-translate-y", v], ["translate", "var(--oc-translate-x, 0) var(--oc-translate-y, 0)"]]; };
H.rotate = (u) => { const v = lenOrNum(u, "deg"); return v == null ? null : d("rotate", v); };
H["rotate-x"] = (u) => { const v = lenOrNum(u, "deg"); return v == null ? null : d("transform", `rotateX(${v})`); };
H["rotate-y"] = (u) => { const v = lenOrNum(u, "deg"); return v == null ? null : d("transform", `rotateY(${v})`); };
H.scale = scaleHandler(""); H["scale-x"] = scaleHandler("x"); H["scale-y"] = scaleHandler("y");
H["skew-x"] = (u) => { const v = lenOrNum(u, "deg"); return v == null ? null : d("transform", `skewX(${v})`); };
H["skew-y"] = (u) => { const v = lenOrNum(u, "deg"); return v == null ? null : d("transform", `skewY(${v})`); };
H.skew = (u) => { const v = lenOrNum(u, "deg"); return v == null ? null : d("transform", `skewX(${v}) skewY(${v})`); };
H.origin = (u) => { const a = arb(u.value); return a ? d("transform-origin", a.value) : null; };
H.perspective = (u) => { const a = arb(u.value); const m = { none: "none", dramatic: "100px", near: "300px", normal: "500px", midrange: "800px", distant: "1200px" }; const v = a ? a.value : m[u.value]; return v == null ? null : d("perspective", v); };

// filters
H.blur = (u) => {
  const v = u.value || "DEFAULT"; const a = arb(v);
  let val = a ? a.value : u.ctx.v4 ? BLUR[v] : BLUR_V3[v];
  if (v === "none") val = "";
  if (val == null) return null;
  return [["--oc-blur", val ? `blur(${val})` : "blur(0)"], ...filterCompose(false)];
};
H.brightness = filterHandler("brightness", "brightness");
H.contrast = filterHandler("contrast", "contrast");
H.grayscale = (u) => filterHandler("grayscale", "grayscale", { scale: (v) => frac(v) })(u.value === "" ? { ...u, value: "100" } : u);
H.invert = (u) => filterHandler("invert", "invert")(u.value === "" ? { ...u, value: "100" } : u);
H.sepia = (u) => filterHandler("sepia", "sepia")(u.value === "" ? { ...u, value: "100" } : u);
H.saturate = filterHandler("saturate", "saturate");
H["hue-rotate"] = filterHandler("hue-rotate", "hue-rotate", { scale: (v) => v, unit: "deg" });
H["drop-shadow"] = (u) => {
  const v = u.value || "DEFAULT"; const a = arb(v);
  const map = { xs: "0 1px 1px", sm: "0 1px 2px", DEFAULT: "0 1px 2px", md: "0 3px 3px", lg: "0 4px 4px", xl: "0 9px 7px", "2xl": "0 25px 25px" };
  const alpha = { xs: 0.05, sm: 0.15, DEFAULT: 0.1, md: 0.12, lg: 0.15, xl: 0.1, "2xl": 0.15 };
  let val;
  if (a) val = a.value; else if (map[v]) val = `${map[v]} oklch(from var(--oc-shadow-color, ${BLACK}) l c h / ${alpha[v]})`; else if (v === "none") val = "0 0 transparent"; else return null;
  return [["--oc-drop-shadow", `drop-shadow(${val})`], ...filterCompose(false)];
};
H["backdrop-blur"] = (u) => {
  const v = u.value || "DEFAULT"; const a = arb(v);
  const val = a ? a.value : u.ctx.v4 ? BLUR[v] : BLUR_V3[v];
  if (val == null) return null;
  return [["--oc-bd-blur", `blur(${val || 0})`], ...filterCompose(true)];
};
H["backdrop-brightness"] = filterHandler("brightness", "brightness", { backdrop: true });
H["backdrop-contrast"] = filterHandler("contrast", "contrast", { backdrop: true });
H["backdrop-grayscale"] = (u) => filterHandler("grayscale", "grayscale", { backdrop: true })(u.value === "" ? { ...u, value: "100" } : u);
H["backdrop-invert"] = (u) => filterHandler("invert", "invert", { backdrop: true })(u.value === "" ? { ...u, value: "100" } : u);
H["backdrop-opacity"] = filterHandler("opacity", "opacity", { backdrop: true });
H["backdrop-saturate"] = filterHandler("saturate", "saturate", { backdrop: true });
H["backdrop-sepia"] = (u) => filterHandler("sepia", "sepia", { backdrop: true })(u.value === "" ? { ...u, value: "100" } : u);
H["backdrop-hue-rotate"] = filterHandler("hue-rotate", "hue-rotate", { backdrop: true, scale: (v) => v, unit: "deg" });

// misc
H.cursor = (u) => { const a = arb(u.value); const v = a ? a.value : /^[a-z-]+$/.test(u.value) ? u.value : null; return v == null ? null : d("cursor", v); };
H.content = (u) => { const a = arb(u.value); return a ? [["--oc-content", a.value], ["content", "var(--oc-content)"]] : null; };
H.will = (u) => { const a = arb(u.value); return a ? d("will-change", a.value) : null; };

// transition-[color,background-color] / text-shadow / wrap / bg-size
H.transition = (u) => {
  const a = arb(u.value);
  if (!a) return null;
  return [["transition-property", a.value], ["transition-timing-function", "cubic-bezier(0.4, 0, 0.2, 1)"], ["transition-duration", "0.15s"]];
};
const TEXT_SHADOWS = { "2xs": "0px 1px 0px 0.15", xs: "0px 1px 1px 0.2", sm: "0px 1px 0px 0.075, 0px 1px 1px 0.075, 0px 2px 2px 0.075", md: "0px 1px 1px 0.1, 0px 1px 2px 0.1, 0px 2px 4px 0.1", lg: "0px 1px 2px 0.1, 0px 3px 2px 0.1, 0px 4px 8px 0.1" };
H["text-shadow"] = (u) => {
  const a = arb(u.value);
  if (a) return d("text-shadow", a.value);
  if (TEXT_SHADOWS[u.value]) {
    const val = TEXT_SHADOWS[u.value].split(/,\s*/).map((p) => { const parts = p.split(" "); const alpha = parts.pop(); return `${parts.join(" ")} oklch(from var(--oc-shadow-color, ${BLACK}) l c h / ${alpha})`; }).join(", ");
    return d("text-shadow", val);
  }
  const c = color(u.value, u.mod, u.ctx); return c == null ? null : d("--oc-shadow-color", c);
};
S["wrap-break-word"] = decls("overflow-wrap:break-word");
S["wrap-anywhere"] = decls("overflow-wrap:anywhere");
S["wrap-normal"] = decls("overflow-wrap:normal");
H["bg-size"] = (u) => { const a = arb(u.value); return a ? d("background-size", a.value) : null; };
H["bg-position"] = (u) => { const a = arb(u.value); return a ? d("background-position", a.value) : null; };

// tailwindcss-animate plugin
const dirs = { top: ["y", -1], bottom: ["y", 1], left: ["x", -1], right: ["x", 1], start: ["x", -1], end: ["x", 1] };
H["fade-in"] = (u) => { const v = u.value === "" ? 0 : num(u.value) ? frac(u.value) : null; return v == null ? null : d("--oc-enter-opacity", String(v)); };
H["fade-out"] = (u) => { const v = u.value === "" ? 0 : num(u.value) ? frac(u.value) : null; return v == null ? null : d("--oc-exit-opacity", String(v)); };
H["zoom-in"] = (u) => { const v = u.value === "" ? 0 : num(u.value) ? frac(u.value) : null; return v == null ? null : d("--oc-enter-scale", String(v)); };
H["zoom-out"] = (u) => { const v = u.value === "" ? 0 : num(u.value) ? frac(u.value) : null; return v == null ? null : d("--oc-exit-scale", String(v)); };
H["spin-in"] = (u) => { const v = lenOrNum(u, "deg"); return v == null ? null : d("--oc-enter-rotate", v); };
H["spin-out"] = (u) => { const v = lenOrNum(u, "deg"); return v == null ? null : d("--oc-exit-rotate", v); };
H["slide-in-from"] = (u) => slide(u, "enter");
H["slide-out-to"] = (u) => slide(u, "exit");
function slide(u, kind) {
  const [dir, rest] = [u.value.split("-")[0], u.value.split("-").slice(1).join("-")];
  const [axis, sign] = dirs[dir] || [];
  if (!axis) return null;
  const amount = rest === "" ? "100%" : rest === "full" ? "100%" : spacing(rest, u.ctx, {});
  if (amount == null) return null;
  return d(`--oc-${kind}-translate-${axis}`, sign < 0 ? negate(amount) : amount);
}

export { S as STATIC, H as HANDLERS, TRANSITION_ALL };
