// File: scripts/lib/seo-files.mjs
// robots.txt and sitemap.xml for the docs site, from the built pages in public/.
// Used by scripts/build-seo.mjs (local copy in public/, part of "npm run docs:build") and scripts/deploy.mjs (live copy).
// Not in the sitemap: redirect stubs (meta refresh), pages with "noindex" (404), Google Search Console files.
// Map: walk public/**/*.html -> skip non-pages -> clean URL + lastmod -> robots.txt + sitemap.xml

import fs from "node:fs/promises";
import path from "node:path";

const NOT_A_PAGE = [/(^|\/)google[0-9a-f]+\.html$/, /(^|\/)404\.html$/];

/** A file that can be a page (the 404 page and verification files are never listed or canonicalised). */
export const isPage = (rel) => rel.endsWith(".html") && !NOT_A_PAGE.some((re) => re.test(rel));

/** Redirect stub or noindex page: no canonical, not in the sitemap. */
export const isListable = (html) => !/http-equiv="refresh"/i.test(html) && !/<meta name="robots" content="[^"]*noindex/i.test(html);

/** The address of a page: no .html (clean URLs), a folder's index.html is the folder itself. */
export const pageUrl = (siteUrl, rel) => `${siteUrl}/${rel.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "")}`;

/**
 * @param {string} publicDir the built site
 * @param {string} siteUrl base address for the URLs (https://omniacss.eu live, https://omniacss.test locally)
 * @returns {Promise<Map<string, string>>} "robots.txt" and "sitemap.xml" with their content
 */
export async function seoFiles(publicDir, siteUrl) {
  const pages = [];
  for await (const entry of fs.glob("**/*.html", { cwd: publicDir })) {
    const rel = entry.split(path.sep).join("/");
    if (!isPage(rel)) continue;
    const file = path.join(publicDir, entry);
    if (!isListable(await fs.readFile(file, "utf8"))) continue;
    pages.push([rel, (await fs.stat(file)).mtime.toISOString().slice(0, 10)]);
  }
  const key = (rel) => (rel === "index.html" ? "" : rel); // home first
  const urls = pages.sort(([a], [b]) => (key(a) < key(b) ? -1 : 1)).map(([rel, lastmod]) => `  <url><loc>${pageUrl(siteUrl, rel)}</loc><lastmod>${lastmod}</lastmod></url>`);
  return new Map([
    ["robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`],
    ["sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`],
  ]);
}
