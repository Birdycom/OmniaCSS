// File: scripts/build-llms.mjs
// llms.txt and llms-full.txt for omniacss.eu (https://llmstxt.org): what AI assistants read to learn OmniaCSS
// instead of guessing it from Tailwind. Built from the same sources as the MCP server: its guide, the docs search
// index and the Tailwind conversion table.
// Map: guide + docs index -> llms.txt (links) ; + Tailwind cheat sheet + utility values -> llms-full.txt
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guide } from "../packages/mcp/src/server.mjs";
import { load, SITE, UI_SITE } from "../packages/mcp/src/knowledge.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public");
const { version } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const kb = await load({ project: root });
const docs = JSON.parse(await fs.readFile(path.join(root, "packages/mcp/dist/search-index.json"), "utf8"));

const SUMMARY = `> OmniaCSS is a free, MIT-licensed, utility-first CSS framework built on modern CSS: container queries, anchor
> positioning, view transitions, scroll-driven animations, @starting-style, light-dark(), OKLCH colors and logical
> properties. It looks like Tailwind but is NOT Tailwind: the spacing scale and many class names differ. Its build
> (PostCSS, Vite or CLI) keeps only the classes a project uses. Components and page blocks come from the sister
> project OmniaUI (${UI_SITE}, oc-* classes, HTML/React/Vue/Blade/Livewire).`;

// Docs pages per group, in the order of the docs navigation.
const groups = new Map();
for (const page of docs) {
  if (!page.t || page.u.startsWith("/legal")) continue;
  const g = page.g || "Docs";
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(`- [${page.t}](${SITE}${page.u})`);
}

const llms = `# OmniaCSS

${SUMMARY}

Current version: ${version}. Node.js 22 or newer for the npm packages.

## Rules for AI assistants

- Do not write Tailwind classes and assume they work. Check unknown classes, or use the MCP server below.
- Spacing: p-1 is 1rem, p-4 is 4rem (Tailwind: p-4 is 1rem). Read the values in llms-full.txt.
- Colors use the OmniaCSS palette (bg-vividblue-80, text-coral, bg-ral3020), not Tailwind's (bg-blue-500).
- Components (buttons, cards, modals, tabs …) are OmniaUI classes with the oc- prefix: use the reference markup.
- Never build class names from pieces in code; the build only keeps names written out in full.

## Start

- [Installation and first build](${SITE}/docs/)
- [AI assistants: the OmniaCSS MCP server](${SITE}/docs/ai): \`claude mcp add omniacss -- npx -y @birdycom/omniacss-mcp\`
- [Editor extension (VS Code, Cursor)](${SITE}/docs/editor)
- [Moving from Tailwind or Bootstrap](${SITE}/docs/migrate)
- [Full guide for AI assistants, with value tables](${SITE}/llms-full.txt)

${[...groups].map(([g, links]) => `## ${g}\n\n${links.join("\n")}`).join("\n\n")}

## OmniaUI (components and blocks)

- [OmniaUI site](${UI_SITE}/)
- [OmniaUI for AI assistants](${UI_SITE}/llms.txt)

## Optional

- [npm: @birdycom/omniacss](https://www.npmjs.com/package/@birdycom/omniacss)
- [Source on GitHub](https://github.com/Birdycom/OmniaCSS)
`;

// llms-full.txt: the MCP guide, then the classes an assistant gets wrong most often, with their real values.
const TAILWIND = `flex inline-flex grid hidden block items-center justify-between gap-2 gap-4 p-2 p-4 px-4 py-2 m-4 mx-auto mt-4 mb-8
w-full h-full w-1/2 max-w-md max-w-7xl min-h-screen text-sm text-lg text-2xl font-bold font-semibold leading-tight
rounded rounded-lg rounded-full shadow shadow-lg border border-gray-200 bg-white bg-gray-100 bg-blue-500 text-white
text-gray-500 text-gray-900 hover:bg-blue-600 dark:bg-gray-800 md:flex lg:grid-cols-3 grid-cols-2 space-y-4 divide-y
opacity-50 transition duration-200 truncate sr-only absolute inset-0 z-10 overflow-hidden object-cover aspect-video`
  .split(/\s+/);
const rows = await kb.tailwind(TAILWIND);
// The migrate codemod only rewrites a variant when the full CDN build has it; with a build (PostCSS, Vite, CLI)
// every variant works, so suggest the variant on the native base class when the engine knows it.
for (const r of rows) {
  const i = r.tailwind.lastIndexOf(":");
  if (r.omnia || i < 0) continue;
  const [base] = await kb.tailwind([r.tailwind.slice(i + 1)]);
  const candidate = base.omnia && `${r.tailwind.slice(0, i + 1)}${base.omnia}`;
  if (candidate && kb.lookup([candidate])[0]?.known) Object.assign(r, { omnia: candidate, how: "native OmniaCSS class (needs a build; the CDN file has no dark: colors)" });
}
const cell = (s) => String(s ?? "").replaceAll("|", "\\|");
const cheat = rows.map((r) => `| ${cell(r.tailwind)} | ${cell(r.omnia ?? "—")} | ${cell(r.how)} |`).join("\n");

const valueOf = (cls) => {
  const [hit] = kb.lookup([cls]);
  return hit?.css?.match(/\{\s*([^}]*?)\s*\}/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
};
const SCALE = ["p-0", "p-0.25", "p-0.5", "p-0.75", "p-1", "p-1.5", "p-2", "p-3", "p-4", "gap-1", "gap-2", "m-1", "w-1", "w-10", "font-0.875", "font-1", "font-1.25", "font-1.5", "font-2", "round-2", "rounded-lg", "none", "align-items-center"];
const values = SCALE.map((c) => [c, valueOf(c)]).filter(([, v]) => v).map(([c, v]) => `| ${c} | \`${cell(v)}\` |`).join("\n");

const full = `# OmniaCSS — full guide for AI assistants

${SUMMARY}

${guide(version).replace(/^# .*\n+/, "")}
## Values of common classes

| Class | CSS |
|---|---|
${values}

## Tailwind class → OmniaCSS

Generated with the conversion table of @birdycom/omniacss-migrate. "—" means there is no native class: the migrate
plugin can keep the Tailwind name working, or write the CSS yourself.

| Tailwind | OmniaCSS | Note |
|---|---|---|
${cheat}

## Docs

${[...groups].map(([g, links]) => `### ${g}\n\n${links.join("\n")}`).join("\n\n")}
`;

await fs.writeFile(path.join(out, "llms.txt"), llms);
await fs.writeFile(path.join(out, "llms-full.txt"), full);
console.log(`[llms] public/llms.txt (${llms.length} chars), public/llms-full.txt (${full.length} chars)`);
