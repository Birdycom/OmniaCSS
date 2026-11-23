// File: apps/docs/src/lib/whats-new.mjs
// <oc-whats-new> on the docs home: the latest OmniaCSS release, plus one line that links to what the newest OmniaUI release
// adds. The full lists (new and updated components and blocks) live at the top of the OmniaUI overview pages
// (/ui/components.html#whats-new and /ui/blocks.html#whats-new, scripts/build-galleries.mjs in the OmniaUI repo).
// Map: latest release (docs/release-history.json) -> counts of new and updated OmniaUI pages (../omniaUI/public/data/oc-*-nav.json,
//      "new" / "updated" set by its build-nav.mjs) -> HTML. Without the OmniaUI checkout next to this repo (CI) only the release shows.

import fs from "node:fs";
import path from "node:path";
import { OMNIAUI_URL, RELEASES, REPO } from "./site.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const date = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Items of one OmniaUI nav file that its newest release brought ("new") or added to ("updated"):
 *  [{ label, href, pro, since, updated }]; pro only for a page that is OmniaUI Pro as a whole ("all"), not Free + Pro. */
function freshItems(file) {
  const full = path.join(REPO, "..", "omniaUI", "public", "data", file);
  if (!fs.existsSync(full)) return [];
  const nav = JSON.parse(fs.readFileSync(full, "utf8"));
  return nav.leftSections.flatMap((g) => g.items).filter((i) => i.new || i.updated)
    .map((i) => ({ label: i.label, href: i.href, pro: i.pro === "all", since: i.new || i.updated, updated: !i.new }));
}

export function whatsNewHtml() {
  const latest = RELEASES[0];
  const components = freshItems("oc-components-nav.json");
  const blocks = freshItems("oc-blocks-nav.json");
  const since = components[0]?.since || blocks[0]?.since || "";
  // One link per gallery, with its count: "3 new, 12 updated components".
  const count = (kind, items) => {
    const fresh = items.filter((i) => !i.updated).length, updated = items.length - fresh;
    const text = [fresh && `${fresh} new`, updated && `${updated} updated`].filter(Boolean).join(", ");
    return text ? `<a href="${OMNIAUI_URL}/ui/${kind}.html#whats-new">${text} ${kind}</a>` : "";
  };
  const links = [count("components", components), count("blocks", blocks)].filter(Boolean).join(" · ");
  // Only one line on the docs home: the release and where to see what it brings.
  if (!latest) return "";
  const what = links ? ` What is new${since ? ` in v${esc(since)}` : ""}: ${links}.` : ` <a href="${OMNIAUI_URL}/ui/components.html">All components</a> · <a href="${OMNIAUI_URL}/ui/blocks.html">All blocks</a>`;
  return `<p class="dx-release">Latest release <a href="/release-notes.html#v${esc(latest.version.replace(/\./g, "-"))}"><b>v${esc(latest.version)}</b></a> on ${esc(date(latest.date))}.${what}</p>`;
}
