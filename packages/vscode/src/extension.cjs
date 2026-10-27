// File: packages/vscode/src/extension.cjs
// OmniaCSS IntelliSense for VS Code and Cursor: completions, hover CSS, color swatches + picker, linting, quick fixes.
// Map: settings -> lazy index (lib/omnia.cjs) -> class regions (lib/regions.cjs) -> providers -> diagnostics
// Author: Serge Cools | Framework: OmniaCSS

"use strict";

const vscode = require("vscode");
const { load } = require("./lib/omnia.cjs");
const { createFinder, tokensIn, partialAt } = require("./lib/regions.cjs");
const { hexToRgba, distance } = require("./lib/color.cjs");

const CLASS_LANGUAGES = [
  "html", "php", "blade", "vue", "svelte", "astro", "javascript", "javascriptreact", "typescript", "typescriptreact",
  "markdown", "mdx", "twig", "handlebars", "erb", "django-html", "jinja-html", "nunjucks", "liquid", "razor",
  "aspnetcorerazor", "edge", "templ", "gohtml", "html-eex", "heex", "elixir",
];
const CSS_LANGUAGES = ["css", "scss", "sass", "less", "postcss"];
const TRIGGERS = ['"', "'", "`", " ", ":", "-", "!", "/", "[", "("];
const VAR_TOKEN = /var\(\s*(--[\w-]+)/g;
const MAX_SCAN = 2_000_000;

let omniaPromise;
let log;

/** The index loads once, on the first request that needs it (~0.3 s). */
function omnia() {
  omniaPromise ??= (async () => {
    const t = Date.now();
    const o = await load();
    log.appendLine(`OmniaCSS ${o.index.version}: ${o.names.length} utilities indexed in ${Date.now() - t} ms`);
    return o;
  })().catch((err) => {
    log.appendLine("Could not load the OmniaCSS index: " + (err?.stack || err));
    omniaPromise = undefined;
    throw err;
  });
  return omniaPromise;
}

function settings(doc) {
  const c = vscode.workspace.getConfiguration("omniacss", doc);
  return {
    enable: c.get("enable", true),
    attributes: c.get("classAttributes", []),
    functions: c.get("classFunctions", []),
    languages: c.get("includeLanguages", []),
    colors: c.get("colorDecorators", true),
    pixels: c.get("showPixelEquivalents", true),
    rem: c.get("rootFontSize", 16),
    lint: {
      unknownVariant: c.get("lint.unknownVariant", "warning"),
      unknownUtility: c.get("lint.unknownUtility", "warning"),
      unknownClass: c.get("lint.unknownClass", "ignore"),
      duplicateClass: c.get("lint.duplicateClass", "warning"),
    },
  };
}

const finders = new Map();
function finderFor(s) {
  const key = JSON.stringify([s.attributes, s.functions]);
  if (!finders.has(key)) finders.set(key, createFinder({ attributes: s.attributes, functions: s.functions }));
  return finders.get(key);
}

const isCss = (doc) => CSS_LANGUAGES.includes(doc.languageId);
const isClassDoc = (doc, s) => CLASS_LANGUAGES.includes(doc.languageId) || s.languages.includes(doc.languageId);

/** Regions + tokens of the whole document, cached per version. */
const docCache = new WeakMap();
function scan(doc, s) {
  const hit = docCache.get(doc);
  if (hit && hit.version === doc.version) return hit;
  const text = doc.getText();
  const regions = text.length > MAX_SCAN || isCss(doc) ? [] : finderFor(s).regions(text);
  const result = { version: doc.version, text, regions, tokens: regions.map((r) => tokensIn(text, r)) };
  docCache.set(doc, result);
  return result;
}

/** Class region around `offset`, looked up in a window so long files stay fast while typing. */
function regionAt(doc, offset, s, after = 0) {
  const from = Math.max(0, offset - 8000);
  const to = Math.min(doc.getText().length, offset + after);
  const text = doc.getText(new vscode.Range(doc.positionAt(from), doc.positionAt(to)));
  const rel = offset - from;
  const region = finderFor(s).regions(text).find((r) => r.start <= rel && rel <= r.end);
  return region ? { text, from, region } : null;
}

const severity = (level) =>
  ({ error: vscode.DiagnosticSeverity.Error, warning: vscode.DiagnosticSeverity.Warning, info: vscode.DiagnosticSeverity.Information, hint: vscode.DiagnosticSeverity.Hint })[level];

/** VS Code only draws completion swatches for #rgb, #rrggbb and rgb()/rgba(). */
function swatch(hex) {
  if (hex.length === 7) return hex;
  const [r, g, b, a] = hexToRgba(hex);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${+a.toFixed(2)})`;
}

const cssBlock = (css) => new vscode.MarkdownString().appendCodeblock(css, "css");

// ---------------------------------------------------------------------------------------------------------------
// Completions

const VARIANT_SNIPPETS = [
  ["data-[…]:", "data-[${1:state=open}]:", "Attribute selector [data-…]"],
  ["aria-[…]:", "aria-[${1:sort=ascending}]:", "Attribute selector [aria-…]"],
  ["has-[…]:", "has-[${1:img}]:", ":has(…)"],
  ["not-[…]:", "not-[${1:.active}]:", ":not(…)"],
  ["in-[…]:", "in-[${1:.card}]:", "Inside an ancestor that matches"],
  ["supports-[…]:", "supports-[${1:display:grid}]:", "@supports (…)"],
  ["min-[…]:", "min-[${1:600px}]:", "@media (min-width: …)"],
  ["max-[…]:", "max-[${1:600px}]:", "@media (width < …)"],
  ["cq-[…]:", "cq-[${1:400px}]:", "@container (min-width: …)"],
  ["nth-[…]:", "nth-[${1:3n+1}]:", ":nth-child(…)"],
  ["group-…/name:", "group-${1:hover}/${2:card}:", "Named group"],
  ["[&…]:", "[${1:&>*}]:", "Arbitrary selector"],
];

function classCompletions(o, doc, position, s, found) {
  const offset = doc.offsetAt(position);
  const { partial, start } = partialAt(found.text, found.region, offset - found.from);
  if (/[\[\]]/.test(partial.slice(partial.lastIndexOf(":") + 1))) return null;
  const parts = o.v.splitTop(partial, ":");
  let current = parts.pop();
  let curStart = found.from + start + (partial.length - current.length);
  if (current.startsWith("!")) { current = current.slice(1); curStart++; }
  const range = new vscode.Range(doc.positionAt(curStart), position);
  const sortKey = (n) => n.replace(/\d+/g, (d) => d.padStart(5, "0"));

  const items = [];
  for (const name of o.names) {
    const color = o.colors[name];
    const item = new vscode.CompletionItem(name, color ? vscode.CompletionItemKind.Color : vscode.CompletionItemKind.Constant);
    item.range = range;
    item.sortText = "a" + sortKey(name);
    if (color) item.documentation = swatch(color[0]);
    item.omnia = { prefix: parts, name };
    items.push(item);
  }
  const retrigger = { command: "editor.action.triggerSuggest", title: "" };
  for (const name of o.variantNames) {
    const item = new vscode.CompletionItem(name + ":", vscode.CompletionItemKind.Module);
    item.range = range;
    item.sortText = "b" + sortKey(name);
    item.command = retrigger;
    item.omnia = { variant: name };
    items.push(item);
  }
  for (const [label, snippet, doc_] of VARIANT_SNIPPETS) {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
    item.insertText = new vscode.SnippetString(snippet);
    item.filterText = label.replace(/[…]/g, "");
    item.range = range;
    item.sortText = "c" + label;
    item.detail = doc_;
    items.push(item);
  }
  return new vscode.CompletionList(items, false);
}

function varCompletions(o, doc, position) {
  const line = doc.lineAt(position.line).text.slice(0, position.character);
  const m = line.match(/var\(\s*(-{0,2}[\w-]*)$/);
  if (!m) return null;
  const range = new vscode.Range(position.translate(0, -m[1].length), position);
  const items = [];
  for (const [name, [value, hex]] of Object.entries(o.tokens)) {
    const item = new vscode.CompletionItem(name, hex ? vscode.CompletionItemKind.Color : vscode.CompletionItemKind.Variable);
    item.range = range;
    item.sortText = name.replace(/\d+/g, (d) => d.padStart(5, "0"));
    item.detail = value;
    if (hex) item.documentation = swatch(hex);
    items.push(item);
  }
  return new vscode.CompletionList(items, false);
}

const completionProvider = {
  async provideCompletionItems(doc, position) {
    const s = settings(doc);
    if (!s.enable) return null;
    const o = await omnia();
    const vars = varCompletions(o, doc, position);
    if (vars) return vars;
    if (!isClassDoc(doc, s)) return null;
    const found = regionAt(doc, doc.offsetAt(position), s);
    return found ? classCompletions(o, doc, position, s, found) : null;
  },
  async resolveCompletionItem(item) {
    const o = await omnia();
    const s = settings();
    if (item.omnia?.name) {
      const { prefix, name } = item.omnia;
      const token = [...prefix, name].join(":");
      const css = o.cssFor(token, s) || o.cssFor(name, s) || "";
      // Color items keep the color string as documentation (VS Code draws the swatch from it), so their CSS goes in detail.
      if (item.documentation) item.detail = css;
      else {
        item.detail = o.summary(name);
        item.documentation = cssBlock(css);
      }
    } else if (item.omnia?.variant) {
      item.detail = o.describeVariant(item.omnia.variant);
    }
    return item;
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Hover

const hoverProvider = {
  async provideHover(doc, position) {
    const s = settings(doc);
    if (!s.enable) return null;
    const o = await omnia();

    const varRange = doc.getWordRangeAtPosition(position, /--[\w-]+/);
    if (varRange) {
      const name = doc.getText(varRange);
      const t = o.tokens[name];
      if (t) {
        const md = cssBlock(`${name}: ${t[0]};`);
        if (t[1]) md.appendMarkdown(`sRGB \`${t[1]}\``);
        return new vscode.Hover(md, varRange);
      }
    }
    if (!isClassDoc(doc, s)) return null;
    const offset = doc.offsetAt(position);
    const found = regionAt(doc, offset, s, 2000);
    if (!found) return null;
    const rel = offset - found.from;
    const tok = tokensIn(found.text, found.region).find((t) => t.start <= rel && rel <= t.end);
    if (!tok) return null;
    const css = o.cssFor(tok.token, s);
    if (!css) return null;
    const md = cssBlock(css);
    const base = o.analyze(tok.token)?.base;
    const color = base && o.colors[base];
    if (color?.[1]) md.appendMarkdown(`\`${color[1]}\` · sRGB \`${color[0]}\``);
    const range = new vscode.Range(doc.positionAt(found.from + tok.start), doc.positionAt(found.from + tok.end));
    return new vscode.Hover(md, range);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Colors: swatches for color classes and var(--color-…), the picker swaps to the nearest Omnia color

let colorGroups;
function groupsOf(o) {
  if (colorGroups) return colorGroups;
  colorGroups = { classes: new Map(), tokens: [] };
  for (const [cls, [hex, token]] of Object.entries(o.colors)) {
    if (!token) continue;
    const name = token.slice("--color-".length);
    if (!cls.endsWith(name)) continue;
    const prefix = cls.slice(0, -name.length);
    if (!colorGroups.classes.has(prefix)) colorGroups.classes.set(prefix, []);
    colorGroups.classes.get(prefix).push({ name, rgba: hexToRgba(hex) });
  }
  for (const [name, [, hex]] of Object.entries(o.tokens)) if (hex && name.startsWith("--color-")) colorGroups.tokens.push({ name, rgba: hexToRgba(hex) });
  return colorGroups;
}

const isMix = (name) => /-mix-\d+$/.test(name);

function nearest(list, rgba, mix) {
  let best = null, bestD = Infinity;
  for (const c of list) {
    if (isMix(c.name) !== mix) continue;
    const d = distance(c.rgba, rgba);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

const colorProvider = {
  async provideDocumentColors(doc) {
    const s = settings(doc);
    if (!s.enable || !s.colors) return [];
    const o = await omnia();
    const out = [];
    const toColor = (hex) => { const [r, g, b, a] = hexToRgba(hex); return new vscode.Color(r, g, b, a); };
    const { text, tokens } = scan(doc, s);
    for (const list of tokens) {
      for (const t of list) {
        const a = o.analyze(t.token);
        const color = a && a.unknownVariant === undefined && o.colors[a.base];
        if (color) out.push(new vscode.ColorInformation(new vscode.Range(doc.positionAt(t.start), doc.positionAt(t.end)), toColor(color[0])));
      }
    }
    // CSS languages already draw literal colors; only the Omnia tokens are added.
    if (text.length <= MAX_SCAN) {
      for (const m of text.matchAll(VAR_TOKEN)) {
        const hex = o.tokens[m[1]]?.[1];
        if (!hex) continue;
        const start = m.index + m[0].indexOf(m[1]);
        out.push(new vscode.ColorInformation(new vscode.Range(doc.positionAt(start), doc.positionAt(start + m[1].length)), toColor(hex)));
      }
    }
    return out;
  },
  async provideColorPresentations(color, { document, range }) {
    const o = await omnia();
    const g = groupsOf(o);
    const rgba = [color.red, color.green, color.blue, color.alpha];
    const current = document.getText(range);
    if (current.startsWith("--")) {
      const hit = nearest(g.tokens, rgba, isMix(current));
      return hit ? [new vscode.ColorPresentation(hit.name)] : [];
    }
    const a = o.analyze(current);
    const token = a && o.colors[a.base]?.[1];
    if (!token) return [];
    const name = token.slice("--color-".length);
    const prefix = a.base.slice(0, -name.length);
    const hit = nearest(g.classes.get(prefix) || [], rgba, isMix(name));
    if (!hit) return [];
    const at = current.lastIndexOf(a.base);
    return [new vscode.ColorPresentation(current.slice(0, at) + prefix + hit.name + current.slice(at + a.base.length))];
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Diagnostics + quick fixes

async function lint(doc, collection) {
  const s = settings(doc);
  if (!s.enable || !isClassDoc(doc, s)) { collection.delete(doc.uri); return; }
  const o = await omnia();
  const { tokens } = scan(doc, s);
  const diags = [];
  const add = (start, end, message, level, code) => {
    const sev = severity(level);
    if (sev === undefined) return;
    const d = new vscode.Diagnostic(new vscode.Range(doc.positionAt(start), doc.positionAt(end)), message, sev);
    d.source = "omniacss";
    d.code = code;
    if (code === "duplicate-class") d.tags = [vscode.DiagnosticTag.Unnecessary];
    diags.push(d);
  };
  for (const list of tokens) {
    const seen = new Set();
    for (const t of list) {
      if (seen.has(t.token)) add(t.start, t.end, `Duplicate class '${t.token}'.`, s.lint.duplicateClass, "duplicate-class");
      seen.add(t.token);
      const hasVariant = t.token.includes(":") || t.token.startsWith("!") || t.token.endsWith("!");
      if (!hasVariant) {
        if (s.lint.unknownClass !== "ignore" && /^-?[A-Za-z]/.test(t.token) && !o.has(t.token)) {
          const tip = o.suggest(t.token);
          add(t.start, t.end, `'${t.token}' is not an OmniaCSS utility.${tip ? ` Did you mean '${tip}'?` : ""}`, s.lint.unknownClass, "unknown-class");
        }
        continue;
      }
      const a = o.analyze(t.token);
      if (!a || !/^-?[A-Za-z]/.test(a.base)) continue;
      if (a.unknownVariant !== undefined) {
        if (!a.unknownVariant) continue;
        const at = t.start + t.token.indexOf(a.unknownVariant + ":");
        const tip = o.suggest(a.unknownVariant, "variant");
        add(at, at + a.unknownVariant.length, `Unknown OmniaCSS variant '${a.unknownVariant}'.${tip ? ` Did you mean '${tip}'?` : ""}`, s.lint.unknownVariant, "unknown-variant");
      } else if (!a.known) {
        const at = t.start + t.token.lastIndexOf(a.base);
        const tip = o.suggest(a.base);
        add(at, at + a.base.length, `'${a.base}' is not an OmniaCSS utility, so '${t.token}' generates no CSS.${tip ? ` Did you mean '${tip}'?` : ""}`, s.lint.unknownUtility, "unknown-utility");
      }
    }
  }
  collection.set(doc.uri, diags);
}

const codeActionProvider = {
  provideCodeActions(doc, _range, context) {
    const actions = [];
    for (const d of context.diagnostics) {
      if (d.source !== "omniacss") continue;
      const m = d.message.match(/Did you mean '([^']+)'\?/);
      if (m) {
        const fix = new vscode.CodeAction(`Change to '${m[1]}'`, vscode.CodeActionKind.QuickFix);
        fix.edit = new vscode.WorkspaceEdit();
        fix.edit.replace(doc.uri, d.range, m[1]);
        fix.diagnostics = [d];
        fix.isPreferred = true;
        actions.push(fix);
      }
      if ((d.code?.value ?? d.code) === "duplicate-class") {
        const fix = new vscode.CodeAction("Remove duplicate class", vscode.CodeActionKind.QuickFix);
        const line = doc.lineAt(d.range.start.line).text;
        let start = d.range.start;
        const before = line.slice(0, start.character).match(/\s+$/);
        if (before) start = start.translate(0, -before[0].length);
        fix.edit = new vscode.WorkspaceEdit();
        fix.edit.delete(doc.uri, new vscode.Range(start, d.range.end));
        fix.diagnostics = [d];
        actions.push(fix);
      }
    }
    return actions;
  },
};

// ---------------------------------------------------------------------------------------------------------------

function activate(context) {
  log = vscode.window.createOutputChannel("OmniaCSS IntelliSense");
  const s = settings();
  const languages = [...new Set([...CLASS_LANGUAGES, ...CSS_LANGUAGES, ...s.languages])];
  const selector = languages.flatMap((language) => [{ language, scheme: "file" }, { language, scheme: "untitled" }]);
  const diagnostics = vscode.languages.createDiagnosticCollection("omniacss");

  const timers = new Map();
  const schedule = (doc, delay = 300) => {
    if (!languages.includes(doc.languageId)) return;
    clearTimeout(timers.get(doc.uri.toString()));
    timers.set(doc.uri.toString(), setTimeout(() => lint(doc, diagnostics).catch(() => {}), delay));
  };

  context.subscriptions.push(
    log,
    diagnostics,
    vscode.languages.registerCompletionItemProvider(selector, completionProvider, ...TRIGGERS),
    vscode.languages.registerHoverProvider(selector, hoverProvider),
    vscode.languages.registerColorProvider(selector, colorProvider),
    vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidOpenTextDocument((doc) => schedule(doc, 0)),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("omniacss")) return;
      finders.clear();
      for (const doc of vscode.workspace.textDocuments) schedule(doc, 0);
    }),
    vscode.commands.registerCommand("omniacss.showOutput", () => log.show()),
  );
  for (const doc of vscode.workspace.textDocuments) schedule(doc, 0);
}

function deactivate() {}

module.exports = { activate, deactivate };
