// File: packages/migrate/src/bootstrap/rules.mjs
// Knowledge about Bootstrap 3, 4 and 5 class names: the CSS declarations of each utility (matched against the
// OmniaCSS index, so names never matter), the OmniaUI component for each component class, and the classes that
// need JavaScript or a manual step.
// Map: breakpoints -> colors -> spacing/value scales -> utility(decls) -> components -> manual hints
// Author: Serge Cools | Framework: OmniaCSS

/** Bootstrap breakpoints in px (min-width). In Bootstrap 3, `xs` is the base (no media query). */
export const BREAKPOINTS = {
  3: { xs: 0, sm: 768, md: 992, lg: 1200 },
  4: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
  5: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 },
};

/** Container max-width per breakpoint (px). */
export const CONTAINERS = {
  3: { sm: 750, md: 970, lg: 1170 },
  4: { sm: 540, md: 720, lg: 960, xl: 1140 },
  5: { sm: 540, md: 720, lg: 960, xl: 1140, xxl: 1320 },
};

/** OmniaCSS viewport breakpoints in px (packages/core/src/variants.mjs: 36rem, 50rem, 64rem, 80rem, 96rem). */
export const OMNIA_BREAKPOINTS = { sm: 576, md: 800, lg: 1024, xl: 1280, "2xl": 1536 };

/**
 * Bootstrap theme colors -> nearest Omnia palette token (OKLab distance against the Omnia palette in oc-colors.css,
 * computed once from the default Bootstrap hex values). White and black use the exact Omnia tokens.
 */
export const COLORS = {
  5: {
    primary: "blue-30", secondary: "twilightblue-10", success: "green-50", danger: "brown-30", warning: "orange-30",
    info: "skycyan-60", light: "snow-100", dark: "shallowblue-40", body: "shallowblue-40", muted: "twilightblue-10",
    white: "white-50", black: "black-50", border: "snow-60",
  },
  3: {
    primary: "skycyan-95", secondary: "twilightblue-10", success: "green-10", danger: "brown-20", warning: "orange-50",
    info: "skycyan-60", light: "snow-100", dark: "shallowblue-40", body: "shallowblue-40", muted: "twilightblue-10",
    white: "white-50", black: "black-50", border: "snow-60",
  },
};
COLORS[4] = COLORS[5];

const SPACE = { 0: "0", 1: "0.25rem", 2: "0.5rem", 3: "1rem", 4: "1.5rem", 5: "3rem", auto: "auto" };
const SIDES = {
  "": ["margin"], t: ["margin-top"], b: ["margin-bottom"], s: ["margin-left"], e: ["margin-right"], l: ["margin-left"], r: ["margin-right"],
  x: ["margin-left", "margin-right"], y: ["margin-top", "margin-bottom"],
};
const DISPLAY = ["none", "inline", "inline-block", "block", "grid", "inline-grid", "table", "table-row", "table-cell", "flex", "inline-flex"];
const JUSTIFY = { start: "flex-start", end: "flex-end", center: "center", between: "space-between", around: "space-around", evenly: "space-evenly" };
const ALIGN = { start: "flex-start", end: "flex-end", center: "center", baseline: "baseline", stretch: "stretch" };
const WEIGHT = { light: 300, lighter: "lighter", normal: 400, medium: 500, semibold: 600, bold: 700, bolder: "bolder" };
const FS = { 1: "2.5rem", 2: "2rem", 3: "1.75rem", 4: "1.5rem", 5: "1.25rem", 6: "1rem" };
const ROUNDED = { 5: { "": "0.375rem", 0: "0", 1: "0.25rem", 2: "0.375rem", 3: "0.5rem", 4: "1rem", 5: "2rem", circle: "50%", pill: "50rem" }, 3: { "": "0.25rem", 0: "0", circle: "50%", pill: "50rem" } };
const RATIO = { "1x1": "1 / 1", "4x3": "4 / 3", "16x9": "16 / 9", "21x9": "21 / 9" };

const d = (...pairs) => [pairs.map(([p, v]) => `${p}:${v}`)];
const one = (p, v) => d([p, v]);

/**
 * CSS declarations of a Bootstrap utility without its breakpoint infix.
 * Returns a list of declaration groups: each group must map to one OmniaCSS class (the result is one class per group).
 * @param {string} name e.g. "mt-3", "d-none", "text-muted"
 * @param {3|4|5} v Bootstrap major version
 * @returns {string[][] | null}
 */
export function utilityDecls(name, v) {
  let m;
  const c = COLORS[v];
  // spacing: m-3, mt-n1, px-2, ms-auto, ml-auto (v4), gap-3, row-gap-2
  if ((m = name.match(/^([mp])([tbselrxy]?)-(n?)([0-5]|auto)$/))) {
    const [, mp, side, neg, val] = m;
    if (mp === "p" && (val === "auto" || neg)) return null;
    if ((side === "s" || side === "e") && v < 5) return null;
    if ((side === "l" || side === "r") && v >= 5) return null;
    const value = neg ? `-${SPACE[val]}` : SPACE[val];
    return [SIDES[side].map((p) => `${mp === "p" ? p.replace("margin", "padding") : p}:${value}`)];
  }
  if ((m = name.match(/^(gap|row-gap|column-gap)-([0-5])$/))) return one(m[1], SPACE[m[2]]);
  if ((m = name.match(/^d-(.+)$/)) && DISPLAY.includes(m[1])) return one("display", m[1]);
  // flex
  if ((m = name.match(/^flex-(row|row-reverse|column|column-reverse)$/))) return one("flex-direction", m[1]);
  if ((m = name.match(/^flex-(wrap|nowrap|wrap-reverse)$/))) return one("flex-wrap", m[1]);
  if (name === "flex-fill") return one("flex", "1 1 auto");
  if ((m = name.match(/^flex-(grow|shrink)-([01])$/))) return one(`flex-${m[1]}`, m[2]);
  if ((m = name.match(/^justify-content-(.+)$/)) && JUSTIFY[m[1]]) return one("justify-content", JUSTIFY[m[1]]);
  if ((m = name.match(/^align-(items|self|content)-(.+)$/))) {
    const val = m[1] === "content" ? { ...ALIGN, between: "space-between", around: "space-around" }[m[2]] : { ...ALIGN, auto: "auto" }[m[2]];
    return val ? one(`align-${m[1]}`, val) : null;
  }
  if ((m = name.match(/^order-([0-5]|first|last)$/))) return one("order", { first: -1, last: 6 }[m[1]] ?? m[1]);
  // text
  if ((m = name.match(/^text-(start|end|left|right|center|justify)$/))) return one("text-align", { start: "left", end: "right" }[m[1]] ?? m[1]);
  if ((m = name.match(/^text-(lowercase|uppercase|capitalize)$/))) return one("text-transform", m[1]);
  if (name === "text-nowrap") return one("white-space", "nowrap");
  if (name === "text-wrap") return one("white-space", "normal");
  if (name === "text-truncate") return d(["overflow", "hidden"], ["text-overflow", "ellipsis"], ["white-space", "nowrap"]);
  if (name === "text-break") return one("overflow-wrap", "break-word");
  if ((m = name.match(/^text-decoration-(none|underline|line-through)$/))) return one("text-decoration", m[1]);
  if ((m = name.match(/^(?:fw|font-weight)-(.+)$/)) && WEIGHT[m[1]]) return one("font-weight", WEIGHT[m[1]]);
  if ((m = name.match(/^(?:fst|font)-(italic|normal)$/))) return one("font-style", m[1]);
  if ((m = name.match(/^fs-([1-6])$/))) return one("font-size", FS[m[1]]);
  if ((m = name.match(/^lh-(1|sm|base|lg)$/))) return one("line-height", { 1: 1, sm: 1.25, base: 1.5, lg: 2 }[m[1]]);
  // colors: text-*, bg-*, border-* (theme names -> Omnia tokens)
  if ((m = name.match(/^text-(.+)$/)) && c[m[1]] && m[1] !== "border") return one("color", `var(--color-${c[m[1]]})`);
  if ((m = name.match(/^bg-(.+)$/)) && c[m[1]] && !["muted", "border"].includes(m[1])) return one("background-color", `var(--color-${c[m[1]]})`);
  if (name === "bg-transparent") return one("background-color", "transparent");
  // borders
  if (name === "border") return [["border-width:1px"], ["border-style:solid"], [`border-color:var(--color-${c.border})`]];
  if (name === "border-0") return one("border-width", "0");
  if ((m = name.match(/^border-(top|bottom|start|end|left|right)$/))) {
    const side = { start: "left", end: "right" }[m[1]] ?? m[1];
    return [[`border-${side}-width:1px`], [`border-${side}-style:solid`], [`border-${side}-color:var(--color-${c.border})`]];
  }
  if ((m = name.match(/^border-([1-5])$/))) return one("border-width", `${m[1]}px`);
  if ((m = name.match(/^border-(.+)$/)) && c[m[1]] && m[1] !== "border") return one("border-color", `var(--color-${c[m[1]]})`);
  if ((m = name.match(/^rounded(?:-(.+))?$/))) {
    const r = (ROUNDED[v] || ROUNDED[5])[m[1] ?? ""] ?? ROUNDED[5][m[1] ?? ""];
    return r ? one("border-radius", r) : null;
  }
  // sizing
  if ((m = name.match(/^([wh])-(25|50|75|100|auto)$/))) return one(m[1] === "w" ? "width" : "height", m[2] === "auto" ? "auto" : `${m[2]}%`);
  if (name === "mw-100") return one("max-width", "100%");
  if (name === "mh-100") return one("max-height", "100%");
  if (name === "vw-100") return one("width", "100vw");
  if (name === "vh-100") return one("height", "100vh");
  if (name === "min-vw-100") return one("min-width", "100vw");
  if (name === "min-vh-100") return one("min-height", "100vh");
  // position
  if ((m = name.match(/^position-(static|relative|absolute|fixed|sticky)$/))) return one("position", m[1]);
  if ((m = name.match(/^(top|bottom|start|end)-(0|50|100)$/))) return one({ start: "left", end: "right" }[m[1]] ?? m[1], m[2] === "0" ? "0" : `${m[2]}%`);
  if (name === "fixed-top") return [["position:fixed"], ["top:0"], ["left:0"], ["right:0"], ["z-index:1030"]];
  if (name === "sticky-top") return [["position:sticky"], ["top:0"], ["z-index:1020"]];
  // overflow, visibility, opacity, float, interaction
  if ((m = name.match(/^overflow-(x-|y-)?(auto|hidden|visible|scroll)$/))) return one(`overflow${m[1] ? "-" + m[1][0] : ""}`, m[2]);
  if (name === "visible") return one("visibility", "visible");
  if (name === "invisible") return one("visibility", "hidden");
  if ((m = name.match(/^opacity-(0|25|50|75|100)$/))) return one("opacity", +m[1] / 100);
  if ((m = name.match(/^(?:float|pull)-(start|end|left|right|none)$/))) return one("float", { start: "left", end: "right" }[m[1]] ?? m[1]);
  if ((m = name.match(/^user-select-(all|auto|none)$/))) return one("user-select", m[1]);
  if ((m = name.match(/^pe-(none|auto)$/))) return one("pointer-events", m[1]);
  if ((m = name.match(/^object-fit-(contain|cover|fill|scale|none)$/))) return one("object-fit", m[1] === "scale" ? "scale-down" : m[1]);
  if ((m = name.match(/^align-(baseline|top|middle|bottom|text-top|text-bottom)$/))) return one("vertical-align", m[1]);
  if ((m = name.match(/^z-(n1|0|1|2|3)$/))) return one("z-index", m[1] === "n1" ? -1 : m[1]);
  if ((m = name.match(/^ratio-(\d+x\d+)$/)) && RATIO[m[1]]) return one("aspect-ratio", RATIO[m[1]]);
  if (name === "img-fluid" || name === "img-responsive") return [["max-width:100%"], ["height:auto"]];
  if (name === "center-block") return [["display:block"], ["margin-left:auto", "margin-right:auto"]];
  if (name === "shadow-none") return one("box-shadow", "none");
  return null;
}

/** Classes that map by name (same intent, OmniaCSS values): shadows, screen-reader helpers. */
export const RENAMES = {
  "shadow-sm": "shadow-sm", shadow: "shadow-md", "shadow-lg": "shadow-lg",
  "visually-hidden": "sr-only", "sr-only": "sr-only", "visually-hidden-focusable": "sr-only focus:not-sr-only", "sr-only-focusable": "sr-only focus:not-sr-only",
  hidden: "d-none", "img-circle": "round-full", "img-rounded": "round-2",
};

/** Bootstrap component class -> OmniaUI class(es). An empty string removes the class (its role is covered elsewhere). */
export const COMPONENTS = {
  btn: "oc-btn", "btn-primary": "", "btn-secondary": "oc-btn--secondary", "btn-success": "oc-btn--success", "btn-danger": "oc-btn--destructive",
  "btn-warning": "oc-btn--secondary", "btn-info": "oc-btn--secondary", "btn-light": "oc-btn--secondary", "btn-dark": "oc-btn--secondary",
  "btn-default": "oc-btn--outline", "btn-link": "oc-btn--link", "btn-sm": "oc-btn--sm", "btn-xs": "oc-btn--xs", "btn-lg": "oc-btn--lg",
  "btn-block": "w-full", "btn-group": "oc-btn-group",
  card: "oc-card", "card-body": "oc-card-content", "card-header": "oc-card-header", "card-footer": "oc-card-footer", "card-title": "oc-card-title",
  "card-text": "oc-card-text", "card-subtitle": "oc-card-description", "card-link": "oc-card-link",
  panel: "oc-card", "panel-heading": "oc-card-header", "panel-body": "oc-card-content", "panel-footer": "oc-card-footer", "panel-title": "oc-card-title",
  "panel-default": "", "panel-primary": "", "panel-success": "", "panel-info": "", "panel-warning": "", "panel-danger": "", well: "oc-card",
  alert: "oc-alert", "alert-success": "oc-alert--success", "alert-info": "oc-alert--info", "alert-warning": "oc-alert--warning", "alert-danger": "oc-alert--danger",
  "alert-primary": "oc-alert--info", "alert-secondary": "oc-alert--info", "alert-light": "oc-alert--info", "alert-dark": "oc-alert--info", "alert-heading": "oc-alert-title",
  badge: "oc-badge", "badge-primary": "", "badge-secondary": "oc-badge--secondary", "badge-success": "oc-badge--success", "badge-danger": "oc-badge--destructive",
  "badge-warning": "oc-badge--warning", "badge-info": "oc-badge--info", "badge-light": "oc-badge--outline", "badge-dark": "oc-badge--secondary",
  "badge-pill": "round-full", "rounded-pill": "round-full",
  "label-default": "oc-badge oc-badge--secondary", "label-primary": "oc-badge", "label-success": "oc-badge oc-badge--success", "label-info": "oc-badge oc-badge--info",
  "label-warning": "oc-badge oc-badge--warning", "label-danger": "oc-badge oc-badge--destructive",
  "form-control": "oc-input", "form-select": "oc-select", "custom-select": "oc-select", "form-label": "oc-label", "control-label": "oc-label",
  "form-group": "oc-form-group", "form-text": "oc-field-description", "help-block": "oc-field-description", "is-invalid": "oc-input--error",
  "invalid-feedback": "oc-field-error", "form-check-input": "oc-checkbox", "form-check-label": "oc-label oc-label--inline",
  "input-group": "oc-input-group", "input-group-text": "oc-input-addon", "input-group-addon": "oc-input-addon",
  table: "oc-table", "table-striped": "oc-table--striped", "table-borderless": "oc-table--borderless", "table-sm": "oc-table--compact",
  "table-condensed": "oc-table--compact", "table-responsive": "oc-table-wrap",
  breadcrumb: "oc-breadcrumb", "breadcrumb-item": "oc-breadcrumb-item",
  pagination: "oc-pagination", "page-link": "oc-pagination-item", "page-item": "",
  progress: "oc-progress", "progress-bar": "oc-progress-bar", "spinner-border": "oc-spinner", "spinner-grow": "oc-spinner", "spinner-border-sm": "oc-spinner--sm",
  jumbotron: "oc-hero",
};

/** Classes that need JavaScript in Bootstrap, or markup changes: reported with the native OmniaCSS / OmniaUI way. */
export const MANUAL = [
  [/^modal/, "Modal: use <dialog class=\"oc-modal\"> opened with <button commandfor=\"id\" command=\"show-modal\"> (no JavaScript)"],
  [/^dropdown/, "Dropdown: use a popover with anchor positioning (OmniaUI dropdown-menu)"],
  [/^(collapse|collapsing|accordion)/, "Collapse/accordion: use <details name=\"group\"><summary> (OmniaUI accordion)"],
  [/^carousel/, "Carousel: use a scroll-snap row with .scroll-buttons and .scroll-markers-after (see docs/scroll-snap)"],
  [/^(navbar|nav$|nav-)/, "Navigation: use OmniaUI site-header / navmenu; tabs: OmniaUI tabs (radio + :has())"],
  [/^(tab-content|tab-pane)$/, "Tabs: OmniaUI tabs (radio + :has()) or :target panels (docs/selectors)"],
  [/^(offcanvas)/, "Off-canvas: OmniaUI sheet / drawer on <dialog>"],
  [/^(toast)/, "Toast: OmniaUI toast / toast-stack (popover=\"manual\")"],
  [/^(tooltip|popover)$/, "Tooltip/popover: OmniaUI tooltip (popover + anchor) or hover-card"],
  [/^(glyphicon|bi$|bi-|fa$|fa-)/, "Icon font: replace with inline SVG icons"],
  [/^(list-group)/, "List group: OmniaUI stack-list / item"],
  [/^(embed-responsive|ratio$)/, "Responsive embed: put aspect-16/9 (or another aspect-*) on the iframe itself with w-full"],
  [/^(clearfix)$/, "Clearfix: use flex or grid instead of floats, or flow-root"],
  [/^(thumbnail|img-thumbnail|caption|media|media-body)$/, "Media/thumbnail: OmniaUI media-card / media-row"],
  [/^(close|btn-close)$/, "Close button: OmniaUI oc-modal-close or a ghost button with an icon"],
];

/** State classes toggled by Bootstrap's JavaScript: left in place, reported. */
export const JS_STATE = new Set(["active", "show", "fade", "in", "collapsed", "disabled", "open"]);

/** Grid classes kept as they are and served by the compat stylesheet. */
export function isGridClass(name) {
  return /^(container(-fluid|-(sm|md|lg|xl|xxl))?|row|row-cols-(\d|auto)|row-cols-(sm|md|lg|xl|xxl)-(\d|auto)|col|col-auto|col-(\d{1,2})|col-(xs|sm|md|lg|xl|xxl)(-(\d{1,2}|auto))?|offset-(\d{1,2})|offset-(sm|md|lg|xl|xxl)-(\d{1,2})|col-(xs|sm|md|lg)-offset-\d{1,2}|col-(xs|sm|md|lg)-(push|pull)-\d{1,2}|g[xy]?-[0-5]|g[xy]?-(sm|md|lg|xl|xxl)-[0-5])$/.test(name);
}
