// File: apps/docs/src/lib/site.mjs
// Site-wide constants: repository paths, version, header links, and the OmniaUI site URL.
// Map: findRepo -> paths + version -> OMNIAUI_URL + header links -> crossLinks -> sectionOf

import fs from "node:fs";
import path from "node:path";

/** Repository root: walk up from the working directory to the workspace package.json (bundling moves this module). */
function findRepo(dir = process.cwd()) {
  for (let d = dir; ; d = path.dirname(d)) {
    const pkg = path.join(d, "package.json");
    if (fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, "utf8")).name === "omniacss-workspace") return d;
    if (path.dirname(d) === d) throw new Error("omniacss docs: workspace root not found from " + dir);
  }
}

export const REPO = findRepo();
export const CONTENT = path.join(REPO, "apps/docs/src/content");

export const VERSION = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")).version;
export const RELEASES = JSON.parse(fs.readFileSync(path.join(REPO, "docs/release-history.json"), "utf8")).releases;

// Components, blocks and webicons live on the OmniaUI site (separate repo since October 2026).
// This is the ONLY place with its base URL. Change it here for production.
export const OMNIAUI_URL = "https://omniaui.test";

// The same menu, in the same order, as on omniaui.eu (apps/site/src/lib/site.mjs in the OmniaUI repo): a visitor
// who moves between the two sites keeps every item in its place. Keep both lists equal.
export const HEADER_LINKS = [
  { id: "home", label: "Home", href: "/index.html" },
  { id: "docs", label: "Docs", href: "/docs/index.html" },
  { id: "components", label: "Components", href: `${OMNIAUI_URL}/ui/components.html` },
  { id: "blocks", label: "Blocks", href: `${OMNIAUI_URL}/ui/blocks.html` },
  { id: "webicons", label: "Webicons", href: `${OMNIAUI_URL}/ui/webicons.html` },
];

export const GITHUB = "https://github.com/Birdycom/OmniaCSS";

/**
 * Links in the content that still point to the old /ui/... pages ("/ui/x.html", "../ui/x.html",
 * "../../ui/x.html") go to the OmniaUI site instead.
 */
export function crossLinks(html) {
  return html.replace(/href="(?:\/|(?:\.\.\/)+)ui\//g, `href="${OMNIAUI_URL}/ui/`);
}

/** Which top-level section a page belongs to (used for the header active state and the sidebar). */
export function sectionOf(route) {
  if (route.startsWith("docs/")) return "docs";
  return "home";
}
