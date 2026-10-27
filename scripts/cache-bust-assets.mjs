// scripts/cache-bust-assets.mjs
// Adds a content hash to every stylesheet and script URL (".../omnia_main.css?v=<hash>", ".../oc-docs-nav-module.js?v=<hash>")
// in the HTML pages. Herd/nginx serves CSS/JS without Cache-Control, so browsers may reuse an old file on a
// normal reload. A hash of the file content gives every change a new URL, so the browser always loads it.
// Also versions the @import url("oc-colors.css") inside omnia_main(.min).css.
// Run after sass/postcss build (e.g. "npm run assets:bust" or as part of "npm run build").

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const cssDir = path.join(root, 'public/css');
const jsDir = path.join(root, 'public/js');
const htmlRoots = ['public', 'pages', 'index.html'];

async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(content).digest('hex').slice(0, 10);
}

async function listHtml(target) {
  const full = path.join(root, target);
  let stat;
  try {
    stat = await fs.stat(full);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  if (stat.isFile()) return full.endsWith('.html') ? [full] : [];
  const entries = await fs.readdir(full, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

// 1) Version the oc-colors.css import inside the main bundles, before hashing them.
async function bustColorsImport() {
  const colorsHash = await hashFile(path.join(cssDir, 'oc-colors.css'));
  for (const name of ['omnia_main.css', 'omnia_main.min.css']) {
    const filePath = path.join(cssDir, name);
    const content = await fs.readFile(filePath, 'utf8');
    const updated = content.replace(/@import url\("oc-colors\.css(?:\?v=[^"]*)?"\)/, `@import url("oc-colors.css?v=${colorsHash}")`);
    if (updated !== content) {
      await fs.writeFile(filePath, updated, 'utf8');
      console.log('[bust]', `public/css/${name}`, '-> oc-colors.css?v=' + colorsHash);
    }
  }
}

async function main() {
  await bustColorsImport();

  const hashes = new Map();
  for (const [dir, ext] of [[cssDir, '.css'], [jsDir, '.js']]) {
    for (const name of await fs.readdir(dir)) {
      if (name.endsWith(ext)) hashes.set(name, await hashFile(path.join(dir, name)));
    }
  }

  // Only rewrite real <link>/<script> tags; escaped code samples in the docs (&lt;link ...) stay untouched.
  const tagRe = /<(?:link|script)\b[^>]*>/g;
  const urlRe = /((?:href|src)="[^"]*?)([A-Za-z0-9_.-]+\.(?:css|js))(?:\?v=[^"]*)?"/;
  const files = (await Promise.all(htmlRoots.map(listHtml))).flat();
  let changed = 0;
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const updated = content.replace(tagRe, (tag) =>
      tag.replace(urlRe, (match, prefix, name) => (hashes.has(name) ? `${prefix}${name}?v=${hashes.get(name)}"` : match))
    );
    if (updated !== content) {
      await fs.writeFile(filePath, updated, 'utf8');
      changed++;
    }
  }
  console.log('[bust]', `${changed} HTML file(s) updated`, Object.fromEntries(hashes));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
