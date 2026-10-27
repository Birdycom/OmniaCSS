// scripts/normalize-css-eol.mjs
// Ensures generated CSS and source-map files use CRLF so Git does not warn on add.
// Run after sass/postcss build (e.g. "npm run eol:css" or as part of "npm run build").

import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dirs = ['src/css', 'public/css'];
const exts = ['.css', '.css.map'];

function toCRLF(content) {
  if (typeof content !== 'string') return content;
  return content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

async function normalizeDir(dir) {
  const fullPath = path.join(root, dir);
  let entries;
  try {
    entries = await fs.readdir(fullPath, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!exts.includes(ext)) continue;
    const filePath = path.join(fullPath, e.name);
    const content = await fs.readFile(filePath, 'utf8');
    const normalized = toCRLF(content);
    if (normalized !== content) {
      await fs.writeFile(filePath, normalized, 'utf8');
      console.log('[eol]', path.relative(root, filePath));
    }
  }
}

async function main() {
  for (const dir of dirs) {
    await normalizeDir(dir);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
