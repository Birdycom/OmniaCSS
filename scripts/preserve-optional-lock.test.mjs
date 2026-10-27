// File: scripts/preserve-optional-lock.test.mjs
// Map: linux package comes back -> stale version stays out

import assert from "node:assert/strict";
import test from "node:test";
import { restoreOptional, snapshotOptional } from "./preserve-optional-lock.mjs";

const linux = "node_modules/@rollup/rollup-linux-x64-gnu";

test("puts back a linux optional package the parent still wants", () => {
  const lock = {
    packages: {
      "node_modules/rollup": { optionalDependencies: { "@rollup/rollup-linux-x64-gnu": "4.64.6" } },
    },
  };
  const snap = snapshotOptional({
    packages: { [linux]: { version: "4.64.6", optional: true, os: ["linux"] } },
  });
  assert.equal(restoreOptional(lock, snap), 1);
  assert.equal(lock.packages[linux].version, "4.64.6");
});

test("skips a package whose version is no longer requested", () => {
  const lock = {
    packages: {
      "node_modules/rollup": { optionalDependencies: { "@rollup/rollup-linux-x64-gnu": "4.9.0" } },
    },
  };
  const snap = { [linux]: { version: "4.64.6", optional: true } };
  assert.equal(restoreOptional(lock, snap), 0);
  assert.equal(lock.packages[linux], undefined);
});
