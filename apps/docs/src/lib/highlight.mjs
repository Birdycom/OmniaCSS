// File: apps/site/src/lib/highlight.mjs
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

// ---- TSX / JSX ---------------------------------------------------------------------------------------
// Small stateful scanner: code (keywords, strings, numbers, calls) -> JSX tag (name, attributes, {expressions})
// -> JSX children (text, {expressions}, nested tags). Generics such as useState<Item[]> stay code.
const TS_KEYWORDS = new Set("const let var function return import export from default if else for of in await async new class extends implements interface type enum as typeof keyof readonly public private protected static true false null undefined void this super switch case break continue throw try catch finally while do yield delete instanceof satisfies declare namespace".split(" "));
const JSX_TAG_BEFORE = /^$|[(,=:?&|{}[;>!]$/;

function highlightTsx(code) {
  let out = "";
  let i = 0;
  // Frames: { mode: "code", depth, expr } | { mode: "tag", closing } | { mode: "children" }
  const stack = [{ mode: "code", depth: 0 }];
  const at = (re) => { re.lastIndex = i; const m = re.exec(code); return m ? m[0] : null; };
  const emit = (cls, text) => { out += cls ? span(cls, text) : esc(text); i += text.length; };
  const prevSignificant = () => {
    const before = code.slice(0, i).replace(/\s+$/, "");
    return /\b(return|yield|default)$/.test(before) ? "" : before.slice(-1);
  };
  const RE = {
    comment: /\/\*[\s\S]*?\*\/|\/\/[^\n]*/y,
    string: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/y,
    tagOpen: /<\/?[A-Za-z][\w.:-]*/y,
    fragment: /<\/?>/y,
    word: /[A-Za-z_$][\w$]*/y,
    number: /\d+(?:\.\d+)?/y,
    ws: /\s+/y,
    attr: /[A-Za-z_:@$][\w:.$-]*/y,
    tagEnd: /\/?>/y,
    text: /[^<{]+/y,
  };
  while (i < code.length) {
    const top = stack[stack.length - 1];
    let m;
    if (top.mode === "tag") {
      if ((m = at(RE.ws))) emit("", m);
      else if ((m = at(RE.tagEnd))) {
        emit("hl-tag", m);
        stack.pop();
        if (top.closing) { if (stack[stack.length - 1].mode === "children") stack.pop(); }
        else if (m === ">") stack.push({ mode: "children" });
      } else if ((m = at(RE.comment))) emit("hl-comment", m);
      else if ((m = at(RE.string))) emit("hl-string", m);
      else if ((m = at(RE.attr))) emit("hl-attr", m);
      else if (code[i] === "{") { emit("", "{"); stack.push({ mode: "code", depth: 0, expr: true }); }
      else emit("", code[i]);
      continue;
    }
    if (top.mode === "children") {
      if ((m = at(RE.fragment))) { emit("hl-tag", m); if (m === "</>") stack.pop(); else stack.push({ mode: "children" }); }
      else if ((m = at(RE.tagOpen))) { emit("hl-tag", m); stack.push({ mode: "tag", closing: m.startsWith("</") }); }
      else if (code[i] === "{") { emit("", "{"); stack.push({ mode: "code", depth: 0, expr: true }); }
      else if ((m = at(RE.text))) emit("", m);
      else emit("", code[i]);
      continue;
    }
    // Plain TypeScript.
    if ((m = at(RE.comment))) emit("hl-comment", m);
    else if ((m = at(RE.string))) emit("hl-string", m);
    else if (code[i] === "<" && JSX_TAG_BEFORE.test(prevSignificant()) && ((m = at(RE.fragment)) || (m = at(RE.tagOpen)))) {
      emit("hl-tag", m);
      if (m === "<>") stack.push({ mode: "children" });
      else if (m !== "</>") stack.push({ mode: "tag", closing: m.startsWith("</") });
    } else if ((m = at(RE.word))) {
      if (TS_KEYWORDS.has(m)) emit("hl-keyword", m);
      else if (/^\s*\(/.test(code.slice(i + m.length, i + m.length + 4))) emit("hl-function", m);
      else emit("", m);
    } else if ((m = at(RE.number))) emit("hl-number", m);
    else if (code[i] === "{") { top.depth++; emit("", "{"); }
    else if (code[i] === "}") {
      if (top.depth === 0 && top.expr) stack.pop();
      else top.depth = Math.max(0, top.depth - 1);
      emit("", "}");
    } else emit("", code[i]);
  }
  return out;
}

// ---- Vue SFC: <script> as TypeScript, <style> as CSS, the rest (template) as HTML -----------------------
function highlightVue(code) {
  let out = "";
  let last = 0;
  for (const m of code.matchAll(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/g)) {
    out += highlightHtml(code.slice(last, m.index));
    out += highlightHtml(m[1]) + (m[2] === "script" ? highlightTsx(m[3]) : highlightCss(m[3])) + highlightHtml(m[4]);
    last = m.index + m[0].length;
  }
  return out + highlightHtml(code.slice(last));
}

// ---- PHP ---------------------------------------------------------------------------------------------
const PHP_KEYWORDS = "abstract|and|array|as|break|case|catch|class|clone|const|continue|declare|default|do|echo|else|elseif|empty|enum|extends|final|finally|fn|for|foreach|function|global|if|implements|include|instanceof|insteadof|interface|isset|list|match|namespace|new|or|private|protected|public|readonly|require|require_once|return|static|switch|throw|trait|try|unset|use|while|yield|true|false|null|self|parent|void|string|int|float|bool|mixed|never|iterable|object|callable";
const PHP_RE = new RegExp(String.raw`(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#(?!\[)[^\n]*)|(#\[[^\]\n]*\])|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|(<\?php|\?>)|(\$[A-Za-z_]\w*)|\b(${PHP_KEYWORDS})\b|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()`, "g");

function highlightPhp(code) {
  let out = "";
  let last = 0;
  for (const m of code.matchAll(PHP_RE)) {
    out += esc(code.slice(last, m.index));
    const [all, comment, attribute, str, tag, variable, kw, num, fn] = m;
    if (comment) out += span("hl-comment", all);
    else if (attribute) out += span("hl-attr", all);
    else if (str) out += span("hl-string", all);
    else if (tag || kw) out += span("hl-keyword", all);
    else if (variable) out += span("hl-variable", all);
    else if (num) out += span("hl-number", all);
    else if (fn) out += span("hl-function", all);
    else out += esc(all);
    last = m.index + all.length;
  }
  return out + esc(code.slice(last));
}

// ---- Blade (and Livewire views) ------------------------------------------------------------------------
// HTML with <x-…> component tags, {{-- comments --}}, {{ echo }} / {!! raw !!}, @directives(…) and @php … @endphp.
// wire:* and Alpine (x-*, @event) attributes get the property color so the Livewire binding stands out.
function highlightBladeTag(tag) {
  const [, open, name, rest, close] = tag.match(/^(<\/?)([A-Za-z][\w:.-]*)([\s\S]*?)(\/?>)$/);
  const attrs = rest.replace(/([^\s=]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)|([^\s=]+)|(\s+)/g, (all, n, eq, v, bare, ws) => {
    if (ws) return ws;
    const cls = /^(wire:|x-|@)/.test(n || bare) ? "hl-prop" : "hl-attr";
    return bare ? span(cls, bare) : span(cls, n) + esc(eq) + span("hl-string", v);
  });
  return span("hl-tag", open + name) + attrs + span("hl-tag", close);
}

/** Index just after the parenthesised group that starts at `from` (code[from] === "("), quotes respected. */
function matchParen(code, from) {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    const c = code[i];
    if (c === "'" || c === '"') { const end = code.indexOf(c, i + 1); if (end < 0) return code.length; i = end; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return code.length;
}

const BLADE_RE = /\{\{--[\s\S]*?--\}\}|<!--[\s\S]*?-->|\{!![\s\S]*?!!\}|\{\{[\s\S]*?\}\}|@php\b(?!\s*\()[\s\S]*?@endphp|(?<![\w@.])@[A-Za-z]\w*|<\?php[\s\S]*?(?:\?>|$)|<\/?[A-Za-z][\w:.-]*(?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/g;

function highlightBlade(code) {
  const re = new RegExp(BLADE_RE.source, "g");
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    let tok = m[0];
    if (tok.startsWith("{{--") || tok.startsWith("<!--")) out += span("hl-comment", tok);
    else if (tok.startsWith("{!!")) out += span("hl-keyword", "{!!") + highlightPhp(tok.slice(3, -3)) + span("hl-keyword", "!!}");
    else if (tok.startsWith("{{")) out += span("hl-keyword", "{{") + highlightPhp(tok.slice(2, -2)) + span("hl-keyword", "}}");
    else if (tok.startsWith("@php")) out += span("hl-keyword", "@php") + highlightPhp(tok.slice(4, -7)) + span("hl-keyword", "@endphp");
    else if (tok.startsWith("@")) {
      out += span("hl-keyword", tok);
      // Arguments of a directive: @if ($a), @foreach ($items as $item), @props([...])
      const ws = code.slice(re.lastIndex).match(/^[ \t]*/)[0];
      if (code[re.lastIndex + ws.length] === "(") {
        const end = matchParen(code, re.lastIndex + ws.length);
        out += esc(ws) + highlightPhp(code.slice(re.lastIndex + ws.length, end));
        re.lastIndex = end;
        tok = code.slice(m.index, end);
      }
    } else if (tok.startsWith("<?php")) out += highlightPhp(tok);
    else out += highlightBladeTag(tok);
    last = m.index + tok.length;
  }
  return out + esc(code.slice(last));
}

/**
 * Livewire tab: a component class and its Blade view in one snippet. A line that starts with `<?php` opens a PHP part,
 * a line that is only a Blade comment ({{-- resources/views/livewire/profile.blade.php --}}) opens a Blade part.
 */
export function splitLivewire(code) {
  const parts = [];
  for (const line of code.split("\n")) {
    const kind = /^<\?php\b/.test(line) ? "php" : /^\{\{--.*--\}\}\s*$/.test(line) ? "blade" : null;
    if (kind || !parts.length) parts.push({ lang: kind || "blade", lines: [] });
    parts[parts.length - 1].lines.push(line);
  }
  return parts.map((p) => ({ lang: p.lang, code: p.lines.join("\n") }));
}

function highlightLivewire(code) {
  return splitLivewire(code).map((p) => (p.lang === "php" ? highlightPhp(p.code) : highlightBlade(p.code))).join("\n");
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
  if (lang === "tsx" || lang === "jsx" || lang === "react") return highlightTsx(code);
  if (lang === "vue") return highlightVue(code);
  if (lang === "blade") return highlightBlade(code);
  if (lang === "livewire") return highlightLivewire(code);
  if (lang === "php") return /^\s*(<\?php|namespace\s|use\s|class\s)/m.test(code) ? highlightPhp(code) : highlightBlade(code);
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
