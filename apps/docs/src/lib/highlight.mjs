// File: apps/docs/src/lib/highlight.mjs
// Build-time syntax highlighting for the Code-block component (no JavaScript in the browser).
// Output uses the Omnia theme classes from @birdycom/omniaui/code-block.css:
// hl-tag, hl-attr, hl-string, hl-comment, hl-prop, hl-value, hl-keyword, hl-number, hl-variable, hl-function, cls.
// Map: escape -> language detection -> tokenizers (html, css, js/shell) -> code block markup

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls, text) => `<span class="${cls}">${esc(text)}</span>`;

/** Guess the language of a snippet when no lang attribute is given. */
export function detectLang(code) {
  const t = code.trim();
  if (/^\s*</.test(t) && /<\/?[a-z][\w-]*[\s>/]/i.test(t)) return "html";
  if (/^(npm|npx|node|git|cd|cp|mv|rm|composer|php|curl)\b/m.test(t)) return "shell";
  if (/(^|\n)\s*[@.#:\w-][^{}\n]*\{[\s\S]*:[^;]*;/.test(t) || /^\s*(@use|@include|@each|\$[\w-]+\s*:)/m.test(t)) return "css";
  if (/\b(const|let|var|function|import|export|return)\b/.test(t)) return "js";
  return "text";
}

function highlightHtml(code) {
  let out = "";
  const re = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w:-]*(?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/g;
  let last = 0;
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index));
    const tag = m[0];
    if (tag.startsWith("<!--")) {
      out += span("hl-comment", tag);
    } else {
      const [, open, name, rest, close] = tag.match(/^(<\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?>)$/);
      const attrs = rest.replace(/([^\s=]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)|([^\s=]+)|(\s+)/g, (all, n, eq, v, bare, ws) => {
        if (ws) return ws;
        if (bare) return span("hl-attr", bare);
        return span("hl-attr", n) + esc(eq) + span("hl-string", v);
      });
      out += span("hl-tag", open + name) + attrs + span("hl-tag", close);
    }
    last = m.index + tag.length;
  }
  return out + esc(code.slice(last));
}

function highlightCss(code) {
  // comments, strings, at-rules, selectors (before {), properties (before :) and values (until ;)
  const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("[^"]*"|'[^']*')|(@[\w-]+)|(\$[\w-]+|--[\w-]+)|([\w-]+)(?=\s*:(?!:)[^{;]*;)|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|rem|em|%|vh|vw|ms|s|deg|fr|ch)?)|([.#][\w\\:/.-]+)/g;
  let out = "";
  let last = 0;
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index));
    const [all, comment, str, at, variable, prop, num, cls] = m;
    if (comment) out += span("hl-comment", all);
    else if (str) out += span("hl-string", all);
    else if (at) out += span("hl-keyword", all);
    else if (variable) out += span("hl-variable", all);
    else if (prop) out += span("hl-prop", all);
    else if (num) out += span("hl-number", all);
    else if (cls) out += span("cls", all);
    else out += esc(all);
    last = m.index + all.length;
  }
  return out + esc(code.slice(last));
}

function highlightJs(code, shell = false) {
  const keywords = shell
    ? "npm|npx|node|git|cd|cp|mv|rm|run|install|build|init|add|list|export|composer|php"
    : "const|let|var|function|return|import|export|from|default|if|else|for|of|in|await|async|new|class|extends|true|false|null|undefined";
  const re = new RegExp(`(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|${shell ? "#[^\\n]*" : "(?!)"})|("(?:\\\\.|[^"])*"|'(?:\\\\.|[^'])*'|\`(?:\\\\.|[^\`])*\`)|\\b(${keywords})\\b|(\\b\\d+(?:\\.\\d+)?\\b)|(--?[\\w-]+)`, "g");
  let out = "";
  let last = 0;
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index));
    const [all, comment, str, kw, num, flag] = m;
    if (comment) out += span("hl-comment", all);
    else if (str) out += span("hl-string", all);
    else if (kw) out += span("hl-keyword", all);
    else if (num) out += span("hl-number", all);
    else if (flag && shell) out += span("hl-attr", all);
    else out += esc(all);
    last = m.index + all.length;
  }
  return out + esc(code.slice(last));
}

/** Remove common indentation and leading/trailing blank lines. */
export function dedent(code) {
  const lines = code.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join("\n");
}

export function highlight(code, lang = detectLang(code)) {
  if (lang === "html" || lang === "xml" || lang === "astro") return highlightHtml(code);
  if (lang === "css" || lang === "scss") return highlightCss(code);
  if (lang === "js" || lang === "javascript" || lang === "json" || lang === "ts") return highlightJs(code);
  if (lang === "shell" || lang === "bash" || lang === "sh") return highlightJs(code, true);
  return esc(code);
}

/** Full Code-block component markup (gutter with line numbers + highlighted code). */
export function codeBlock(rawCode, lang) {
  const code = dedent(rawCode);
  const language = lang || detectLang(code);
  const lines = code.split("\n").length;
  const gutter = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  return `<div class="oc-code-block" data-lang="${language}"><pre class="oc-code-block__gutter" aria-hidden="true">${gutter}</pre><pre class="code-preview"><code>${highlight(code, language)}</code></pre><button type="button" class="oc-code-copy" data-oc-copy aria-label="Copy code">Copy</button></div>`;
}
