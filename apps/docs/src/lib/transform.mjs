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

// ---------------------------------------------------------------------------------------------------------
// Browser support + "Source & Further Reading" (end of every docs page about CSS)
// ---------------------------------------------------------------------------------------------------------

// Docs pages that are not about one CSS feature set: no browser support block.
const NON_CSS_PAGES = new Set(["docs/index.html", "docs/configuration.html", "docs/migrate.html", "docs/css-catalog.html"]);
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
    replaceWithHtml(document, demo, `<div class="oc-demo oc-demo--v2${pro ? " oc-demo--pro" : ""}"><div class="oc-demo__bar"><h4 class="oc-demo__title">${title}${pro ? ' <span class="oc-demo__pro-badge">Pro</span>' : ""}</h4><div class="oc-demo__tablist" role="radiogroup" aria-label="Show">${tabs}</div><div class="oc-demo__widths" role="radiogroup" aria-label="Preview width">${widths}</div></div><div class="oc-demo__preview${size}">${preview}</div>${panels}</div>`);
  }

  // 2. Stand-alone code blocks
  for (const el of [...body.querySelectorAll("oc-code")]) {
    replaceWithHtml(document, el, codeBlock(el.textContent, el.getAttribute("lang") || undefined));
  }

  // 2b. Older pages end with a separate "Source & ..." section: turn it into the standard source footer
  //     (title, intro, content), appended to the previous section.
  if (route.startsWith("docs/") && body.querySelector(".oc-section-footer")) {
    // A page with a proper footer must not also carry an older duplicate "Source" section.
    for (const sec of body.querySelectorAll("section.oc-docs-section")) {
      if (/^source/i.test(sec.querySelector(".oc-section-header__title")?.textContent.trim() || "") && !sec.querySelector(".oc-section-footer")) sec.remove();
    }
  }
  if (route.startsWith("docs/") && !body.querySelector(".oc-section-footer")) {
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
    let footer = body.querySelector(".oc-section-footer");
    if (!footer) {
      const sections = body.querySelectorAll("section.oc-docs-section");
      const host = sections[sections.length - 1] || body;
      const tpl = document.createElement("template");
      tpl.innerHTML = sourceFooter(body, route, all, title, folder, page);
      host.append(tpl.content);
      footer = body.querySelector(".oc-section-footer");
    }
    if (all.length) {
      const block = document.createElement("div");
      block.className = "oc-section-content oc-browser-support";
      block.innerHTML = `<h3 class="oc-section-content__title" id="browser-support">Browser support</h3>${intros.join("")}<oc-compat features="${all.join(" ")}"></oc-compat>`;
      footer.before(block);
    }
  } else if (!body.querySelector("oc-compat, [data-oc-no-compat]")) {
    // Other pages: derived list placed right after the overview (opt out with data-oc-no-compat, e.g. overview galleries).
    const keys = detectFeatures(body, parts.at(-1) === "index" ? parts.at(-2) : parts.at(-1), demoMarkup);
    const hero = body.querySelector(".oc-hero");
    const header = body.querySelector(".oc-section-header");
    if (keys.length && (hero || header)) {
      const el = document.createElement("div");
      el.className = "oc-compat-auto";
      el.innerHTML = `<h3 class="oc-section-content__title" id="browser-support">Browser support</h3><oc-compat features="${keys.join(" ")}"></oc-compat>`;
      const content = header?.parentElement?.querySelector(":scope > .oc-section-content");
      if (hero) hero.after(el);
      else if (content) content.prepend(el);
      else header.after(el);
    }
  }
  // 3d. Automatic badges next to the page's own: "0 KB JavaScript" when no demo needs a script, and the support
  //     level of everything in the browser support tables ("Baseline" = Chrome, Firefox and Safari, desktop and mobile).
  const header = body.querySelector(".oc-section-header");
  const isDocPage = /^(docs|ui\/(components|blocks))\//.test(route);
  if (header && isDocPage) {
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
    if (!text || h.closest(".oc-demo, .oc-compat, .oc-preview, header, nav") || (h.localName === "h3" && h.closest(".oc-section-footer"))) continue;
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
