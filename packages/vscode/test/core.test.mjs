// Tests for the editor-independent parts: class regions, CSS derivation, colors, suggestions.
// Needs dist/ (npm run build in this folder).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createFinder, tokensIn } = require("../src/lib/regions.cjs");
const { load } = require("../src/lib/omnia.cjs");
const { colorToHex } = require("../src/lib/color.cjs");

const pkg = require("../package.json");
const props = pkg.contributes.configuration.properties;
const finder = createFinder({ attributes: props["omniacss.classAttributes"].default, functions: props["omniacss.classFunctions"].default });
const classes = (text) => finder.regions(text).flatMap((r) => tokensIn(text, r).map((t) => t.token));

test("plain class attributes", () => {
  assert.deepEqual(classes('<div class="flex p-2  hover:bg-red-50" id="x">'), ["flex", "p-2", "hover:bg-red-50"]);
  assert.deepEqual(classes("<a className='m-1'>"), ["m-1"]);
  assert.deepEqual(classes('<div data-class="nope" klass="no">'), []);
});

test("bound attributes and expressions", () => {
  assert.deepEqual(classes(`<div :class="{ 'bg-blue-50': on, 'p-2': !on }">`), ["bg-blue-50", "p-2"]);
  assert.deepEqual(classes('<div className={cn("flex", on && "gap-1")}>'), ["flex", "gap-1"]);
  assert.deepEqual(classes("<div className={`p-2 ${x ? 'm-1' : ''} flex`}>"), ["p-2", "m-1", "flex"]);
  assert.deepEqual(classes("<div class:list={['a-1', { b: true }]}>"), ["a-1"]);
});

test("helper calls (JS + Blade)", () => {
  assert.deepEqual(classes("const c = clsx('flex', active && 'bg-red-50');"), ["flex", "bg-red-50"]);
  assert.deepEqual(classes("<div @class(['p-4', 'font-bold' => $active])>"), ["p-4", "font-bold"]);
  assert.deepEqual(classes("el.classList.add('is-open')"), ["is-open"]);
});

test("template syntax inside class is skipped", () => {
  assert.deepEqual(classes('<div class="p-2 {{ $x }} flex">'), ["p-2", "flex"]);
});

test("markup built by string concatenation keeps only the literal parts", () => {
  assert.deepEqual(classes(`html = '<span class="iconify ' + cls + ' size-6">';`), ["iconify", "size-6"]);
  assert.deepEqual(classes(`'<button class="' + a + '">' + '<span class="' + b + '"></span>'`), []);
  assert.deepEqual(classes(`echo '<div class="p-2 ' . $extra . '">';`), ["p-2"]);
  assert.deepEqual(classes(`<div class="content-['x'] p-2">`), ["p-2"]);
});

test("unterminated region while typing", () => {
  const r = finder.regions('<div class="flex hov');
  assert.equal(r.length, 1);
  assert.equal(r[0].open, true);
});

const o = await load();

test("css for base and variant tokens", () => {
  assert.match(o.cssFor("p-2"), /\.p-2 \{\n  padding: 2rem; \/\* 32px \*\/\n\}/);
  const md = o.cssFor("md:hover:flex");
  assert.match(md, /@media \(min-width: 50rem\) \{/);
  assert.match(md, /\.md\\:hover\\:flex:hover \{/);
  assert.match(o.cssFor("!flex"), /display: flex !important;/);
  assert.equal(o.cssFor("hovr:flex"), null);
  assert.equal(o.cssFor("not-a-utility"), null);
  const dark = o.cssFor("dark:bg-red-50");
  assert.match(dark, /prefers-color-scheme: dark/);
});

test("analyze reports unknown variants and utilities", () => {
  assert.equal(o.analyze("hovr:flex").unknownVariant, "hovr");
  assert.equal(o.analyze("hover:flexx").known, false);
  assert.equal(o.analyze("cq-md:hover:flex").known, true);
  assert.equal(o.analyze("group-hover/card:flex").known, true);
  assert.equal(o.analyze("data-[state=open]:flex").known, true);
});

test("suggestions", () => {
  assert.equal(o.suggest("hovr", "variant"), "hover");
  assert.equal(o.suggest("bg-rde-50"), "bg-red-50");
});

test("colors", () => {
  assert.equal(colorToHex("oklch(100% 0 0deg)"), "#ffffff");
  assert.equal(colorToHex("color-mix(in oklch, oklch(0% 0 0deg) 50%, transparent)"), "#00000080");
  assert.equal(colorToHex("#abc"), "#aabbcc");
  assert.ok(o.colors["bg-red-50"][0].startsWith("#"));
  assert.equal(o.colors["bg-red-50"][1], "--color-red-50");
});
