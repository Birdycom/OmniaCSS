// File: packages/vscode/src/lib/regions.cjs
// Finds the places in a document where OmniaCSS classes are written, without a parser per language.
// Plain attributes (class="…") are one class list; bound attributes (:class, className={…}, class:list) and
// helper calls (clsx(…), @class([…]), classList.add(…)) are expressions whose string literals hold classes.
// Map: openers (regex) -> plain value | expression scan (string literals) -> regions -> tokens
// Author: Serge Cools | Framework: OmniaCSS

"use strict";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Characters a class token may contain (same set the engine scans for). */
const TOKEN_CHARS = /^[A-Za-z0-9_\-:/.%@!\[\]()=&>*~+,#$^|']+$/;

/**
 * @param {{ attributes: string[], functions: string[] }} options
 *   attributes: names whose value is a class list; names starting with `:`, `v-bind:`, `x-bind:` or `[`,
 *   and any value written as {…}, are read as an expression.
 */
function createFinder({ attributes, functions }) {
  const attr = attributes.map(esc).join("|");
  const fn = functions.map((f) => (/^\w/.test(f) ? "\\b" : "") + esc(f)).join("|");
  // group 1: attribute name, group 2: opening quote or {  |  group 3: helper call
  const opener = new RegExp(`(?:(?<=[\\s<"'{(,])(${attr})\\s*=\\s*(["'\`{])|(${fn}|\\bclassList\\.(?:add|remove|toggle|replace|contains))\\s*\\()`, "g");

  /**
   * All class regions in `text`: [{ start, end, open }] with offsets of the string content.
   * `open` marks a region that runs to the end of the text (the user is still typing it).
   */
  function regions(text) {
    const out = [];
    opener.lastIndex = 0;
    let m;
    while ((m = opener.exec(text))) {
      const from = m.index + m[0].length;
      let end;
      if (m[1] !== undefined) {
        const name = m[1], q = m[2];
        const expression = q === "{" || /^(:|v-bind:|x-bind:|\[)/.test(name) || name === "class:list";
        if (!expression) {
          end = text.indexOf(q, from);
          out.push(end === -1 ? { start: from, end: text.length, open: true } : { start: from, end });
          if (end === -1) break;
          opener.lastIndex = end + 1;
          continue;
        }
        end = scanExpression(text, from, q === "{" ? "}" : q, out);
      } else {
        end = scanExpression(text, from, ")", out);
      }
      opener.lastIndex = Math.max(end, from);
    }
    return out;
  }

  return { regions };
}

/**
 * Collect the string literals of a JS/PHP expression until `close` at depth 0 (or the attribute quote).
 * Template literals keep their text but skip `${…}` parts. Returns the offset after the expression.
 */
function scanExpression(text, i, close, out) {
  const isQuoteClose = close === '"' || close === "'" || close === "`";
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isQuoteClose && ch === close && depth === 0) return i + 1;
    if (!isQuoteClose && depth === 0 && ch === close) return i + 1;
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) return i + 1; // unbalanced: stop here
      depth--;
    } else if ((ch === '"' || ch === "'" || ch === "`") && ch !== close) {
      i = scanString(text, i + 1, ch, out);
      continue;
    }
    i++;
  }
  return i;
}

/** One string literal starting at `i` (after the quote). Pushes its parts; returns the offset after it. */
function scanString(text, i, q, out) {
  let start = i;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch === q) { if (i > start) out.push({ start, end: i }); return i + 1; }
    if (q === "`" && ch === "$" && text[i + 1] === "{") {
      // `${cond ? 'a' : 'b'}`: the interpolation is an expression with its own literals.
      if (i > start) out.push({ start, end: i });
      i = start = scanExpression(text, i + 2, "}", out);
      continue;
    }
    if (ch === "\n" && q !== "`") break; // unterminated '…' or "…"
    i++;
  }
  out.push({ start, end: i, open: i >= text.length });
  return i;
}

/** Whitespace-separated class tokens inside a region: [{ token, start, end }] (absolute offsets). */
function tokensIn(text, region) {
  const out = [];
  const body = text.slice(region.start, region.end);
  for (const m of body.matchAll(/\S+/g)) {
    let token = m[0], start = region.start + m.index;
    // Strip trailing punctuation that belongs to the host language (PHP `=>` keys, commas).
    const trimmed = token.replace(/^[,]+|[,]+$/g, "");
    start += token.indexOf(trimmed);
    token = trimmed;
    if (!token || !TOKEN_CHARS.test(token) || token.includes("'") || /^[$#]/.test(token)) continue;
    out.push({ token, start, end: start + token.length });
  }
  return out;
}

/** The token being typed at `offset` (text since the last whitespace inside the region). */
function partialAt(text, region, offset) {
  const before = text.slice(region.start, offset);
  const m = before.match(/\S*$/);
  return { partial: m[0], start: offset - m[0].length };
}

module.exports = { createFinder, tokensIn, partialAt, scanExpression };
