// File: scripts/build-seo.mjs
// Writes public/robots.txt and public/sitemap.xml after the docs build, so sitemap coverage can be checked on the
// local Herd site (https://omniacss.test). Both files are generated (git-ignored); "npm run deploy" writes the live
// versions with the production address itself (scripts/lib/seo-files.mjs).
// Usage: "npm run seo:local" (also the last step of "npm run docs:build"). Base address: SEO_SITE_URL, default the Herd host.

import fs from "node:fs/promises";
import path from "node:path";
import { seoFiles } from "./lib/seo-files.mjs";

const publicDir = path.join(process.cwd(), "public");
const siteUrl = (process.env.SEO_SITE_URL || "https://omniacss.test").replace(/\/$/, "");
const files = await seoFiles(publicDir, siteUrl);
for (const [name, body] of files) await fs.writeFile(path.join(publicDir, name), body);
const count = (files.get("sitemap.xml").match(/<url>/g) || []).length;
console.log(`[seo] public/robots.txt + public/sitemap.xml (${count} pages, ${siteUrl})`);
