// File: apps/docs/src/lib/whats-new.mjs
// <oc-whats-new> on the docs home: the latest OmniaCSS release and what the newest OmniaUI release adds.
// Map: latest release (docs/release-history.json) -> new OmniaUI pages (../omniaUI/public/data/oc-*-nav.json,
//      "new" set by its build-nav.mjs) -> HTML. Without the OmniaUI checkout next to this repo (CI) only the release shows.

import fs from "node:fs";
import path from "node:path";
import { OMNIAUI_URL, RELEASES, REPO } from "./site.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const date = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** New items of one OmniaUI nav file: [{ label, href, pro, since }]. */
function newItems(file) {
  const full = path.join(REPO, "..", "omniaUI", "public", "data", file);
  if (!fs.existsSync(full)) return [];
  const nav = JSON.parse(fs.readFileSync(full, "utf8"));
  return nav.leftSections.flatMap((g) => g.items).filter((i) => i.new).map((i) => ({ label: i.label, href: i.href, pro: Boolean(i.pro), since: i.new }));
}

export function whatsNewHtml() {
  const latest = RELEASES[0];
  const components = newItems("oc-components-nav.json");
  const blocks = newItems("oc-blocks-nav.json");
  const since = components[0]?.since || blocks[0]?.since || "";
  const chip = (i) => `<a class="dx-new-chip" href="${OMNIAUI_URL}${esc(i.href)}">${esc(i.label)}${i.pro ? '<em>Pro</em>' : ""}</a>`;
  const group = (title, items) => items.length ? `<div class="dx-new-group"><h3>${title} <small>${items.length}</small></h3><div class="dx-new-chips">${items.map(chip).join("")}</div></div>` : "";
  return `<aside class="dx-new" aria-labelledby="whats-new-title">
          <div class="dx-new-head"><span class="dx-new-badge">New</span><h2 id="whats-new-title">What is new${since ? ` in v${esc(since)}` : ""}</h2>
          ${latest ? `<p>Latest release <b>v${esc(latest.version)}</b> on ${esc(date(latest.date))}. <a href="${OMNIAUI_URL}/ui/components.html">All components</a> · <a href="${OMNIAUI_URL}/ui/blocks.html">All blocks</a></p>` : ""}</div>
          ${group("Components", components)}${group("Blocks", blocks)}
        </aside>`;
}
