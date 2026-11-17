// File: apps/docs/src/lib/counts.mjs
// <oc-count of="components"> in a content page: the number of OmniaUI components or blocks, so the home never
// names an old total. Map: ../omniaUI/public/data/oc-counts.json (written by its build) -> else the committed copy
// docs/omniaui-counts.json ("npm run sync:omniaui" refreshes it; CI has no OmniaUI checkout).

import fs from "node:fs";
import path from "node:path";
import { REPO } from "./site.mjs";

const live = path.join(REPO, "..", "omniaUI", "public", "data", "oc-counts.json");
const copy = path.join(REPO, "docs", "omniaui-counts.json");
const COUNTS = JSON.parse(fs.readFileSync(fs.existsSync(live) ? live : copy, "utf8"));

/** "182" for "components"; an unknown key stops the build instead of printing an empty number. */
export function countOf(key) {
  if (typeof COUNTS[key] !== "number") throw new Error(`<oc-count of="${key}">: unknown count (known: ${Object.keys(COUNTS).filter((k) => typeof COUNTS[k] === "number").join(", ")})`);
  return String(COUNTS[key]);
}
