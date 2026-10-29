// File: packages/mcp/src/server.mjs
// The OmniaCSS MCP server: lets an AI assistant check, look up and search OmniaCSS classes instead of guessing them.
// Every tool is read-only; only read_docs goes on the network (omniacss.eu pages, nothing else).
// Map: createServer(knowledge) -> tools (getting_started, lookup_classes, search_utilities, list_variants,
//      color_tokens, convert_tailwind, search_docs, read_docs) + the guide as a resource
// Author: Serge Cools | Framework: OmniaCSS

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SITE, tokensOf } from "./knowledge.mjs";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** How to use OmniaCSS; also the server instructions, so a client learns the basics before calling a tool. */
export const guide = (version) => `# OmniaCSS ${version}

OmniaCSS is a utility-first CSS framework for modern CSS (anchor positioning, container queries, view transitions,
scroll-driven animations, light-dark(), OKLCH colors, logical properties). Docs: ${SITE}/docs/

## Rules for writing OmniaCSS markup
- OmniaCSS is NOT Tailwind. Many names match, many do not. Check every class you are unsure of with lookup_classes
  before you use it; it also corrects typos. Use convert_tailwind to turn Tailwind classes into OmniaCSS ones.
- The spacing scale is not Tailwind's: p-1 is 1rem, p-4 is 4rem. lookup_classes shows the exact value of every class.
- Variants stack with colons: md:hover:bg-vividblue-80. Breakpoints sm 36rem, md 50rem, lg 64rem, xl 80rem,
  2xl 96rem (min-width). Container queries: cq-md: (needs a container ancestor). list_variants shows them all.
- Colors: utilities use the palette (Omnia colors like vividblue-80, HTML names like coral, RAL like ral3020):
  bg-<color>, text-<color>, border-<color>. The semantic theme tokens (--oc-background, --oc-foreground,
  --oc-primary, --oc-border …) switch with light and dark mode; use them in your own CSS with var(). color_tokens
  lists both.
- Components (buttons, cards, modals …) come from OmniaUI and use the oc- prefix (oc-btn, oc-card). They are a
  separate package: @birdycom/omniaui.

## Install
CDN (prototyping, full build):
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@birdycom/omniacss@${version}/dist/omnia.min.css">
Starter build (common utilities only, small):
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@birdycom/omniacss@${version}/dist/omnia.starter.min.css">

npm with PostCSS / Vite / Laravel (only the CSS the project uses):
  npm install -D @birdycom/omniacss
  // postcss.config.js
  import omniacss from "@birdycom/omniacss/postcss";
  export default { plugins: [omniacss({ content: ["src/**/*.{html,js,vue,tsx}", "resources/views/**/*.blade.php"] })] };
  /* in the CSS entry */
  @omnia;

CLI (no PostCSS setup):
  npm install -D @birdycom/omniacss-cli
  npx omniacss init
  npx omniacss build --watch

The build only keeps classes it finds written out in the source. Never build class names from pieces
(\`text-\${color}\`): write the full names or list them under "keep" in omnia.config.json.

## Dark mode
Set class="dark" or data-theme="dark" on <html>, or follow the system setting. The dark: variant covers both.

## Moving from Tailwind
  npm install -D @birdycom/omniacss-migrate
  npx omniacss-migrate scan .              # how many classes are covered
  npx omniacss-migrate setup . --write     # switch deps, Vite/PostCSS config and CSS; Tailwind names keep working
  npx omniacss-migrate codemod . --write   # rewrite classes to native OmniaCSS names where they match 1:1
Bootstrap 3/4/5: npx omniacss-migrate bootstrap scan . / bootstrap codemod . --write
`;

const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (message) => ({ content: [{ type: "text", text: message }], isError: true });

/** @param {import("./knowledge.mjs").Knowledge} kb */
export function createServer(kb, { name = "omniacss", version = kb.version } = {}) {
  const server = new McpServer({ name, title: "OmniaCSS", version }, { instructions: guide(kb.version) });
  const classes = z.union([z.string(), z.array(z.string())])
    .describe('Class names, space-separated ("p-4 md:flex oc-btn") or as a list');

  server.registerResource("guide", "omniacss://guide", {
    title: "OmniaCSS guide", description: "How to install OmniaCSS and the rules for writing its markup.", mimeType: "text/markdown",
  }, (uri) => ({ contents: [{ uri: uri.href, text: guide(kb.version) }] }));

  server.registerTool("getting_started", {
    title: "Getting started",
    description: "How to install OmniaCSS (CDN, npm + PostCSS/Vite, CLI), dark mode, and the rules for writing OmniaCSS markup. Read this first.",
    annotations: READ_ONLY,
  }, async () => text(guide(kb.version)));

  server.registerTool("lookup_classes", {
    title: "Look up classes",
    description: "Check OmniaCSS utility classes (with variants such as md:hover:) and OmniaUI component classes (oc-*): " +
      "for each class whether it exists, the exact CSS it produces, or the closest correct name. Use it to validate markup before writing it.",
    inputSchema: { classes },
    annotations: READ_ONLY,
  }, async ({ classes: input }) => {
    const list = tokensOf(input);
    if (!list.length) return fail("Give at least one class name.");
    if (list.length > 100) return fail("At most 100 classes per call.");
    const results = kb.lookup(list);
    const unknown = results.filter((r) => !r.known).length;
    return text({ omniacss: kb.version, summary: `${results.length - unknown} known, ${unknown} unknown`, results });
  });

  server.registerTool("search_utilities", {
    title: "Search utilities",
    description: "Find OmniaCSS utilities and OmniaUI component classes by name or CSS: every word must match the class name or its " +
      'declarations. Examples: "gap", "anchor", "grid cols", "text-wrap", "position-area", "oc-btn".',
    inputSchema: {
      query: z.string().min(1).describe("Words to match"),
      limit: z.number().int().min(1).max(200).default(40).describe("Maximum number of results"),
    },
    annotations: READ_ONLY,
  }, async ({ query, limit }) => {
    const hits = kb.search(query, { limit });
    return hits.length ? text({ omniacss: kb.version, results: hits }) : text(`No class matches "${query}". Try search_docs or fewer words.`);
  });

  server.registerTool("list_variants", {
    title: "Variants",
    description: "The variant prefixes OmniaCSS supports (states, breakpoints, container queries, dark:, group-/peer-/has-, aria-/data-, " +
      "supports-, arbitrary [&>svg]:). Give a name to see the exact selector or at-rule it produces.",
    inputSchema: { name: z.string().optional().describe('One variant to explain, e.g. "group-hover" or "cq-md"') },
    annotations: READ_ONLY,
  }, async ({ name }) => text(kb.variants(name)));

  server.registerTool("color_tokens", {
    title: "Color and theme tokens",
    description: "OmniaCSS custom properties with their value and sRGB hex. Without a query: the semantic theme tokens (--oc-*). " +
      'With a query: every token whose name contains it, e.g. "primary", "ral-3020", "vividblue".',
    inputSchema: {
      query: z.string().optional().describe("Part of the token name"),
      limit: z.number().int().min(1).max(500).default(80),
    },
    annotations: READ_ONLY,
  }, async ({ query, limit }) => text({ omniacss: kb.version, ...kb.tokens(query, { limit }) }));

  server.registerTool("convert_tailwind", {
    title: "Convert Tailwind classes",
    description: "Turn Tailwind CSS classes into OmniaCSS: the native OmniaCSS class with the same CSS, or, when there is none, " +
      "the CSS the @birdycom/omniacss-migrate plugin generates so the Tailwind name keeps working.",
    inputSchema: {
      classes,
      v4: z.boolean().default(true).describe("Tailwind 4 naming (false for Tailwind 3)"),
    },
    annotations: READ_ONLY,
  }, async ({ classes: input, v4 }) => {
    const list = tokensOf(input);
    if (!list.length) return fail("Give at least one class name.");
    if (list.length > 100) return fail("At most 100 classes per call.");
    return text({ omniacss: kb.version, results: await kb.tailwind(list, { v4 }) });
  });

  server.registerTool("search_docs", {
    title: "Search the docs",
    description: `Find OmniaCSS documentation pages and sections on ${SITE} by topic, e.g. "container queries", "anchor", "palettes", "dark mode".`,
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(30).default(10),
    },
    annotations: READ_ONLY,
  }, async ({ query, limit }) => {
    const pages = kb.searchDocs(query, { limit });
    return pages.length ? text(pages) : text(`No docs page matches "${query}". Try one word.`);
  });

  server.registerTool("read_docs", {
    title: "Read a docs page",
    description: `Read one OmniaCSS documentation page from ${SITE} as text, with its code examples. Pass a URL or path from search_docs; ` +
      "add a section id (or #id in the URL) to read only that part of a long page.",
    inputSchema: {
      url: z.string().min(1).describe('e.g. "/docs/spacing/padding" or "https://omniacss.eu/docs/colors/palettes#ral"'),
      section: z.string().optional().describe("Section id on the page"),
      max_chars: z.number().int().min(1000).max(60000).default(15000),
    },
    annotations: { ...READ_ONLY, openWorldHint: true },
  }, async ({ url, section, max_chars }) => {
    try {
      const page = await kb.readDocs(url, { section, maxChars: max_chars });
      return text(`${page.url}\n\n${page.text}`);
    } catch (e) {
      return fail(e.message);
    }
  });

  return server;
}
