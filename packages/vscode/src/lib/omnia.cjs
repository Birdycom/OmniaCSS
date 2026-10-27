// File: packages/vscode/src/lib/omnia.cjs
// The OmniaCSS knowledge the editor features share: the class index, variant resolution and generated CSS.
// CSS for `md:hover:!bg-x` is derived from the base utility exactly like the on-demand engine does it.
// Map: load (index.json.gz + engine variants.mjs) -> analyze(token) -> cssFor(token) -> suggest(name)
// Author: Serge Cools | Framework: OmniaCSS

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { pathToFileURL } = require("node:url");

const DIST = path.resolve(__dirname, "../../dist");

/** @returns {Promise<Omnia>} */
async function load(dist = DIST) {
  const index = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dist, "index.json.gz"))).toString("utf8"));
  const variants = await import(pathToFileURL(path.join(dist, "variants.mjs")).href);
  return new Omnia(index, variants);
}

class Omnia {
  constructor(index, variants) {
    this.index = index;
    this.v = variants;
    this.classes = index.classes;
    this.colors = index.colors;
    this.tokens = index.tokens;
    this.nativeOnly = new Set(index.nativeOnly);
    this.names = Object.keys(index.classes).sort(natural);
    this.variantNames = this.#variantList();
  }

  has(base) {
    return Object.hasOwn(this.classes, base);
  }

  /**
   * Split a token into variants + base and check both.
   * @returns {{ token, variants: string[], base: string, important: boolean, unknownVariant?: string, known: boolean } | null}
   */
  analyze(token) {
    const parts = this.v.splitTop(token, ":");
    let base = parts.pop();
    if (!base) return null;
    let important = false;
    if (base.startsWith("!")) { important = true; base = base.slice(1); }
    else if (base.endsWith("!")) { important = true; base = base.slice(0, -1); }
    const out = { token, variants: parts, base, important, known: false };
    if (parts.some((p) => !p)) return { ...out, unknownVariant: "" };
    for (const name of parts) {
      if (!this.v.applyVariant(name, [{ sel: "&", at: [] }])) return { ...out, unknownVariant: name };
    }
    out.known = this.has(base) || this.nativeOnly.has(token);
    return out;
  }

  /** CSS text for a token (with variants), or null for unknown tokens. */
  cssFor(token, { rem = 16, pixels = true } = {}) {
    const a = this.analyze(token);
    if (!a || a.unknownVariant !== undefined) return null;
    const entries = this.classes[a.base];
    if (!entries) return null;
    const branches = a.variants.length ? this.v.resolveVariants(a.variants) : [{ sel: "&", at: [] }];
    if (!branches) return null;
    const blocks = [];
    for (const branch of branches) {
      const target = branch.sel.replace(/&/g, "." + this.v.esc(token));
      for (const [chain, tpl, decls] of entries) {
        const lines = decls.map(([prop, value, imp, comment]) => {
          let line = `${prop}: ${value}${imp || a.important ? " !important" : ""};`;
          if (comment) line += ` /* ${comment} */`;
          else if (pixels) {
            const px = remToPx(value, rem);
            if (px) line += ` /* ${px} */`;
          }
          return line;
        });
        if (/::(?:before|after)$/.test(branch.sel) && !decls.some(([p]) => p === "content")) lines.unshift('content: "";');
        blocks.push(wrap(tpl.replace("&", target), lines, orderAt([...chain, ...branch.at])));
      }
    }
    return blocks.join("\n\n");
  }

  /** Short summary for completion details: `padding: 2rem`. */
  summary(base) {
    const entries = this.classes[base];
    if (!entries) return "";
    const decls = entries[0][2].map(([p, v]) => `${p}: ${v}`);
    return decls.length > 2 ? decls.slice(0, 2).join("; ") + "; …" : decls.join("; ");
  }

  /** What a variant does, e.g. `&:hover` or `@media (min-width: 50rem)`. */
  describeVariant(name) {
    const b = this.v.resolveVariants([name]);
    if (!b) return "";
    return b.map((x) => [...x.at, x.sel === "&" ? "" : x.sel].filter(Boolean).join(" › ")).join("\n");
  }

  /** Closest known names for a typo (variants or utilities with the same first segment). */
  suggest(name, pool = "class") {
    const list = pool === "variant" ? this.variantNames : this.#family(name);
    let best = null, bestD = Math.max(2, Math.floor(name.length / 4)) + 1;
    for (const c of list) {
      if (Math.abs(c.length - name.length) >= bestD) continue;
      const d = levenshtein(name, c, bestD);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  #family(name) {
    const head = name.split("-")[0];
    const fam = this.names.filter((n) => n.split("-")[0] === head);
    return fam.length ? fam : this.names.filter((n) => n[0] === name[0]);
  }

  #variantList() {
    const g = this.index.variants;
    const states = [...g.pseudoClass];
    return [
      ...states, ...g.pseudoElement, ...g.media, ...g.scrollState, ...g.other,
      ...g.breakpoints, ...g.breakpoints.map((b) => "max-" + b),
      ...g.containers.map((c) => "cq-" + c), ...g.containers.map((c) => "cq-max-" + c),
      ...g.aria.map((a) => "aria-" + a),
      ...states.map((s) => "group-" + s), ...states.map((s) => "peer-" + s),
      ...states.map((s) => "has-" + s), ...states.map((s) => "not-" + s),
    ];
  }
}

/** Order at-rules like the engine: @starting-style wraps the rule directly. */
function orderAt(chain) {
  return [...chain.filter((a) => !/^@starting-style/.test(a)), ...chain.filter((a) => /^@starting-style/.test(a))];
}

function wrap(selector, lines, at) {
  let css = `${selector} {\n${lines.map((l) => "  " + l).join("\n")}\n}`;
  for (let i = at.length - 1; i >= 0; i--) css = `${at[i]} {\n${css.replace(/^/gm, "  ")}\n}`;
  return css;
}

function remToPx(value, rem) {
  if (!/\d(?:\.\d+)?rem\b/.test(value) || /calc|var|clamp|min\(|max\(/.test(value)) return "";
  return value.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${+(parseFloat(n) * rem).toFixed(2)}px`);
}

/** Natural sort: p-2 before p-10. */
function natural(a, b) {
  return a.localeCompare(b, "en", { numeric: true });
}

function levenshtein(a, b, max) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin >= max) return max;
    prev = cur;
  }
  return prev[b.length];
}

module.exports = { load, Omnia, natural };
