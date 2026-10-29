// File: apps/docs/src/lib/transform.mjs
// Turns page content (plain HTML with a few OmniaCSS docs tags) into final markup at build time.
//
//   <oc-code lang="html">…escaped code…</oc-code>          → Code-block component (line numbers + colors)
//   <oc-demo title="Clip path">preview <oc-code lang="html">…</oc-code> [<oc-code lang="vue">…] </oc-demo>
//                                                          → demo panel: title, tabs Preview | HTML | Vue …,
//                                                            preview widths, one code panel per tab (code is generated
//                                                            from the preview when no <oc-code> is given)
//   <oc-demo pro>                                          → same panel with a Pro badge; the Code tab points to OmniaUI Pro
//   <oc-compat features="css.properties.clip-path …">      → browser support table (MDN data)
//   .oc-expandable-table__trigger buttons                  → CSS-only "Show more" toggle
//   h2/h3 headings                                         → ids + "On this page" list
//
// Every docs page about CSS ends with: content -> divider -> "Browser support" -> "Source & Further Reading".
// Browser support blocks written anywhere in the page are collected and moved there; pages without one get one
// derived from what they document, and pages without a source footer get a generated one.
//
// Map: parse -> demos -> code blocks -> browser support + source footer -> compat -> expandable tables -> headings -> serialize

import { parseHTML } from "linkedom";
import { codeBlock, dedent } from "./highlight.mjs";
import fs from "node:fs";
import path from "node:path";
import { compatTable, hasCompat, mdnLink, supportSummary } from "./compat.mjs";
import { REPO, CONTENT } from "./site.mjs";

const slug = (s) => s.toLowerCase().replace(/&amp;|&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";

function replaceWithHtml(doc, el, html) {
  const tpl = doc.createElement("template");
  tpl.innerHTML = html;
  el.replaceWith(...tpl.content.childNodes);
}

/** Preview HTML → readable code sample (drop docs-only wrappers). */
function previewToCode(preview) {
  return dedent(preview.replace(/\s+data-oc-demo-only="[^"]*"/g, ""));
}

/** Text of the closest heading before an element (walking up through its ancestors). */
function nearestHeading(el) {
  for (let n = el; n && n.localName !== "body"; n = n.parentElement) {
    for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {
      if (/^h[1-4]$/.test(s.localName)) return s.textContent.replace(/\s+/g, " ").trim();
      const inner = s.querySelectorAll?.("h1, h2, h3, h4");
      if (inner?.length) return inner[inner.length - 1].textContent.replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

// Tab labels for the code languages of a demo.
const DEMO_LANGS = { html: "HTML", css: "CSS", js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", vue: "Vue", jsx: "React", tsx: "React", react: "React", blade: "Blade", php: "PHP", shell: "Shell", bash: "Shell", json: "JSON", scss: "SCSS" };
const svgIcon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const WIDTH_ICONS = {
  desktop: svgIcon('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  tablet: svgIcon('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>'),
  phone: svgIcon('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
};

// Code panel of an <oc-demo pro> (OmniaUI Pro block): no code, a pointer to the Pro page instead.
const PRO_LOCK = `${svgIcon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')}<p><strong>Part of OmniaUI Pro.</strong> The HTML, Blade, React and Vue code of this block comes with an OmniaUI Pro license.</p><a class="oc-btn oc-btn--primary oc-btn--sm" href="/ui/pro.html">About OmniaUI Pro</a>`;

// Native HTML/CSS features recognised in demo markup → MDN keys.
const MARKUP_FEATURES = [
  [/\spopover(\s|=|>)/, ["html.global_attributes.popover", "css.properties.position-area"]],
  [/<details[^>]*\sname=/, ["html.elements.details.name", "css.selectors.details-content", "css.properties.interpolate-size"]],
  [/<dialog/, ["html.elements.dialog", "html.elements.button.command"]],
  [/oc-tabset|oc-theme-switch/, ["css.selectors.has"]],
  [/oc-counter/, ["css.at-rules.property", "css.types.counter"]],
  [/oc-scrollbar|scrollbar-/, ["css.properties.scrollbar-color", "css.properties.scrollbar-width"]],
  [/class="[^"]*\boc-(btn|card|badge|alert|tab-list|tabset|accordion|modal|dropdown|table|input|progress|skeleton|tooltip|avatar|pagination|breadcrumb|separator|product-card|code-window|spotlight)\b/, ["css.types.color.light-dark", "css.types.color.color-mix"]],
];

/** MDN keys for what a page documents: properties/at-rules from reference tables + native features in demos. */
// Page file name → the CSS feature it is about (when its tables only list class names).
const PAGE_FEATURES = {
  shadows: ["box-shadow", "text-shadow"], transitions: ["transition", "transition-timing-function", "transition-behavior"],
  transforms: ["transform", "translate", "rotate", "scale"], filters: ["filter", "backdrop-filter"], blend: ["mix-blend-mode", "background-blend-mode"],
  animations: ["animation", "css.at-rules.keyframes"], aspect: ["aspect-ratio"], container: ["css.at-rules.container", "container-type"],
  "min-max-height": ["min-height", "max-height"], "min-max-width": ["min-width", "max-width"], "size-icon": ["width", "height"],
  "box-sizing": ["box-sizing"], backgrounds: ["background", "background-clip"], flow: ["display.flow-root"], "z-index": ["z-index"],
  inset: ["inset"], types: ["position"], direction: ["flex-direction"], wrap: ["flex-wrap"], gap: ["gap"],
  "place-content": ["place-content"], "place-items": ["place-items"], "place-self": ["place-self"], "font-family": ["font-family"],
  "font-size": ["font-size"], "font-weight": ["font-weight"], "letter-spacing": ["letter-spacing"], "line-height": ["line-height"],
  "text-decoration": ["text-decoration", "text-underline-offset"], "text-transform": ["text-transform"], advanced: ["text-wrap", "hyphens"],
  families: ["font-family", "css.at-rules.font-face"], usage: ["font-family", "font-variation-settings"], "border-collapse": ["border-collapse"],
  "border-spacing": ["border-spacing"], "caption-side": ["caption-side"], layout: ["table-layout"], margin: ["margin", "margin-inline"],
  padding: ["padding", "padding-inline"], alignment: ["justify-content", "align-items", "place-items"], "flex-grid": ["display.flex", "display.grid", "gap"],
  position: ["position", "inset"], sizing: ["width", "height", "aspect-ratio"], spacing: ["margin", "padding"], tables: ["border-collapse", "table-layout"],
  typography: ["font-size", "line-height", "text-wrap"], effects: ["box-shadow", "filter", "transition"], fonts: ["font-family"], "layout-module": ["css.at-rules.view-transition"],
  system: ["css.types.color.oklch", "css.types.color.light-dark", "css.types.color.color-mix"], examples: ["css.types.color.oklch", "css.types.color.color-mix"],
  colors: ["css.types.color.oklch", "css.types.color.color-mix"], theming: ["css.types.color.light-dark", "color-scheme", "css.selectors.has"],
  "section-block": ["display.grid", "css.types.color.color-mix"], code: ["css.types.color.light-dark", "tab-size"], "code-syntax": ["tab-size", "white-space"],
  "code-syntax-theme": ["css.types.color.oklch"], features: ["display.grid", "grid-template-columns"], footer: ["display.grid", "css.types.color.light-dark"],
  stats: ["display.grid", "css.types.counter"], overflow: ["overflow", "overflow-clip-margin"], display: ["display"],
};

function detectFeatures(body, page = "", markup = "", limit = 10, folder = "") {
  const keys = new Set();
  const add = (k) => { if (keys.size < limit && hasCompat(k)) keys.add(k); };
  for (const f of PAGE_FEATURES[`${folder}/${page}`] || PAGE_FEATURES[page] || []) add(f.startsWith("css.") ? f : `css.properties.${f}`);
  for (const cell of body.querySelectorAll(".oc-table-ref td, .oc-table-ref code, table td code")) {
    const text = cell.textContent;
    if (/^-?[a-z]+(-[a-z]+)*$/.test(text.trim()) && text.trim().includes("-")) add(`css.properties.${text.trim()}`);
    for (const m of text.matchAll(/(?:^|[\s;{(])(-?[a-z][a-z-]+)\s*:/g)) add(`css.properties.${m[1]}`);
    for (const m of text.matchAll(/@([a-z-]+)/g)) add(`css.at-rules.${m[1]}`);
  }
  for (const [re, list] of MARKUP_FEATURES) if (re.test(markup)) list.forEach(add);
  return [...keys];
}

// Modern CSS a component's own rules rely on (regex on selector + declarations → MDN key).
const CSS_RULE_FEATURES = [
  [/:has\(/, "css.selectors.has"], [/:popover-open/, "css.selectors.popover-open"], [/anchor-name|position-anchor|anchor\(/, "css.properties.anchor-name"],
  [/light-dark\(/, "css.types.color.light-dark"], [/color-mix\(/, "css.types.color.color-mix"], [/oklch\(/, "css.types.color.oklch"],
  [/field-sizing/, "css.properties.field-sizing"], [/interpolate-size/, "css.properties.interpolate-size"], [/::details-content/, "css.selectors.details-content"],
  [/allow-discrete|transition-behavior/, "css.properties.transition-behavior"], [/::backdrop/, "css.selectors.backdrop"], [/:focus-visible/, "css.selectors.focus-visible"],
  [/container-type|@container/, "css.at-rules.container"], [/scroll-snap-type/, "css.properties.scroll-snap-type"], [/backdrop-filter/, "css.properties.backdrop-filter"],
  [/\bmask(-image)?:/, "css.properties.mask-image"], [/aspect-ratio/, "css.properties.aspect-ratio"], [/accent-color/, "css.properties.accent-color"],
  [/\banimation(-name)?:/, "css.properties.animation"], [/\binset:/, "css.properties.inset"], [/grid-template/, "css.properties.grid-template-columns"],
  // Plain layout last, so a component that uses nothing newer still lists what it builds on.
  [/display:\s*(inline-)?flex/, "css.properties.display.flex"], [/display:\s*(inline-)?grid/, "css.properties.display.grid"], [/\bgap:/, "css.properties.gap"],
];
const COMPONENT_CSS = () => [
  ...["packages/ui/src", "packages/ui/src/parts"].flatMap((d) => { try { return fs.readdirSync(path.join(REPO, d)).filter((f) => f.endsWith(".css")).map((f) => path.join(REPO, d, f)); } catch { return []; } }),
  path.join(REPO, "packages/blocks/src/blocks.css"),
  path.join(REPO, "vendor/omniaui-pro/pro.css"),
];
/** Fallback for OmniaUI pages whose tables only list class names: features used by the CSS rules of the demo's classes. */
function cssFeatures(markup, limit = 8) {
  const classes = new Set([...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => /^oc-[a-z0-9-]+$/.test(c) && !/^oc-(theme-scope|demo)/.test(c)));
  if (!classes.size) return [];
  const mine = (sel) => [...sel.matchAll(/\.(oc-[a-z0-9_-]+)/g)].some((m) => classes.has(m[1]));
  const keys = new Set();
  const scan = (text) => { for (const [re, key] of CSS_RULE_FEATURES) if (re.test(text) && hasCompat(key)) keys.add(key); };
  for (const file of COMPONENT_CSS()) {
    const css = rd(file).replace(/\/\*[\s\S]*?\*\//g, "");
    // Only the page's own selectors count (a shared selector list may name other components' features).
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const own = m[1].split(",").filter(mine);
      if (own.length) scan(own.join(",") + "{" + m[2]);
    }
    for (const m of css.matchAll(/@starting-style\s*\{([\s\S]*?\})\s*\}/g)) if (mine(m[1]) && hasCompat("css.at-rules.starting-style")) keys.add("css.at-rules.starting-style");
  }
  // Newest first (list order), plain layout last; starting-style sits with the modern ones.
  const rank = (k) => (k === "css.at-rules.starting-style" ? 1.5 : CSS_RULE_FEATURES.findIndex(([, key]) => key === k));
  return [...keys].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

// ---------------------------------------------------------------------------------------------------------
// Browser support + "Source & Further Reading" (end of every docs page about CSS)
// ---------------------------------------------------------------------------------------------------------

// Docs pages that are not about one CSS feature set: no browser support block.
const NON_CSS_PAGES = new Set(["docs/index.html", "docs/configuration.html", "docs/migrate.html", "docs/editor.html", "docs/ai.html", "docs/css-catalog.html"]);
// Folder (or folder/page) → MDN keys, when the page text alone does not reveal what it documents.
Object.assign(PAGE_FEATURES, {
  "borders/corner-shape": ["corner-shape", "border-radius"], borders: ["border-radius", "border-style", "outline", "corner-shape"],
  fluid: ["css.types.clamp", "css.types.min", "css.types.max"], responsive: ["css.at-rules.media", "css.types.color.light-dark", "color-scheme"],
  "font-families": ["font-family", "css.at-rules.font-face"], "font-usage": ["font-family", "font-variation-settings", "css.at-rules.font-face"],
  utilities: ["css.at-rules.layer", "css.at-rules.property", "css.types.color.color-mix"], "layout-module": ["css.at-rules.view-transition", "position", "css.types.color.light-dark"],
  "code-syntax-theme": ["css.types.color.oklch", "css.types.color.light-dark", "css.types.color.color-mix"],
});

// Pages without a SCSS badge: where their classes come from (folder, folder/page or top-level page → files).
const SOURCE_FILES = {
  "anchor-positioning": ["_anchor_positioning.scss"], columns: ["_layout_flow.scss"], fragmentation: ["_layout_flow.scss"], images: ["_layout_flow.scss"],
  "generated-content": ["_typography_advanced.scss"], lists: ["_text.scss", "_typography_advanced.scss"], "container-queries": ["_container.scss", "_containment.scss"],
  "experimental-css": ["_experimental_css.scss"], scrollbars: ["_scrollbar.scss"], shapes: ["_shapes.scss"], "starting-style": ["_starting_style.scss"],
  "view-transitions": ["_view_transitions.scss"], "scroll-animations": ["_scroll_animations.scss"], svg: ["_svg.scss"], "writing-modes": ["_writing_modes.scss"],
  gradients: ["_gradients.scss"], interactivity: ["_interactivity.scss"], colors: ["_colors_omnia.scss", "_colors_mix.scss", "_colors_tokens.scss"],
  responsive: ["_responsive.scss", "_dark_mode.scss"], fluid: ["_clamp.scss"], utilities: ["_index.scss"], "layout/extras": ["_layout_extras.scss"],
  "typography/font-usage": ["_fonts.scss"], "code-syntax": ["public/css/oc-code-syntax.css"], "code-syntax-theme": ["public/css/oc-code-syntax.css"],
  "layout-module": ["public/css/oc-layout-module.css"],
};

// Newer features demonstrated on a page that its own support list should always include (folder, folder/page or page).
const EXTRA_FEATURES = {
  images: ["css.properties.object-view-box", "css.types.image.image-set"],
  lists: ["css.at-rules.counter-style", "css.selectors.marker"],
  svg: ["css.properties.paint-order", "css.properties.vector-effect", "css.properties.shape-rendering", "css.properties.text-anchor", "css.properties.dominant-baseline", "css.properties.baseline-shift"],
  sizing: ["css.types.length.viewport_percentage_units_dynamic", "css.types.length.viewport_percentage_units_small", "css.types.length.viewport_percentage_units_large"],
  "flex-grid": ["css.properties.grid-template-columns.subgrid", "css.properties.display.contents"],
  alignment: ["css.properties.align-content"],
};

const readCache = new Map();
const rd = (file) => { if (!readCache.has(file)) { try { readCache.set(file, fs.readFileSync(file, "utf8")); } catch { readCache.set(file, ""); } } return readCache.get(file); };
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Keys of everything a docs folder documents (used by its overview page): explicit lists first, else detected. */
const groupCache = new Map();
function groupFeatures(folder) {
  if (groupCache.has(folder)) return groupCache.get(folder);
  const dir = path.join(CONTENT, "docs", folder);
  const out = new Set();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".html") && f !== "index.html").sort(); } catch {}
  for (const f of files) {
    const src = rd(path.join(dir, f)).replace(/^<!--oc-page .*?-->\r?\n?/, "");
    const explicit = [...src.matchAll(/<oc-compat features="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(hasCompat);
    let picked = explicit.slice(0, 2);
    if (!picked.length) {
      const { document } = parseHTML(`<!doctype html><html><body>${src}</body></html>`);
      picked = detectFeatures(document.body, f.replace(/\.html$/, ""), "", 2, folder);
    }
    picked.forEach((k) => out.add(k));
  }
  const list = [...out].slice(0, 14);
  groupCache.set(folder, list);
  return list;
}

/** Real relative path of a SCSS partial (e.g. "_fonts.scss" → "src/scss/utilities/_fonts.scss"). */
let scssIndex;
function scssPath(name) {
  if (!scssIndex) {
    scssIndex = new Map();
    const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".scss")) scssIndex.set(e.name, path.relative(REPO, p).split(path.sep).join("/")); } };
    try { walk(path.join(REPO, "src/scss")); } catch {}
  }
  return scssIndex.get(name);
}

/** Docs navigation: folder → pages, plus the top-level sections, for "Related pages". */
let navCache;
function navGroups() {
  if (!navCache) {
    navCache = { folders: new Map(), sections: [] };
    try {
      const data = JSON.parse(rd(path.join(REPO, "public/data/oc-docs-nav.json")));
      for (const g of data.leftSections || []) {
        navCache.sections.push((g.items || []).map((i) => ({ href: `/docs/${i.href}`, label: i.label })));
        for (const i of g.items || []) {
          if (!i.href?.endsWith("/")) continue;
          navCache.folders.set(i.href.slice(0, -1), (i.children || []).map((c) => ({ href: `/docs/${i.href}${c.href === i.href ? "index.html" : c.href}`, label: c.label })));
        }
      }
    } catch {}
  }
  return navCache;
}

function relatedPages(route) {
  const nav = navGroups();
  const url = "/" + route;
  const parts = route.split("/");
  const list = parts.length === 3 ? nav.folders.get(parts[1]) || [] : nav.sections.find((sec) => sec.some((i) => i.href === url)) || [];
  const i = list.findIndex((p) => p.href === url);
  const out = [];
  if (parts.length === 3 && list[0] && i > 1) out.push(list[0]);
  if (i > 0) out.push(list[i - 1]);
  if (i >= 0 && list[i + 1]) out.push(list[i + 1]);
  if (parts.length === 3 && i === 0) out.push(...list.slice(1, 4));
  if (!out.length) out.push({ href: "/docs/index.html", label: "Docs home" });
  // Overview pages (i === 0) add the next page twice (as neighbour and as first child): keep each link once.
  return out.filter((p, n) => out.findIndex((q) => q.href === p.href) === n);
}

/** Default "Source & Further Reading" footer for a docs page (same markup as effects/animation-properties). */
function sourceFooter(body, route, keys, title, folder, page) {
  const names = new Set();
  for (const el of body.querySelectorAll(".oc-badge-source-scss, .oc-badge-source")) {
    const t = el.textContent.trim();
    if (/^_[\w-]+\.scss$/.test(t)) names.add(t);
  }
  const mapped = SOURCE_FILES[folder ? `${folder}/${page}` : page] || SOURCE_FILES[folder];
  const extra = [];
  for (const f of mapped || []) { if (f.includes("/")) extra.push({ name: path.basename(f), file: f }); else names.add(f); }
  if (!names.size && !extra.length) for (const m of body.textContent.matchAll(/_[a-z0-9_]+\.scss/g)) { if (scssPath(m[0])) names.add(m[0]); if (names.size >= 4) break; }
  const files = [...[...names].map((n) => ({ name: n, file: scssPath(n) })).filter((f) => f.file), ...extra];
  const mdn = keys.map(mdnLink).filter(Boolean).filter((m, i, a) => a.findIndex((x) => x.href === m.href) === i).slice(0, 4);
  const link = (m) => `<a href="${escAttr(m.href)}" target="_blank" rel="noopener">MDN: ${escText(m.label)}</a>`;
  const from = files.length ? `These utilities come from ${files.map((f) => `<code>${f.name}</code>`).join(", ")}.` : "These utilities are generated from the SCSS maps in <code>src/scss/utilities/</code>.";
  const desc = `${from}${mdn.length ? ` See ${mdn.map(link).join(", ")}.` : ""}`;
  const rows = (files.length ? files : [{ file: "src/scss/utilities/" }]).map((f) => `<tr><td><code>${f.file}</code></td><td>${files.length ? `Classes documented on the ${escText(title)} page` : "Utility classes, generated from SCSS maps"}</td></tr>`).join("");
  const related = relatedPages(route).map((r) => `<a class="source-link" href="${escAttr(r.href)}">${escText(r.label)}</a>`).join(" · ");
  return `<div class="oc-section-footer"><h2 class="oc-section-footer__title" id="source">Source &amp; Further Reading</h2><p class="oc-section-footer__desc">${desc}</p><div class="oc-section-content"><h3 class="oc-section-content__title">SCSS source</h3><div class="oc-expandable-table"><table class="oc-table-ref"><thead><tr><th class="w-perc-1/3">File</th><th>Contains</th></tr></thead><tbody>${rows}</tbody></table></div><h3 class="oc-section-content__title">Compiled output</h3><p class="oc-section-content__desc">Run <code>npm run build</code> to compile the SCSS; all classes end up in <code>public/css/omnia_main.css</code>.</p><h3 class="oc-section-content__title">Related pages</h3><p class="oc-section-content__desc">${related}</p></div></div>`;
}

/** Files behind an OmniaUI component or block page, relative to the repository (only those that exist). */
function uiSourceFiles(kind, slug) {
  const pascal = slug.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
  const has = (rel) => fs.existsSync(path.join(REPO, rel));
  const partOf = (dir) => { try { return fs.readdirSync(path.join(REPO, dir)).find((f) => f.endsWith(`-${slug}.css`)); } catch { return null; } };
  if (kind === "components") {
    const part = partOf("packages/ui/src/parts");
    return {
      css: part ? `packages/ui/src/parts/${part}` : "packages/ui/src/components.css",
      snippets: has(`packages/ui/snippets/${slug}.html`) ? [`packages/ui/snippets/${slug}.html`] : [],
      react: has(`packages/react/src/components/${pascal}.tsx`) && { file: `packages/react/src/components/${pascal}.tsx`, name: pascal, pkg: "@birdycom/omniaui-react" },
      vue: has(`packages/vue/src/components/Oc${pascal}.vue`) && { file: `packages/vue/src/components/Oc${pascal}.vue`, name: `Oc${pascal}`, pkg: "@birdycom/omniaui-vue" },
      blade: has(`php-packages/omniaui-laravel/resources/views/components/${slug}.blade.php`) && { file: `resources/views/components/${slug}.blade.php`, tag: `x-oc::${slug}` },
    };
  }
  const part = partOf("packages/blocks/src/parts");
  let snippets = [];
  try { snippets = fs.readdirSync(path.join(REPO, "packages/blocks/blocks")).filter((f) => f === `${slug}.html` || f.startsWith(`${slug}-`)).map((f) => `packages/blocks/blocks/${f}`); } catch {}
  return {
    css: part ? `packages/blocks/src/parts/${part}` : "packages/blocks/src/blocks.css",
    snippets,
    react: has(`packages/react/src/blocks/Block${pascal}.tsx`) && { file: `packages/react/src/blocks/Block${pascal}.tsx`, name: `Block${pascal}`, pkg: "@birdycom/omniaui-react" },
    vue: has(`packages/vue/src/blocks/OcBlock${pascal}.vue`) && { file: `packages/vue/src/blocks/OcBlock${pascal}.vue`, name: `OcBlock${pascal}`, pkg: "@birdycom/omniaui-vue" },
    blade: has(`php-packages/omniaui-laravel/resources/views/components/block/${slug}.blade.php`) && { file: `resources/views/components/block/${slug}.blade.php`, tag: `x-oc::block.${slug}` },
  };
}

function uiPageExtras(body, route, document) {
  const m = route.match(/^ui\/(components|blocks)\/([a-z0-9-]+)\.html$/);
  if (!m || !fs.existsSync(path.join(REPO, "packages/ui"))) return;
  const demos = body.querySelectorAll(".oc-demo");
  if (demos.length && [...demos].every((d) => d.classList.contains("oc-demo--pro"))) return;
  const [, kind, slug] = m;
  const f = uiSourceFiles(kind, slug);
  const sections = () => [...body.children].filter((el) => el.localName === "section");
  const add = (html) => {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const last = sections().at(-1);
    if (last) last.after(tpl.content); else body.append(tpl.content);
  };
  if (!body.querySelector("#frameworks") && (f.react || f.vue || f.blade)) {
    const lines = [];
    if (f.react) lines.push(`&lt;!-- React --&gt;`, `import { ${f.react.name} } from "${f.react.pkg}";`, `&lt;${f.react.name} /&gt;`);
    if (f.vue) lines.push(`&lt;!-- Vue --&gt;`, `import { ${f.vue.name} } from "${f.vue.pkg}";`, `&lt;${f.vue.name} /&gt;`);
    if (f.blade) lines.push(`&lt;!-- Laravel Blade --&gt;`, `&lt;${f.blade.tag} /&gt;`);
    add(`<section class="oc-docs-section" id="frameworks"><div class="oc-section-header"><h2 class="oc-section-header__title">Framework wrappers</h2><p class="oc-section-header__desc">The same markup and classes as ${[f.react && "React", f.vue && "Vue", f.blade && "Blade"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")} components. Their props follow the class modifiers on this page; see the source files below.</p></div><div class="oc-section-content">${codeBlock(lines.join("\n").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), "html")}</div></section>`);
  }
  // Framework wrappers always follow the reference directly (auto-added or written in the page).
  const ref = sections().find((el) => el.id === "reference");
  const fw = sections().find((el) => el.id === "frameworks");
  if (ref && fw && ref.nextElementSibling !== fw) ref.after(fw);
  if (!pageFooter(body)) {
    const rows = [[f.css, "Styles"], ...f.snippets.map((s) => [s, "Copy-paste markup"])];
    if (f.react || f.vue) rows.push([[f.react?.file, f.vue?.file].filter(Boolean).join("</code> / <code>"), "Wrappers"]);
    if (f.blade) rows.push([f.blade.file, `Laravel: <code>&lt;${f.blade.tag}&gt;</code>`]);
    const footer = `<div class="oc-section-footer"><h2 class="oc-section-footer__title" id="source">Source &amp; Further Reading</h2><div class="oc-section-content"><h3 class="oc-section-content__title">Source files</h3><table class="oc-table-ref"><thead><tr><th class="w-perc-1/3">File</th><th>Contains</th></tr></thead><tbody>${rows.map(([file, what]) => `<tr><td><code>${file}</code></td><td>${what}</td></tr>`).join("")}</tbody></table></div></div>`;
    const last = sections().at(-1);
    if (last) { const tpl = document.createElement("template"); tpl.innerHTML = footer; last.append(tpl.content); }
  }
}

// The page's own source footer; a footer inside a demo (Section block) is part of the example.
const pageFooter = (body) => [...body.querySelectorAll(".oc-section-footer")].find((f) => !f.closest(".oc-demo"));
const isBrowserSupportHeading = (el) => !!el && /^h[23]$/.test(el.localName) && /^browser support$/i.test(el.textContent.trim());

export function transform(content, route = "") {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${content}</body></html>`);
  const body = document.body;

  const demoMarkup = [...body.querySelectorAll("oc-demo")].map((d) => d.innerHTML).join(" ");

  // 1. Demo panels: a bar (title, Preview | code tabs, preview widths) -> preview -> one code panel per tab.
  //    Every <oc-code> child becomes a tab (HTML, CSS, Vue, React, Blade …); without one, code comes from the preview.
  //    Tabs and widths are radio inputs (CSS :has(), no JavaScript); styles in public/css/oc-docs-v2.css.
  const pageTitle = body.querySelector("h1")?.textContent.trim() || "";
  let demoCount = 0;
  for (const demo of [...body.querySelectorAll("oc-demo")]) {
    const title = demo.getAttribute("title") || nearestHeading(demo) || pageTitle;
    // <oc-demo pro>: an OmniaUI Pro block. The live preview stays; the Code tab says where the code comes from.
    const pro = demo.hasAttribute("pro");
    const codes = [...demo.children].filter((c) => c.localName === "oc-code").map((c) => {
      c.remove();
      return { code: c.textContent, lang: c.getAttribute("lang") || "html" };
    }).filter((c) => c.code.trim() && !pro);
    const preview = demo.innerHTML;
    if (!codes.length && !pro) codes.push({ code: previewToCode(preview), lang: "html" });
    const n = ++demoCount;
    // <oc-demo size="tall"> gives popovers/dropdowns room to open inside the preview.
    const size = demo.getAttribute("size") ? ` oc-demo__preview--${demo.getAttribute("size")}` : "";
    const tab = (value, label, checked = false) => `<label class="oc-demo__tab"><input type="radio" name="oc-demo-${n}" value="${value}"${checked ? " checked" : ""}><span>${label}</span></label>`;
    const tabs = [tab("preview", "Preview", true), ...(pro ? [tab("code-1", "Code")] : codes.map((c, i) => tab(`code-${i + 1}`, DEMO_LANGS[c.lang] || c.lang.toUpperCase())))].join("");
    const width = (value, label, icon, checked = false) => `<label class="oc-demo__width" title="${label}"><input type="radio" name="oc-demo-${n}-width" value="${value}" aria-label="${label}"${checked ? " checked" : ""}>${icon}</label>`;
    const widths = [width("full", "Full width", WIDTH_ICONS.desktop, true), width("tablet", "Tablet (48rem)", WIDTH_ICONS.tablet), width("phone", "Phone (24rem)", WIDTH_ICONS.phone)].join("");
    const panels = pro ? `<div class="oc-demo__code oc-demo__pro-lock" data-code="1">${PRO_LOCK}</div>`
      : codes.map((c, i) => `<div class="oc-demo__code" data-code="${i + 1}">${codeBlock(c.code, c.lang)}</div>`).join("");
    // A theme switch inside a demo (app header, app shell, the theme-switch component) themes only that preview:
    // .oc-theme-scope on the preview, and its own radio name so it is not grouped with the site header switch.
    // The code panels keep the original names (they were taken from `preview` above).
    for (const radio of demo.querySelectorAll(".oc-theme-switch input[name]")) radio.setAttribute("name", `${radio.getAttribute("name")}-demo-${n}`);
    // In-page links of the demo ("#overview" in a table of contents or a sidebar) must not scroll the docs page to
    // its own section with the same id: a link that does not point inside this demo gets a fragment of its own.
    const inner = new Set([...demo.querySelectorAll("[id]")].map((el) => el.id));
    for (const a of demo.querySelectorAll('a[href^="#"]')) {
      const id = a.getAttribute("href").slice(1);
      if (id && !inner.has(id)) a.setAttribute("href", `#demo-${n}-${id}`);
    }
    const scoped = demo.innerHTML;
    replaceWithHtml(document, demo, `<div class="oc-demo oc-demo--v2${pro ? " oc-demo--pro" : ""}"><div class="oc-demo__bar"><h4 class="oc-demo__title">${title}${pro ? ' <span class="oc-demo__pro-badge">Pro</span>' : ""}</h4><div class="oc-demo__tablist" role="radiogroup" aria-label="Show">${tabs}</div><div class="oc-demo__widths" role="radiogroup" aria-label="Preview width">${widths}</div></div><div class="oc-demo__preview oc-theme-scope${size}">${scoped}</div>${panels}</div>`);
  }

  // 2. Stand-alone code blocks
  for (const el of [...body.querySelectorAll("oc-code")]) {
    replaceWithHtml(document, el, codeBlock(el.textContent, el.getAttribute("lang") || undefined));
  }

  // 2b. Older pages end with a separate "Source & ..." section: turn it into the standard source footer
  //     (title, intro, content), appended to the previous section.
  if (route.startsWith("docs/") && pageFooter(body)) {
    // A page with a proper footer must not also carry an older duplicate "Source" section.
    for (const sec of body.querySelectorAll("section.oc-docs-section")) {
      if (/^source/i.test(sec.querySelector(".oc-section-header__title")?.textContent.trim() || "") && !sec.querySelector(".oc-section-footer")) sec.remove();
    }
  }
  if (route.startsWith("docs/") && !pageFooter(body)) {
    const legacy = [...body.querySelectorAll("section.oc-docs-section")].find((sec) => /^source\b/i.test(sec.querySelector(".oc-section-header__title")?.textContent.trim() || ""));
    if (legacy) {
      const header = legacy.querySelector(".oc-section-header");
      const desc = header.querySelector(".oc-section-header__desc");
      const content = legacy.querySelector(".oc-section-content");
      const footer = document.createElement("div");
      footer.className = "oc-section-footer";
      footer.innerHTML = '<h2 class="oc-section-footer__title" id="source">Source &amp; Further Reading</h2>' + (desc ? `<p class="oc-section-footer__desc">${desc.innerHTML}</p>` : "");
      if (content) {
        for (const h of content.querySelectorAll("h3, h4")) h.className = "oc-section-content__title";
        for (const m of content.querySelectorAll("p.oc-docs-typo-meta")) m.className = "oc-section-content__desc";
        footer.append(content);
      }
      const secs = [...body.querySelectorAll("section.oc-docs-section")];
      const prev = secs[secs.indexOf(legacy) - 1];
      if (prev) { prev.append(footer); legacy.remove(); } else legacy.replaceWith(footer);
    }
  }

  // 2b. OmniaUI component and block pages: add "Framework wrappers" and the source footer when the page has none,
  //     from the files that exist (React, Vue, Blade, snippet, CSS part). Pro block pages are skipped (closed code).
  uiPageExtras(body, route, document);

  // 3. Browser support + source footer.
  const parts = route.replace(/\.html$/, "").split("/");
  const page = parts.at(-1);
  const folder = parts.length === 3 ? parts[1] : "";
  const pageKey = page === "index" ? (folder || "") : page;
  const isDocsCss = route.startsWith("docs/") && !NON_CSS_PAGES.has(route);
  if (isDocsCss) {
    // 3a. Collect every explicit browser support block (heading + intro + table) wherever the author put it.
    const keys = [];
    const intros = [];
    for (const el of [...body.querySelectorAll("oc-compat")]) {
      keys.push(...(el.getAttribute("features") || "").split(/\s+/).filter(Boolean));
      const prev = el.previousElementSibling;
      if (prev?.localName === "p" && prev.classList.contains("oc-section-content__desc") && isBrowserSupportHeading(prev.previousElementSibling)) {
        intros.push(prev.outerHTML);
        prev.previousElementSibling.remove();
        prev.remove();
      } else if (isBrowserSupportHeading(prev)) prev.remove();
      el.remove();
    }
    // 3b. No explicit list: derive from what the page documents (overview pages: from their whole group).
    let all = [...new Set(keys)];
    if (!all.length) {
      const overview = page === "index" && folder;
      const own = detectFeatures(body, pageKey, demoMarkup, overview ? 4 : 10, folder);
      all = [...new Set(overview ? [...own, ...groupFeatures(folder)] : own)].slice(0, overview ? 14 : 10);
    }
    for (const k of EXTRA_FEATURES[`${folder}/${page}`] || EXTRA_FEATURES[folder] || []) if (hasCompat(k) && !all.includes(k)) all.push(k);
    const title = body.querySelector(".oc-section-header__title, h1")?.textContent.replace(/\s+/g, " ").trim() || "this";
    // 3c. Footer: keep the page's own, else generate one; browser support goes right above it.
    let footer = pageFooter(body);
    if (!footer) {
      const sections = body.querySelectorAll("section.oc-docs-section");
      const host = sections[sections.length - 1] || body;
      const tpl = document.createElement("template");
      tpl.innerHTML = sourceFooter(body, route, all, title, folder, page);
      host.append(tpl.content);
      footer = pageFooter(body);
    }
    if (all.length) {
      const block = document.createElement("div");
      block.className = "oc-section-content oc-browser-support";
      block.innerHTML = `<h3 class="oc-section-content__title" id="browser-support">Browser support</h3>${intros.join("")}<oc-compat features="${all.join(" ")}"></oc-compat>`;
      footer.before(block);
    }
  } else if (!body.querySelector("oc-compat, [data-oc-no-compat]")) {
    // Other pages: a derived list as its own "Browser support" section at the end, like the pages that write one
    // (demo first, browser support last, the source footer under it). Opt out with data-oc-no-compat (overview galleries).
    let keys = detectFeatures(body, parts.at(-1) === "index" ? parts.at(-2) : parts.at(-1), demoMarkup);
    if (!keys.length && /^ui\/(components|blocks)\//.test(route)) keys = cssFeatures(demoMarkup);
    const hero = body.querySelector(".oc-hero");
    const header = body.querySelector(".oc-section-header");
    if (keys.length && (hero || header)) {
      const section = document.createElement("section");
      section.className = "oc-docs-section";
      section.id = "support";
      section.innerHTML = `<div class="oc-section-header"><h2 class="oc-section-header__title">Browser support</h2></div><div class="oc-section-content"><oc-compat features="${keys.join(" ")}"></oc-compat></div>`;
      const footer = pageFooter(body);
      if (footer) {
        footer.closest("section")?.after(section);
        section.append(footer);
      } else {
        // Last section next to the hero (pages that wrap everything in a container included).
        const host = hero ?? header;
        [...host.parentElement.children].filter((el) => el.localName === "section").at(-1).after(section);
      }
    }
  }
  // 3c'. "Source & Further Reading" is its own last section with the same header as Reference (title, intro, content),
  //      wherever the footer was written or generated. A page that already has a #source section gets the footer merged in.
  for (const footer of [...body.querySelectorAll(".oc-section-footer")].filter((f) => !f.closest(".oc-demo"))) {
    const title = footer.querySelector(".oc-section-footer__title");
    const desc = footer.querySelector(".oc-section-footer__desc");
    let section = [...body.children].find((el) => el.localName === "section" && el.id === "source");
    if (!section) {
      section = document.createElement("section");
      section.className = "oc-docs-section";
      section.id = "source";
      section.innerHTML = `<div class="oc-section-header"><h2 class="oc-section-header__title">${title?.innerHTML ?? "Source &amp; Further Reading"}</h2>${desc ? `<p class="oc-section-header__desc">${desc.innerHTML}</p>` : ""}</div>`;
      body.append(section);
    }
    title?.remove();
    desc?.remove();
    section.append(...footer.childNodes);
    footer.remove();
  }
  const sourceSection = [...body.children].find((el) => el.localName === "section" && el.id === "source");
  if (sourceSection) {
    const last = [...body.children].filter((el) => el.localName === "section" && el !== sourceSection).at(-1);
    if (last) last.after(sourceSection); else body.append(sourceSection);
  }
  // 3c''. "Browser support" is its own section (h2 + table) right above the source section, wherever the author or
  //       step 3c put it: .oc-browser-support blocks and "Browser support" sub-headings with their intro and table move in.
  const topSections = () => [...body.children].filter((el) => el.localName === "section");
  let support = topSections().find((el) => el.id === "support" || isBrowserSupportHeading(el.querySelector(":scope > .oc-section-header > h2")));
  const moved = [];
  for (const block of [...body.querySelectorAll(".oc-browser-support")]) {
    if (support?.contains(block) || block.closest(".oc-demo")) continue;
    block.querySelector(":scope > h2, :scope > h3")?.remove();
    moved.push(...block.childNodes);
    block.remove();
  }
  for (const h of [...body.querySelectorAll("h2, h3")].filter(isBrowserSupportHeading)) {
    if (support?.contains(h) || h.classList.contains("oc-section-header__title") || h.closest(".oc-demo")) continue;
    const parts = [];
    for (let el = h.nextElementSibling; el && !/^h[23]$/.test(el.localName); el = el.nextElementSibling) {
      parts.push(el);
      if (el.localName === "oc-compat") break;
    }
    if (!parts.some((el) => el.localName === "oc-compat")) continue;
    h.remove();
    moved.push(...parts);
  }
  if (moved.length) {
    if (!support) {
      support = document.createElement("section");
      support.className = "oc-docs-section";
      support.id = "support";
      support.innerHTML = `<div class="oc-section-header"><h2 class="oc-section-header__title">Browser support</h2></div><div class="oc-section-content"></div>`;
      body.append(support);
    }
    (support.querySelector(":scope > .oc-section-content") ?? support).append(...moved);
  }
  if (support) {
    const source = topSections().find((el) => el.id === "source");
    if (source) source.before(support);
    else topSections().filter((el) => el !== support).at(-1)?.after(support);
  }
  // 3d. Automatic badges next to the page's own: "0 KB JavaScript" when no demo needs a script, and the support
  //     level of everything in the browser support tables ("Baseline" = Chrome, Firefox and Safari, desktop and mobile).
  const header = body.querySelector(".oc-section-header");
  const isDocPage = /^(docs|ui\/(components|blocks))\//.test(route);
  // Pages without demos (overview, configuration, editor …) get neither.
  if (header && isDocPage && !NON_CSS_PAGES.has(route)) {
    const compatKeys = [...body.querySelectorAll("oc-compat")].flatMap((el) => (el.getAttribute("features") || "").split(/\s+/).filter(Boolean));
    const support = supportSummary([...new Set(compatKeys)]);
    const extra = [];
    if (!/<script/i.test(demoMarkup)) extra.push(`<span class="oc-section-header__badge-js oc-badge-nojs" title="The demos on this page run without JavaScript">0 KB JavaScript</span>`);
    if (support?.level === "baseline") extra.push(`<span class="oc-section-header__badge-support oc-badge-support oc-badge-support--baseline" title="Works in Chrome, Firefox and Safari, on desktop and mobile">Baseline</span>`);
    if (support?.level === "newest") extra.push(`<span class="oc-section-header__badge-support oc-badge-support oc-badge-support--newest" title="${escAttr(`Not yet in every browser: ${support.missing.slice(0, 6).join(", ")}${support.missing.length > 6 ? " …" : ""}`)}">Newest CSS</span>`);
    if (extra.length) {
      const badges = [...header.children].filter((c) => /badge/.test(c.className));
      const tpl = document.createElement("template");
      tpl.innerHTML = extra.join("");
      const version = badges.find((b) => /version/.test(b.className));
      if (version) version.before(tpl.content);
      else if (badges.length) badges.at(-1).after(tpl.content);
      else header.querySelector(".oc-section-header__title")?.after(tpl.content);
    }
  }
  for (const el of [...body.querySelectorAll("oc-compat")]) {
    replaceWithHtml(document, el, compatTable((el.getAttribute("features") || "").split(/\s+/).filter(Boolean)));
  }

  // 4. "Show more" tables without JavaScript
  for (const btn of [...body.querySelectorAll("button.oc-expandable-table__trigger")]) {
    replaceWithHtml(document, btn, `<label class="${btn.className}"><input type="checkbox" class="oc-expandable-table__toggle"><span class="oc-expandable-table__more">Show more</span><span class="oc-expandable-table__less">Show less</span></label>`);
  }

  // 5. Headings → ids + table of contents
  const toc = [];
  const used = new Set([...body.querySelectorAll("[id]")].map((e) => e.id));
  for (const h of body.querySelectorAll("h2, h3")) {
    const text = h.textContent.replace(/\s+/g, " ").trim();
    if (!text || h.closest(".oc-demo, .oc-compat, .oc-preview, header, nav") || (h.localName === "h3" && h.closest(".oc-section-footer, section#source"))) continue;
    if (!h.id) {
      let id = slug(text);
      for (let i = 2; used.has(id); i++) id = `${slug(text)}-${i}`;
      h.id = id;
      used.add(id);
    }
    toc.push({ id: h.id, text, level: h.localName === "h2" ? 2 : 3 });
  }

  return { html: body.innerHTML, toc };
}
