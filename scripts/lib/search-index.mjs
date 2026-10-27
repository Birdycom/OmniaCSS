// File: scripts/lib/search-index.mjs
// Builds public/data/search-index.json for the docs search (Ctrl K) from the generated pages.
// Shared by the OmniaCSS and OmniaUI sites (identical copy in both repos); called from scripts/sync-site.mjs.
// Entry: { t: title, u: url, g: group, h: [[id, heading], …], k: keywords (class names from reference tables), f: featured }
// Map: walk dist HTML -> title + group -> h2/h3 ids -> table keywords -> write JSON

import fs from "node:fs/promises";
import path from "node:path";
import { parseHTML } from "linkedom";

/**
 * @param {string} dist folder with the built pages
 * @param {string} outFile where to write the JSON
 * @param {{ siteName: string, featured?: string[] }} o featured = urls shown before typing
 */
export async function buildSearchIndex(dist, outFile, { siteName, featured = [] }) {
  const entries = [];
  for await (const rel of fs.glob("**/*.html", { cwd: dist })) {
    const url = "/" + rel.split(path.sep).join("/");
    if (/(^|\/)404\.html$/.test(url)) continue;
    const html = await fs.readFile(path.join(dist, rel), "utf8");
    const { document } = parseHTML(html);
    const main = document.querySelector(".oc-docs-content, .ocd-content");
    if (!main) continue;
    const rawTitle = document.querySelector("title")?.textContent || "";
    const title = (main.querySelector(".oc-hero-title, .oc-section-header__title, h1")?.textContent || rawTitle.replace(new RegExp(`^${siteName}\\s*(Docs)?\\s*[-—:]\\s*`), ""))
      .replace(/\s+/g, " ").trim();
    const parts = url.split("/").filter(Boolean);
    const folder = parts.length > 2 ? parts[parts.length - 2] : parts[0]?.replace(/\.html$/, "") || "";
    const group = folder.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) || siteName;
    const headings = [...main.querySelectorAll("h2[id], h3[id]")]
      .filter((h) => !h.closest(".oc-demo, .oc-section-footer, .oc-compat"))
      .map((h) => [h.id, h.textContent.replace(/\s+/g, " ").trim()])
      .filter(([, text]) => text && text !== title && !/^(browser support|source)/i.test(text));
    const keywords = [...new Set([...main.querySelectorAll(".oc-table-ref td:first-child code")]
      .flatMap((c) => c.textContent.split(/[\s/,|{}]+/))
      .map((w) => w.replace(/^\./, "").replace(/[^\w:.\-[\]()]/g, ""))
      .filter((w) => w.length > 1))].slice(0, 120).join(" ");
    entries.push({ t: title, u: url, g: group, h: headings, k: keywords, ...(featured.includes(url) ? { f: 1 } : {}) });
  }
  entries.sort((a, b) => a.g.localeCompare(b.g) || a.t.localeCompare(b.t));
  // Featured pages first, in the order given
  entries.sort((a, b) => (featured.indexOf(a.u) + 1 || 999) - (featured.indexOf(b.u) + 1 || 999));
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(entries));
  return entries.length;
}
