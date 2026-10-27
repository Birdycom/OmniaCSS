// scripts/build-browser-support.mjs
// Builds public/data/browser-support.json from MDN browser-compat-data (@mdn/browser-compat-data).
// Every docs page lists its features in <oc-compat features="css.properties.clip-path ..."> (apps/docs/src/content);
// this script collects those keys and stores, per browser, the version since when the feature is
// supported, partially supported, behind a flag, in preview (upcoming) or not supported.
// Run: "npm run compat:build" (also part of "npm run build").

import fs from 'node:fs/promises';
import path from 'node:path';
import { bcd, BROWSERS, featureEntry } from './lib/bcd-support.mjs';

const root = process.cwd();
const outFile = path.join(root, 'public/data/browser-support.json');

async function listHtml(dir) {
  const entries = await fs.readdir(path.join(root, dir), { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.html')).map((e) => path.join(e.parentPath ?? e.path, e.name));
}

async function main() {
  const keys = new Set();
  // Docs content: <oc-compat features="…"> (and the older data-oc-compat="…" attribute).
  for (const file of await listHtml('apps/docs/src/content')) {
    const html = await fs.readFile(file, 'utf8');
    for (const m of html.matchAll(/(?:data-oc-compat|<oc-compat[^>]*\sfeatures)="([^"]+)"/g)) m[1].split(/\s+/).filter(Boolean).forEach((k) => keys.add(k));
  }

  const features = {};
  const missing = [];
  for (const key of [...keys].sort()) {
    const entry = featureEntry(key);
    if (!entry) { missing.push(key); continue; }
    features[key] = entry;
  }
  if (missing.length) {
    console.error('[compat] unknown BCD keys:', missing.join(', '));
    process.exit(1);
  }

  const data = {
    source: { name: '@mdn/browser-compat-data', version: bcd.__meta.version, timestamp: bcd.__meta.timestamp },
    browsers: BROWSERS,
    features,
  };
  await fs.writeFile(outFile, JSON.stringify(data));
  console.log('[compat]', Object.keys(features).length, 'features ->', path.relative(root, outFile), `(BCD ${bcd.__meta.version})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
