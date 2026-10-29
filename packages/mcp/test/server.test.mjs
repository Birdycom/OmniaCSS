// File: packages/mcp/test/server.test.mjs
// The MCP server end to end: a real MCP client talks to it over an in-memory transport.
// Needs dist/ (npm run build). read_docs is tested offline: fetch is replaced by a fixed page.
// Author: Serge Cools | Framework: OmniaCSS

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { load, htmlToText, sectionOf } from "../src/knowledge.mjs";
import { createServer } from "../src/server.mjs";

let client;
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  return { error: !!res.isError, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};

before(async () => {
  const server = createServer(await load());
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
});
after(() => client?.close());

test("lists the tools and the guide, with instructions", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "color_tokens", "convert_tailwind", "getting_started", "list_variants", "lookup_classes", "read_docs", "search_docs", "search_utilities",
  ]);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint));
  const { resources } = await client.listResources();
  assert.equal(resources[0].uri, "omniacss://guide");
  assert.match(client.getInstructions(), /OmniaCSS is NOT Tailwind/);
});

test("lookup_classes: CSS for known classes, corrections for typos", async () => {
  const { json } = await call("lookup_classes", { classes: "p-1 md:hover:bg-vividblue-80 hovr:flex felx oc-btn oc-buton" });
  const by = Object.fromEntries(json.results.map((r) => [r.token, r]));
  assert.match(by["p-1"].css, /padding: 1rem;/);
  assert.match(by["md:hover:bg-vividblue-80"].css, /@media \(min-width: 50rem\)[\s\S]*:hover/);
  assert.match(by["hovr:flex"].hint, /did you mean "hover:"/);
  assert.match(by["felx"].hint, /"flex"/);
  assert.equal(by["oc-btn"].kind, "component");
  assert.match(by["oc-buton"].hint, /oc-btn/);
  assert.equal(json.summary, "3 known, 3 unknown");
});

test("lookup_classes accepts a list and rejects an empty one", async () => {
  assert.equal((await call("lookup_classes", { classes: ["flex", "grid"] })).json.results.length, 2);
  assert.equal((await call("lookup_classes", { classes: " " })).error, true);
});

test("search_utilities matches names and CSS", async () => {
  const names = (await call("search_utilities", { query: "anchor", limit: 50 })).json.results.map((r) => r.name);
  assert.ok(names.includes("anchor-none"));
  const byCss = (await call("search_utilities", { query: "position-area", limit: 200 })).json.results;
  assert.ok(byCss.length > 0 && byCss.every((r) => /position-area/.test(r.name + r.css)));
});

test("list_variants explains one variant or lists all", async () => {
  assert.equal((await call("list_variants", { name: "cq-md" })).json.produces, "@container (min-width: 28rem)");
  assert.match((await call("list_variants", { name: "hovr" })).json.hint, /hover/);
  assert.ok((await call("list_variants")).json.breakpoints.names.includes("md"));
});

test("color_tokens: theme per mode, palette by query", async () => {
  const theme = (await call("color_tokens")).json.theme;
  const primary = theme.find((t) => t.name === "--oc-primary");
  assert.match(primary.light.hex, /^#[0-9a-f]{6}$/);
  assert.ok(primary.dark.palette);
  const red = (await call("color_tokens", { query: "red-50" })).json.palette.tokens;
  assert.ok(red.some((t) => t.name === "--color-red-50" && t.hex));
});

test("convert_tailwind: native class, compat CSS or unsupported", async () => {
  const { json } = await call("convert_tailwind", { classes: "bg-blue-500 p-4 space-x-4" });
  const by = Object.fromEntries(json.results.map((r) => [r.tailwind, r]));
  assert.equal(by["bg-blue-500"].omnia, "bg-vividblue-80");
  assert.equal(by["p-4"].omnia, "p-1");
  assert.equal(by["space-x-4"].omnia, null);
  assert.match(by["space-x-4"].css, /margin-inline-start: 1rem/);
});

test("search_docs finds pages with section links", async () => {
  const pages = (await call("search_docs", { query: "container queries" })).json;
  assert.equal(pages[0].url, "https://omniacss.eu/docs/container-queries/");
  assert.ok(pages[0].sections.every((s) => s.url.startsWith(pages[0].url + "#")));
});

test("read_docs reads only omniacss.eu, and one section when asked", async () => {
  const page = `<html><main class="oc-docs-content"><h2 id="a">Alpha</h2><p>First &amp; best</p>
    <pre><code class="language-html">&lt;div class="p-1"&gt;</code></pre><h3 id="a1">Sub</h3><p>Inside</p>
    <h2 id="b">Beta</h2><table><tr><th>Class</th><th>CSS</th></tr><tr><td>p-1</td><td>padding: 1rem</td></tr></table>
    <script>x()</script></main></html>`;
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => page, url });
  try {
    const all = await call("read_docs", { url: "/docs/spacing/padding" });
    assert.match(all.text, /^https:\/\/omniacss\.eu\/docs\/spacing\/padding/);
    assert.match(all.text, /## Alpha\nFirst & best/);
    assert.match(all.text, /```html\n<div class="p-1">\n```/);
    assert.match(all.text, /\| p-1 \| padding: 1rem \|/);
    assert.doesNotMatch(all.text, /x\(\)/);
    const one = await call("read_docs", { url: "https://omniacss.eu/docs/spacing/padding#a" });
    assert.match(one.text, /Inside/);
    assert.doesNotMatch(one.text, /Beta/);
    assert.equal((await call("read_docs", { url: "/docs/x", section: "nope" })).error, true);
    assert.equal((await call("read_docs", { url: "https://example.com/docs" })).error, true);
  } finally {
    globalThis.fetch = real;
  }
});

test("sectionOf follows nested sections", () => {
  const html = '<section id="s"><section><p>in</p></section><p>still</p></section><p>out</p>';
  assert.equal(htmlToText(sectionOf(html, "s")), "in\n\nstill");
});
