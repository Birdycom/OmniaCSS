// File: packages/migrate/test/resolve.test.mjs
// Resolver cases: variants, arbitrary values, modifiers, negatives, important, colors (Omnia tokens only).
import test from "node:test";
import assert from "node:assert/strict";
import { createContext, compileToken, resolveToken, parseToken } from "../src/index.mjs";

const ctx = createContext();
const css = (t, c = ctx) => compileToken(t, c);
const has = (t, re, c = ctx) => assert.match(css(t, c) ?? "", re, t);

test("spacing scale uses the 0.25rem step", () => {
  has("p-4", /padding: 1rem;/);
  has("px-2", /padding-inline: 0\.5rem;/);
  has("mt-0.5", /margin-top: 0\.125rem;/);
  has("gap-x-6", /column-gap: 1\.5rem;/);
  has("p-px", /padding: 1px;/);
  has("mx-auto", /margin-inline: auto;/);
});

test("negative values", () => {
  has("-mt-2", /margin-top: -0\.5rem;/);
  has("-translate-x-1/2", /--oc-translate-x: -50%;/);
  has("-inset-1", /inset: -0\.25rem;/);
  assert.equal(css("-text-red-500"), null);
});

test("fractions, keywords and arbitrary values", () => {
  has("w-1/2", /width: 50%;/);
  has("w-full", /width: 100%;/);
  has("h-screen", /height: 100vh;/);
  has("w-[37px]", /width: 37px;/);
  has("min-h-[calc(100vh-4rem)]", /min-height: calc\(100vh-4rem\);/);
  has("grid-cols-[1fr_2fr]", /grid-template-columns: 1fr 2fr;/);
  has("w-(--sidebar)", /width: var\(--sidebar\);/);
  has("[mask-type:luminance]", /mask-type: luminance;/);
  has("max-w-xl", /max-width: 36rem;/);
});

test("colors resolve to Omnia palette tokens only", () => {
  const out = css("bg-red-500");
  assert.match(out, /background-color: var\(--color-[a-z]+-\d+\);/);
  assert.doesNotMatch(out, /#|rgb\(|hsl\(/);
  has("text-white", /color: var\(--color-white-100\);/);
  has("border-black", /border-color: var\(--color-black-100\);/);
  has("bg-transparent", /background-color: transparent;/);
  has("fill-current", /fill: currentColor;/);
  has("bg-[#0041a7]", /background-color: var\(--color-[a-z]+-\d+\);/);
  has("bg-[#0041a7]", /var\(--color-/);
});

test("opacity modifier", () => {
  has("bg-red-500/50", /color-mix\(in oklab, var\(--color-red-50\) 50%, transparent\)/);
  has("text-black/[0.3]", /color-mix\(in oklab, var\(--color-black-100\) 30%, transparent\)/);
});

test("variants: state, responsive, dark, group", () => {
  has("hover:bg-red-500", /\.hover\\:bg-red-500:hover \{/);
  has("md:flex", /@media \(min-width: 50rem\) \{[\s\S]*display: flex;/);
  has("lg:p-4", /@media \(min-width: 64rem\)/);
  has("dark:text-white", /@media \(prefers-color-scheme: dark\)/, createContext({ darkMode: "media" }));
  has("dark:text-white", /^\.dark \.dark\\:text-white \{/, createContext({ darkMode: "class" }));
  has("group-hover:underline", /\.group:hover \.group-hover\\:underline \{/);
  has("peer-checked:block", /\.peer:checked ~ \.peer-checked\\:block \{/);
  has("focus-visible:ring-2", /:focus-visible \{/);
  has("sm:hover:bg-white", /@media \(min-width: 36rem\)[\s\S]*:hover/);
  has("max-md:hidden", /@media \(width < 50rem\)/);
});

test("breakpoints option", () => {
  has("md:flex", /min-width: 48rem/, createContext({ breakpoints: "tailwind" }));
  has("xl:flex", /min-width: 80rem/);
});

test("arbitrary and attribute variants", () => {
  has("data-[state=open]:bg-white", /\[data-state="open"\]/);
  has("aria-expanded:rotate-180", /\[aria-expanded="true"\]/);
  has("[&>svg]:size-4", />svg \{[\s\S]*width: 1rem;[\s\S]*height: 1rem;/);
  has("has-[>svg]:px-3", /:has\(>svg\)/);
  has("before:content-['']", /::before \{/);
  has("*:p-2", / > \* \{/);
  has("[@media(min-width:900px)]:p-2", /@media \(min-width:900px\)/);
});

test("important modifier", () => {
  has("!font-bold", /font-weight: 700 !important;/);
  has("font-bold!", /font-weight: 700 !important;/);
});

test("typography, borders, effects", () => {
  has("text-lg", /font-size: 1\.125rem;[\s\S]*line-height: calc\(1\.75 \/ 1\.125\);/);
  has("text-sm/6", /line-height: 1\.5rem;/);
  has("font-semibold", /font-weight: 600;/);
  has("tracking-wide", /letter-spacing: 0\.025em;/);
  has("leading-tight", /line-height: 1\.25;/);
  has("rounded-lg", /border-radius: 0\.5rem;/);
  has("rounded-t-md", /border-top-left-radius: 0\.375rem;/);
  has("rounded-full", /border-radius: 9999px;/);
  has("border", /border-width: 1px;/);
  has("border-b-2", /border-bottom-width: 2px;/);
  has("border-red-500", /border-color: var\(--color-/);
  has("opacity-50", /opacity: 0\.5;/);
  has("shadow-md", /--oc-shadow: [\s\S]*oklch\(from var\(--oc-shadow-color/);
  has("ring-2", /--oc-ring-shadow: 0 0 0 calc\(2px/);
  has("space-x-4", /> :not\(:first-child\) \{[\s\S]*margin-inline-start: 1rem;/);
  has("divide-y", /border-block-start-width: 1px;/);
});

test("gradients, transforms, transitions, animation", () => {
  has("bg-gradient-to-r", /linear-gradient\(to right/);
  has("from-red-500", /--oc-from: var\(--color-/);
  has("via-white", /--oc-via: var\(--color-white-100\)/);
  has("rotate-45", /rotate: 45deg;/);
  has("scale-95", /--oc-scale-x: 0\.95;/);
  has("translate-y-2", /--oc-translate-y: 0\.5rem;/);
  has("transition-colors", /transition-property: color, background-color/);
  has("duration-300", /transition-duration: 300ms;/);
  has("ease-in-out", /cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  has("animate-spin", /@keyframes spin[\s\S]*animation: spin 1s linear infinite;/);
  has("blur-sm", /--oc-blur: blur\(/);
  has("backdrop-blur-md", /--oc-bd-blur: blur\(12px\)/);
});

test("layout, flex, grid, position", () => {
  has("flex", /display: flex;/);
  has("hidden", /display: none;/);
  has("inline-flex", /display: inline-flex;/);
  has("grid-cols-3", /repeat\(3, minmax\(0, 1fr\)\)/);
  has("col-span-2", /grid-column: span 2 \/ span 2;/);
  has("items-center", /align-items: center;/);
  has("justify-between", /justify-content: space-between;/);
  has("flex-1", /flex: 1;/);
  has("absolute", /position: absolute;/);
  has("inset-0", /inset: 0px;/);
  has("top-1/2", /top: 50%;/);
  has("z-50", /z-index: 50;/);
  has("overflow-hidden", /overflow: hidden;/);
  has("cursor-pointer", /cursor: pointer;/);
  has("size-4", /width: 1rem;[\s\S]*height: 1rem;/);
  has("truncate", /text-overflow: ellipsis;/);
  has("sr-only", /clip-path: inset\(50%\);/);
});

test("tailwindcss-animate classes", () => {
  has("animate-in", /animation-name: enter;/);
  has("fade-in-0", /--oc-enter-opacity: 0;/);
  has("zoom-in-95", /--oc-enter-scale: 0\.95;/);
  has("slide-in-from-top-2", /--oc-enter-translate-y: -0\.5rem;/);
});

test("project theme variables win over defaults", () => {
  const c = createContext({ themeVars: ["--color-primary", "--radius-lg", "--text-tiny"] });
  has("bg-primary", /background-color: var\(--color-primary\);/, c);
  has("rounded-lg", /border-radius: var\(--radius-lg\);/, c);
  has("text-tiny", /font-size: var\(--text-tiny\);/, c);
  assert.equal(css("bg-primary"), null);
});

test("Tailwind 3 naming differs for shadow and ring", () => {
  const v3 = createContext({ v4: false });
  assert.notEqual(css("shadow-sm", v3), css("shadow-sm"));
  has("ring", /calc\(3px/, v3);
  has("ring", /calc\(1px/);
});

test("unknown tokens return null", () => {
  for (const t of ["btn", "od-table", "hover:nope", "md:totally-unknown-9", "foo:bar"]) assert.equal(resolveToken(t, ctx), null, t);
});

test("parseToken", () => {
  const p = parseToken("md:hover:-mt-2!", ctx);
  assert.deepEqual([p.variants, p.neg, p.important, p.body], [["md", "hover"], true, true, "mt-2"]);
});

test("order: base before pseudo before dark before responsive", () => {
  const { serialize, compileTokens } = createContext && { serialize: null };
  void serialize;
  const out = compileToken("p-4", ctx) + compileToken("hover:p-4", ctx);
  assert.ok(out.indexOf("padding") < out.indexOf(":hover"));
});
