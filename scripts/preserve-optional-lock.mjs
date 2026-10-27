// File: scripts/preserve-optional-lock.mjs
// Map: snapshot optional platform packages -> restore any that a later npm install dropped
//
// npm install --package-lock-only on Windows omits optional packages for other
// platforms (Rollup and esbuild binaries). Linux CI then cannot build.
// A package comes back only when some parent still lists that exact version.

import fs from "node:fs/promises";
import path from "node:path";

const LOCK = "package-lock.json";

/** Package name at the end of a lockfile path. */
function packageName(key) {
  return key.split("node_modules/").pop();
}

/** Optional packages currently stored in the lockfile, keyed by their path. */
export function snapshotOptional(lock) {
  const snap = {};
  for (const [key, pkg] of Object.entries(lock.packages || {})) {
    if (pkg && pkg.optional) snap[key] = pkg;
  }
  return snap;
}

/** True when a remaining package still depends on this exact optional version. */
function stillWanted(lock, key, version) {
  const name = packageName(key);
  for (const pkg of Object.values(lock.packages || {})) {
    if (pkg?.optionalDependencies?.[name] === version) return true;
  }
  return false;
}

/**
 * Put dropped optional packages back, in alphabetical order.
 * Returns how many packages were restored.
 */
export function restoreOptional(lock, snap) {
  const missing = Object.entries(snap)
    .filter(([key, pkg]) => !lock.packages[key] && stillWanted(lock, key, pkg.version))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (missing.length === 0) return 0;

  const next = {};
  let index = 0;
  for (const key of Object.keys(lock.packages)) {
    while (index < missing.length && missing[index][0] < key) {
      next[missing[index][0]] = missing[index][1];
      index += 1;
    }
    next[key] = lock.packages[key];
  }
  while (index < missing.length) {
    next[missing[index][0]] = missing[index][1];
    index += 1;
  }
  lock.packages = next;
  return missing.length;
}

/** Read the workspace lockfile. */
export async function readLock(root) {
  return JSON.parse(await fs.readFile(path.join(root, LOCK), "utf8"));
}

/** Write the workspace lockfile with the same formatting npm uses. */
export async function writeLock(root, lock) {
  await fs.writeFile(path.join(root, LOCK), JSON.stringify(lock, null, 2) + "\n");
}
