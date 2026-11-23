// File: apps/docs/src/lib/release-notes.mjs
// <oc-release-notes> on /release-notes.html: every release of OmniaCSS and OmniaUI (one shared version number), newest first.
// Source: docs/release-history.json, written by scripts/release.mjs ("npm run release"), so the page grows by itself.
// A release shows its English "notes" (summary + New / Improved / Check when you update / Fixed) when it has them;
// older releases only have the one-line summary. `code` in a note becomes <code>.
// Map: release -> anchor id (v0-17-0) -> jump list per minor series -> one <article> per release.

import { RELEASES } from "./site.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const date = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Anchor of a release: "0.17.0" -> "v0-17-0" (the link /release-notes.html#v0-17-0). */
export const releaseId = (version) => `v${version.replace(/\./g, "-")}`;

// Lists in this order; "changed" holds what can change an existing site.
const LISTS = [["new", "New"], ["improved", "Improved"], ["changed", "Check when you update"], ["fixed", "Fixed"]];

function article(r, latest) {
  const notes = r.notes || {};
  // Older summaries are one line without a closing period.
  const summary = (notes.summary || r.summary).replace(/([^.!?…])$/, "$1.");
  const lists = LISTS.filter(([key]) => notes[key]?.length).map(([key, label]) =>
    `<div class="rn-list rn-list--${key}"><h3>${label}</h3><ul>${notes[key].map((item) => `<li>${inline(item)}</li>`).join("")}</ul></div>`).join("");
  return `<article class="rn-release" id="${releaseId(r.version)}" aria-labelledby="${releaseId(r.version)}-title">
  <header class="rn-meta">
    <h2 id="${releaseId(r.version)}-title"><a href="#${releaseId(r.version)}">v${esc(r.version)}</a></h2>
    <p><time datetime="${esc(r.date)}">${esc(date(r.date))}</time>${latest ? ' <span class="oc-badge-version">latest</span>' : ""}</p>
  </header>
  <div class="rn-body">
    <p class="rn-summary">${inline(summary)}</p>${lists}
  </div>
</article>`;
}

export function releaseNotesHtml() {
  // Jump list: one row per minor series (0.17, 0.16 …), newest first.
  const series = new Map();
  for (const r of RELEASES) {
    const key = r.version.split(".").slice(0, 2).join(".");
    if (!series.has(key)) series.set(key, []);
    series.get(key).push(r);
  }
  const jump = [...series].map(([key, list]) => `<li><span>${esc(key)}</span>${list.map((r) => `<a href="#${releaseId(r.version)}">${esc(r.version)}</a>`).join("")}</li>`).join("");
  return `<nav class="rn-jump" aria-label="Versions"><ul>${jump}</ul></nav>
<div class="rn-releases" data-rn-list>${RELEASES.map((r, i) => article(r, i === 0)).join("\n")}</div>
<p class="rn-empty" data-rn-empty hidden>No release mentions that. Try a class name such as <code>glass</code> or a component such as <code>DataTable</code>.</p>`;
}
