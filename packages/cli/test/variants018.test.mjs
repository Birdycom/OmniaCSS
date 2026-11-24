// File: packages/cli/test/variants018.test.mjs
// Tests the 0.18.0 CSS-roadmap batch: media-state variants (+ attribute fallback and its script), state-[x]:,
// modal:/fullscreen:/pip:, style-[--x:y]: container style queries, select parts (picker:, checkmark:, picker-icon:)
// and the text-contrast-* utilities (contrast-color()).
// Map: variants (applyVariant/resolveVariants/rankOf) -> engine output -> media-states.js (fake DOM) -> dist CSS
// Needs packages/core/dist for the last tests (run "npm run build" in the repo root first; "npm test" does that).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { applyVariant, resolveVariants, rankOf, VARIANT_GROUPS } from "../../core/src/variants.mjs";
import { generate } from "../../core/src/engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = async (f) => (await fs.readFile(path.join(root, f), "utf8")).replace(/\r\n/g, "\n");
const sels = (variants) => resolveVariants(variants)?.map((b) => b.sel);
const ats = (variants) => resolveVariants(variants)?.map((b) => b.at);

test("media states: native pseudo-class and [data-*] fallback as two separate branches", () => {
  const names = ["playing", "paused", "seeking", "buffering", "stalled", "muted", "volume-locked"];
  assert.deepEqual(VARIANT_GROUPS.mediaState, names);
  for (const n of names) {
    assert.deepEqual(sels([n]), [`&:${n}`, `&[data-${n}]`], n);
    assert.ok(VARIANT_GROUPS.pseudoClass.includes(n), `${n} in pseudoClass group (editor completions)`);
  }
  assert.deepEqual(sels(["hover", "paused"]), ["&:hover:paused", "&:hover[data-paused]"]);
  assert.deepEqual(sels(["group-paused"]), ["&:is(:where(.group):paused *)", "&:is(:where(.group)[data-paused] *)"]);
  assert.deepEqual(sels(["peer-playing"]), ["&:is(:where(.peer):playing ~ *)", "&:is(:where(.peer)[data-playing] ~ *)"]);
  assert.deepEqual(sels(["has-paused"]), ["&:has(:paused)", "&:has([data-paused])"]);
  // not-paused: the attribute rule needs the script's marker, else it would match every element without the script.
  assert.deepEqual(sels(["not-paused"]), ["&:not(:paused)", "&[data-oc-media]:not([data-paused])"]);
  assert.deepEqual(sels(["group-hover"]), ["&:is(:where(.group):hover *)"], "other variants keep one branch");
  assert.deepEqual(sels(["not-hover"]), ["&:not(:hover)"]);
});

test("state-[x]:, modal:, fullscreen:, pip:", () => {
  assert.deepEqual(sels(["state-[loading]"]), ["&:state(loading)"]);
  assert.deepEqual(sels(["state-checked"]), ["&:state(checked)"]);
  assert.deepEqual(sels(["has-state-[busy]"]), ["&:has(:state(busy))"]);
  assert.deepEqual(sels(["group-state-[open]"]), ["&:is(:where(.group):state(open) *)"]);
  assert.equal(applyVariant("state-[a_b]", [{ sel: "&", at: [] }]), null, "a state name has no spaces");
  assert.deepEqual(sels(["modal"]), ["&:modal"]);
  assert.deepEqual(sels(["fullscreen"]), ["&:fullscreen"]);
  assert.deepEqual(sels(["pip"]), ["&:picture-in-picture"]);
  // the existing names still work
  assert.deepEqual(sels(["starting"]), ["&"]);
  assert.deepEqual(ats(["starting"]), [["@starting-style"]]);
});

test("style-[--x:y]: wraps in @container style(), optionally named", () => {
  assert.deepEqual(ats(["style-[--tone:dark]"]), [["@container style(--tone: dark)"]]);
  assert.deepEqual(ats(["style-[--tone:dark]/card"]), [["@container card style(--tone: dark)"]]);
  assert.deepEqual(ats(["style-[--size:very_large]"]), [["@container style(--size: very large)"]]);
  assert.deepEqual(ats(["style-[--featured]"]), [["@container style(--featured)"]]);
  assert.equal(resolveVariants(["style-[color:red]"]), null, "only custom properties");
});

test("select parts: picker:, checkmark:, picker-icon: stack like pseudo-elements", () => {
  assert.deepEqual(sels(["picker"]), ["&::picker(select)"]);
  assert.deepEqual(sels(["checkmark"]), ["&::checkmark"]);
  assert.deepEqual(sels(["picker-icon"]), ["&::picker-icon"]);
  // a state goes in front of the (functional) pseudo-element, in either order
  assert.deepEqual(sels(["hover", "picker"]), ["&:hover::picker(select)"]);
  assert.deepEqual(sels(["picker", "hover"]), ["&:hover::picker(select)"]);
  assert.deepEqual(sels(["open", "picker-icon"]), ["&:is([open], :popover-open, :open)::picker-icon"]);
});

test("rankOf: new names sit in their group", () => {
  assert.equal(rankOf(["picker"]), rankOf(["before"]), "pseudo-elements");
  assert.ok(rankOf(["paused"]) >= 300 && rankOf(["paused"]) < 400, "media states rank with the states");
  assert.ok(rankOf(["modal"]) >= 300 && rankOf(["modal"]) < 400);
  for (const n of ["playing", "paused", "seeking", "buffering", "stalled", "muted", "volume-locked", "modal", "fullscreen", "pip"]) {
    assert.ok(rankOf([n]) < rankOf(["hover"]), `${n} ranks before hover (in STATE_ORDER)`);
  }
  assert.equal(rankOf(["state-[x]"]), rankOf(["data-open"]), "custom states rank with attributes");
  assert.ok(rankOf(["style-[--a:b]"]) > rankOf(["xl"]), "style queries after the screens");
  assert.ok(rankOf(["style-[--a:b]"]) < rankOf(["cq-md"]), "style queries before size container queries");
});

test("engine: a media-state variant writes two separate rules (no shared selector list)", () => {
  const css = generate(".hidden { display: none; }\n.text-contrast-red { color: #000; }\n", new Set(["paused:hidden", "not-paused:hidden"]));
  assert.match(css, /\.paused\\:hidden:paused \{\s*display: none;?\s*\}/);
  assert.match(css, /\.paused\\:hidden\[data-paused\] \{\s*display: none;?\s*\}/);
  assert.match(css, /\.not-paused\\:hidden\[data-oc-media\]:not\(\[data-paused\]\) \{/);
  assert.doesNotMatch(css, /:paused,/, "never one rule with both selectors");
  const style = generate(".flex { display: flex; }\n", new Set(["style-[--tone:dark]/card:flex", "picker:flex"]));
  assert.match(style, /@container card style\(--tone: dark\) \{\s*\.style-\\\[--tone\\:dark\\\]\\\/card\\:flex \{/);
  assert.match(style, /\.picker\\:flex::picker\(select\) \{/);
});

/** A tiny fake DOM for media-states.js: one document, media elements with attributes and capturing listeners. */
function fakeDom({ native = false } = {}) {
  class El extends EventTarget {
    constructor(name) { super(); this.nodeType = 1; this.nodeName = name; this.attrs = new Map(); this.paused = true; this.muted = false; this.seeking = false; this.networkState = 1; this.readyState = 4; }
    setAttribute(n, v) { this.attrs.set(n, String(v)); }
    removeAttribute(n) { this.attrs.delete(n); }
    hasAttribute(n) { return this.attrs.has(n); }
  }
  const media = [new El("VIDEO"), new El("AUDIO")];
  const listeners = [];
  const document = {
    readyState: "complete", currentScript: null, documentElement: {},
    querySelectorAll: () => media,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn) => { const i = listeners.findIndex((l) => l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); },
  };
  // Media events do not bubble: the script listens in the capture phase on the document.
  const fire = (el, type) => { for (const l of listeners.filter((x) => x.type === type)) l.fn({ type, target: el }); };
  const CSS = { supports: () => native };
  return { media, document, fire, listeners, context: vm.createContext({ document, CSS, WeakMap, EventTarget }) };
}

test("media-states.js: mirrors the state to data-* attributes in browsers without :paused", async () => {
  const code = await read("packages/core/src/media-states.js");
  const dom = fakeDom();
  vm.runInContext(code, dom.context);
  const [video] = dom.media;
  const flags = (el) => ["oc-media", "playing", "paused", "seeking", "buffering", "stalled", "muted"].filter((n) => el.hasAttribute("data-" + n));
  assert.deepEqual(flags(video), ["oc-media", "paused"], "initial state on load");
  assert.ok(dom.listeners.every((l) => l.capture === true), "capturing listeners");

  video.paused = false; dom.fire(video, "play");
  assert.deepEqual(flags(video), ["oc-media", "playing"]);
  video.networkState = 2; video.readyState = 1; dom.fire(video, "waiting");
  assert.deepEqual(flags(video), ["oc-media", "playing", "buffering"]);
  dom.fire(video, "stalled");
  assert.deepEqual(flags(video), ["oc-media", "playing", "buffering", "stalled"]);
  video.readyState = 4; dom.fire(video, "progress");
  assert.deepEqual(flags(video), ["oc-media", "playing"]);
  video.muted = true; dom.fire(video, "volumechange");
  video.seeking = true; dom.fire(video, "seeking");
  assert.deepEqual(flags(video), ["oc-media", "playing", "seeking", "muted"]);
  video.seeking = false; video.paused = true; dom.fire(video, "pause");
  assert.deepEqual(flags(video), ["oc-media", "paused", "muted"]);
  assert.equal(typeof dom.context.OmniaMediaStates.watch, "function", "global API");
});

test("media-states.js: does nothing when the browser supports :paused natively", async () => {
  const code = await read("packages/core/src/media-states.js");
  const dom = fakeDom({ native: true });
  vm.runInContext(code, dom.context);
  assert.equal(dom.listeners.length, 0);
  assert.equal(dom.media[0].hasAttribute("data-oc-media"), false);
  // force: true still runs it (tests, or to style volume states the same way everywhere)
  dom.context.OmniaMediaStates.watch(dom.document, { force: true });
  assert.equal(dom.media[0].hasAttribute("data-paused"), true);
});

test("dist: text-contrast-* with a black/white fallback and contrast-color() under @supports", async () => {
  for (const file of ["packages/core/dist/omnia.css", "packages/core/dist/omnia.min.css"]) {
    const css = (await read(file)).replace(/\s+/g, " ");
    assert.match(css, /\.text-contrast-white-50 ?\{ ?--oc-contrast-bg: ?var\(--color-white-50\); ?color: ?#000;? ?\}/, `${file}: light background -> black`);
    assert.match(css, /\.text-contrast-black ?\{ ?--oc-contrast-bg: ?var\(--color-black-100\); ?color: ?#fff;? ?\}/, `${file}: dark background -> white`);
    assert.match(css, /@supports ?\(color: ?contrast-color\(red\)\) ?\{ ?\.text-contrast ?\{ ?color: ?contrast-color\(var\(--oc-contrast-bg, ?var\(--oc-background\)\)\)/, `${file}: .text-contrast`);
    assert.match(css, /\.text-contrast-red-50[^{}]*\{ ?color: ?contrast-color\(var\(--oc-contrast-bg\)\);? ?\}/, `${file}: contrast-color() survives the minifier`);
    assert.doesNotMatch(css, /\.text-contrast-ral/, `${file}: no RAL contrast classes`);
  }
  assert.ok((await read("packages/core/dist/media-states.js")).includes("OmniaMediaStates"), "script shipped in dist");
});
