// scripts/clean-urls.mjs
// Clean URLs: links point at /docs/colors/palettes instead of /docs/colors/palettes.html, and at /docs/ instead of
// /docs/index.html. The files keep their .html name; the server serves them for the address without it
// (production: .htaccess from scripts/deploy.mjs, which also 301-redirects old .html links; Herd: public/index.php).
// Map: every public/**/*.html -> href of real <a> tags (not code samples) -> clean; data/search-index.json "u" -> clean
// Run after the site build (part of the build script in package.json). Same script in OmniaCSS and OmniaUI.

import fs from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), "public");
// Links to our two sites count as internal, also when written with the full address.
const OWN = /^https?:\/\/(omniacss|omniaui)\.(test|eu)(\/|$)/i;

/** "/a/b.html#x" -> "/a/b#x", "/a/index.html" -> "/a/", "index.html" -> "./"; anything else stays as it is. */
export function cleanHref(href) {
  if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !OWN.test(href)) return href;
  const cut = href.search(/[?#]/);
  const [file, rest] = cut < 0 ? [href, ""] : [href.slice(0, cut), href.slice(cut)];
  if (!file.endsWith(".html")) return href;
  // Google Search Console verification files must keep their exact name.
  if (/(^|\/)google[0-9a-f]+\.html$/.test(file)) return href;
  if (file === "index.html") return "./" + rest;
  if (file.endsWith("/index.html")) return file.slice(0, -"index.html".length) + rest;
  return file.slice(0, -".html".length) + rest;
}

async function* htmlFiles(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

// Only real tags: escaped code samples in the docs (&lt;a href=…&gt;) stay as they are.
const tagRe = /<a\b[^>]*>/gi;
const hrefRe = /(\shref=)(["'])(.*?)\2/i;

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  let files = 0, links = 0;
  const dirs = new Set();
  for (const entry of await fs.readdir(root, { withFileTypes: true, recursive: true })) {
    // Only folders with their own index.html are pages; ui/components/ just holds the component pages.
    const dir = path.join(entry.parentPath ?? entry.path, entry.name);
    if (entry.isDirectory() && (await fs.stat(path.join(dir, "index.html")).catch(() => null))) dirs.add(dir);
  }
  for await (const file of htmlFiles(root)) {
    const html = await fs.readFile(file, "utf8");
    const out = html.replace(tagRe, (tag) => tag.replace(hrefRe, (m, attr, q, href) => {
      let clean = cleanHref(href);
      if (clean === href) return m;
      // "alignment.html" next to a folder "alignment/" with an index.html (an old redirect page): link to the folder
      // with its slash, so relative links on that page keep resolving from the folder.
      const cut = clean.search(/[?#]/), bare = cut < 0 ? clean : clean.slice(0, cut);
      if (bare && !bare.endsWith("/") && !/^[a-z]+:/i.test(bare)) {
        const target = bare.startsWith("/") ? path.join(root, bare) : path.resolve(path.dirname(file), bare);
        if (dirs.has(target)) clean = bare + "/" + (cut < 0 ? "" : clean.slice(cut));
      }
      links++;
      return `${attr}${q}${clean}${q}`;
    }));
    if (out !== html) { await fs.writeFile(file, out); files++; }
  }
  // The Ctrl K search index lists every page with its address.
  const index = path.join(root, "data/search-index.json");
  const json = await fs.readFile(index, "utf8").catch(() => null);
  if (json) {
    const items = JSON.parse(json);
    for (const item of items) if (item.u) item.u = cleanHref(item.u);
    await fs.writeFile(index, JSON.stringify(items));
  }
  console.log(`[clean-urls] ${links} links in ${files} pages${json ? " + search index" : ""}`);
}
