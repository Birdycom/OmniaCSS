// File: packages/mcp/src/knowledge.mjs
// What the MCP tools know about OmniaCSS: the class index (same as the editor extension), OmniaUI component classes,
// variants, color tokens, Tailwind conversion (@birdycom/omniacss-migrate) and the docs pages on omniacss.eu.
// Map: load() -> lookup / search / variants / tokens / tailwind / searchDocs / readDocs
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
export const SITE = "https://omniacss.eu";

/** Splits "p-4 md:flex, oc-btn" or ["p-4", …] into class tokens. */
export const tokensOf = (input) => [...new Set([].concat(input).flatMap((s) => String(s).split(/[\s,]+/)).filter(Boolean))];

/**
 * @param {{ dist?: string, project?: string }} [o] project: folder whose node_modules may hold OmniaUI (Pro) packages
 */
export async function load({ dist = DIST, project = process.cwd() } = {}) {
  const { load: loadOmnia } = require(path.join(dist, "lib/omnia.cjs"));
  const { loadComponents } = require(path.join(dist, "lib/components.cjs"));
  const omnia = await loadOmnia(dist);
  const components = loadComponents([project], dist);
  const docs = JSON.parse(fs.readFileSync(path.join(dist, "search-index.json"), "utf8"));
  return new Knowledge(omnia, components, docs, await loadTheme(omnia.index.version));
}

/** The semantic theme (--oc-primary …) resolved per mode, from the installed @birdycom/omniacss; {} when unavailable. */
async function loadTheme(version) {
  try {
    const t = await import("@birdycom/omniacss/tokens/export");
    return t.buildExport(await t.loadSemantic(), await t.loadPalette(), version).colors;
  } catch {
    return {};
  }
}

export class Knowledge {
  constructor(omnia, components, docs, theme = {}) {
    this.omnia = omnia;
    this.components = components;
    this.docs = docs;
    this.theme = theme;
    this.version = omnia.index.version;
  }

  /** Per token: known or not, the CSS it produces, or the closest correct name. */
  lookup(tokens) {
    return tokens.map((token) => {
      const base = token.slice(token.lastIndexOf(":") + 1).replace(/^!|!$/g, "");
      if (base.startsWith("oc-") && token === base) {
        if (this.components.has(token)) return { token, known: true, kind: "component", origin: this.components.origin(token), css: this.components.cssFor(token) };
        const near = closest(token, this.components.names);
        return { token, known: false, kind: "component", hint: near ? `Did you mean ${near}?` : "Not an OmniaUI class." };
      }
      const a = this.omnia.analyze(token);
      if (!a) return { token, known: false, hint: "Empty class." };
      if (a.unknownVariant !== undefined) {
        const near = a.unknownVariant ? this.omnia.suggest(a.unknownVariant, "variant") : null;
        return { token, known: false, hint: a.unknownVariant ? `Unknown variant "${a.unknownVariant}:"${near ? `, did you mean "${near}:"?` : "."}` : "Empty variant (::)." };
      }
      if (!a.known) {
        const near = this.omnia.suggest(a.base);
        return { token, known: false, hint: near ? `Unknown utility "${a.base}", did you mean "${token.slice(0, token.length - a.base.length - (a.important ? 1 : 0))}${near}"?` : `Unknown utility "${a.base}".` };
      }
      return { token, known: true, kind: "utility", css: this.omnia.cssFor(token, { pixels: true }) ?? "" };
    });
  }

  /** Utilities (and OmniaUI classes) whose name or CSS matches every word of the query. */
  search(query, { limit = 40, components = true } = {}) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    for (const name of this.omnia.names) {
      const css = this.omnia.summary(name).toLowerCase();
      const inName = words.every((w) => name.includes(w));
      if (!inName && !words.every((w) => name.includes(w) || css.includes(w))) continue;
      hits.push({ name, css: this.omnia.summary(name), score: (inName ? 0 : 100) + name.length });
    }
    if (components) {
      for (const name of this.components.names) {
        if (!words.every((w) => name.includes(w))) continue;
        hits.push({ name, css: this.components.summary(name), origin: this.components.origin(name), score: 50 + name.length });
      }
    }
    return hits.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "en", { numeric: true })).slice(0, limit)
      .map(({ score, ...hit }) => hit);
  }

  /** One variant explained, or the full catalogue. */
  variants(name) {
    if (name) {
      const v = name.replace(/:$/, "");
      const what = this.omnia.describeVariant(v);
      if (what) return { name: v, produces: what };
      const near = this.omnia.suggest(v, "variant");
      return { name: v, unknown: true, hint: near ? `Did you mean "${near}:"?` : "Unknown variant." };
    }
    const g = this.omnia.index.variants;
    return {
      usage: "Variants prefix a utility with a colon and stack left to right: md:hover:bg-primary. A ! before the utility makes it !important (md:!p-0).",
      states: g.pseudoClass,
      pseudoElements: g.pseudoElement,
      media: g.media,
      scrollState: { names: g.scrollState, note: "needs a container-scroll-state ancestor" },
      other: g.other,
      breakpoints: { names: g.breakpoints, forms: ["md:", "max-md:", "min-[600px]:", "max-[600px]:"] },
      containers: { names: g.containers, forms: ["cq-md:", "cq-max-md:", "cq-[400px]:", "cq-md/sidebar: (named container)", "@md: (short form)"], note: "needs a container ancestor (container / cq-inline)" },
      aria: { names: g.aria, forms: ["aria-expanded:", "aria-[sort=ascending]:"] },
      patterns: [
        "group-<state>: / group-<state>/<name>: (parent with class group)",
        "peer-<state>: (earlier sibling with class peer)",
        "has-<state>: / has-[img]: (:has())",
        "not-<state>: / not-md: / not-supports-[…]: (:not() or negated query)",
        "in-[.card]: (inside an ancestor)",
        "data-open: / data-[state=open]:",
        "supports-grid: / supports-[display:grid]:",
        "nth-3: / nth-last-2: / nth-of-type-[2n+1]:",
        "[&>svg]: / [&_p]: / [@media(min-width:900px)]: (arbitrary)",
        "dark: (class .dark, data-theme=\"dark\" or the system setting)",
        "starting: (@starting-style, entry animations)",
      ],
    };
  }

  /**
   * Without a query: the semantic theme (--oc-*), per mode with its hex and the palette color behind it.
   * With a query: matching theme tokens plus matching palette tokens (--color-*), with value and hex.
   */
  tokens(query = "", { limit = 80 } = {}) {
    const q = query.toLowerCase().replace(/^--(oc-)?/, "");
    const mode = (m) => m && { hex: m.hex, palette: m.palette };
    const theme = Object.entries(this.theme).filter(([name]) => !q || name.includes(q))
      .map(([name, m]) => ({ name: `--oc-${name}`, light: mode(m.light), dark: mode(m.dark) }));
    const palette = q ? Object.entries(this.omnia.tokens).filter(([name]) => name.toLowerCase().includes(q)) : [];
    return {
      usage: "Theme tokens switch with light/dark mode; use them in your own CSS as var(--oc-primary). " +
        "Utility classes use the palette: bg-<palette>, text-<palette>, border-<palette> (e.g. palette teal-80 -> bg-teal-80).",
      theme: theme.slice(0, limit),
      palette: { total: palette.length, tokens: palette.slice(0, limit).map(([name, [value, hex]]) => (hex ? { name, value, hex } : { name, value })) },
    };
  }

  /** Tailwind classes -> native OmniaCSS class, or the CSS the migrate plugin generates for them. */
  async tailwind(tokens, { v4 = true } = {}) {
    const migrate = await import("@birdycom/omniacss-migrate");
    const ctx = migrate.createContext({ v4 });
    const index = migrate.loadOmniaIndex();
    return tokens.map((token) => {
      const hit = migrate.nativeFor(token, ctx, index);
      if (hit?.native) return { tailwind: token, omnia: hit.native, how: hit.native === token ? "same name in OmniaCSS" : "native OmniaCSS class" };
      const css = migrate.compileToken(token, ctx);
      if (css) return { tailwind: token, omnia: null, how: "no native class; keep the name with the @birdycom/omniacss-migrate PostCSS/Vite plugin", css };
      return { tailwind: token, omnia: null, how: "not supported (no OmniaCSS equivalent)" };
    });
  }

  /** Docs pages whose title, section headings or keywords match the query. */
  searchDocs(query, { limit = 10 } = {}) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = [];
    for (const page of this.docs) {
      const heads = page.h || [];
      const hay = [page.t, page.g, page.k, ...heads.map((h) => h[1])].join(" ").toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      const title = page.t.toLowerCase();
      const score = words.filter((w) => title.includes(w)).length * 10 + words.filter((w) => (page.g || "").toLowerCase().includes(w)).length;
      const sections = heads.filter((h) => words.some((w) => h[1].toLowerCase().includes(w))).slice(0, 6)
        .map(([id, text]) => ({ title: text, url: `${SITE}${page.u}#${id}` }));
      hits.push({ score, page: { title: page.t, group: page.g, url: SITE + page.u, sections } });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit).map((h) => h.page);
  }

  /** The text of one docs page (or one section of it), fetched live from omniacss.eu. */
  async readDocs(url, { section, maxChars = 15000 } = {}) {
    const target = docsUrl(url);
    const res = await fetch(target, { headers: { "user-agent": `omniacss-mcp/${this.version}` } });
    if (!res.ok) throw new Error(`${target}: HTTP ${res.status}`);
    const html = await res.text();
    const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
    const id = section || new URL(target).hash.slice(1);
    const part = id ? sectionOf(main, id) : main;
    if (part === null) throw new Error(`Section "${id}" not found on ${target}`);
    const text = htmlToText(part);
    return { url: target.split("#")[0] + (id ? `#${id}` : ""), text: text.length > maxChars ? text.slice(0, maxChars) + "\n\n[… truncated: ask for one section]" : text };
  }
}

/** Only pages of omniacss.eu: a path ("/docs/spacing/padding") or a full URL on the site. */
function docsUrl(input) {
  const u = new URL(input, SITE);
  if (u.origin !== SITE) throw new Error(`Only ${SITE} pages can be read.`);
  return u.href;
}

/**
 * The HTML of the element with this id: a heading runs to the next heading of the same or a higher level,
 * any other element to its own closing tag.
 */
export function sectionOf(html, id) {
  const open = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`, "i").exec(html);
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const from = open.index;
  const heading = tag.match(/^h([1-6])$/);
  if (heading) {
    const next = new RegExp(`<h[1-${heading[1]}][\\s>]`, "gi");
    next.lastIndex = from + open[0].length;
    const m = next.exec(html);
    return html.slice(from, m ? m.index : undefined);
  }
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = from + open[0].length;
  for (let depth = 1, m; (m = re.exec(html));) {
    depth += m[1] ? -1 : 1;
    if (!depth) return html.slice(from, m.index + m[0].length);
  }
  return html.slice(from);
}

/** Docs HTML -> readable text: headings as #, code blocks fenced, tables as rows, the rest plain. */
export function htmlToText(html) {
  const entity = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
  const strip = (s) => s.replace(/<[^>]+>/g, "");
  let s = html
    .replace(/<(script|style|svg|template|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<button[\s\S]*?<\/button>/gi, "");
  const blocks = [];
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    // The line-number gutter next to a code sample.
    if (/^[\d\s]*$/.test(strip(code))) return "";
    const lang = code.match(/class="[^"]*language-([\w-]+)/)?.[1] || "";
    blocks.push("```" + lang + "\n" + entity(strip(code)).replace(/\n+$/, "") + "\n```");
    return `\n\u0000${blocks.length - 1}\u0000\n`;
  });
  s = s
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${"#".repeat(+n)} ${strip(t).trim()}\n`)
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, row) => "\n| " + [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => strip(c[1]).replace(/\s+/g, " ").trim()).join(" | ") + " |")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => "`" + strip(c) + "`")
    .replace(/<(br|\/p|\/div|\/section|\/table|\/ul|\/ol|\/dl|dt|dd)[^>]*>/gi, "\n");
  s = entity(strip(s))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
  return s.trim();
}

function closest(name, list) {
  let best = null, bestD = Math.max(2, Math.floor(name.length / 4)) + 1;
  for (const c of list) {
    if (Math.abs(c.length - name.length) >= bestD) continue;
    const d = distance(name, c);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
