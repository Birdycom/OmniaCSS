// File: apps/docs/src/lib/compat.mjs
// Build-time browser support table (data: public/data/browser-support.json from MDN browser-compat-data).
// Same markup and classes as before (.oc-compat*), but rendered while building — no JavaScript in the page.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO } from "./site.mjs";

// Any MDN key that is not in the prebuilt JSON is looked up directly (same summary rules).
const bcdLib = await import(/* @vite-ignore */ pathToFileURL(path.join(REPO, "scripts/lib/bcd-support.mjs")).href);

let data;
let logos;
function load() {
  data ??= JSON.parse(fs.readFileSync(path.join(REPO, "public/data/browser-support.json"), "utf8"));
  logos ??= JSON.parse(fs.readFileSync(path.join(REPO, "public/data/browser-logos.json"), "utf8"));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const STATES = {
  yes: { icon: "✓", label: "Supported since" },
  partial: { icon: "◐", label: "Partial support since" },
  preview: { icon: "◷", label: "Coming: in preview / beta" },
  flag: { icon: "⚑", label: "Behind a flag since" },
  no: { icon: "✕", label: "Not supported" },
};

function logo(id, name) {
  const l = logos[id];
  if (!l) return "";
  return `<svg class="oc-compat__logo" viewBox="${l.viewBox}" role="img" aria-label="${esc(name)}"><title>${esc(name)}</title>${l.body}</svg>`;
}

function cell(browser, s, first) {
  const st = STATES[s.state] || STATES.no;
  const version = s.state === "preview" ? "Preview" : s.state === "no" ? "No" : (s.version || "").replace("≤", "≤ ");
  let tip = `${browser.name}: ${st.label}${s.version && s.state !== "preview" && s.state !== "no" ? " " + s.version : ""}`;
  const notes = [...(s.notes || []), ...(s.earlier ? [`earlier: ${s.earlier}`] : [])];
  if (notes.length) tip += " — " + notes.join("; ");
  const earlier = s.earlier ? `<span class="oc-compat__earlier">◐ ${esc(s.earlier.replace("partial since ", "").replace(" since ", " "))}</span>` : "";
  return `<td class="${first ? "oc-compat__first-mobile " : ""}oc-compat__cell is-${s.state}" title="${esc(tip)}"><span class="oc-compat__icon" aria-hidden="true">${st.icon}</span><span class="oc-compat__version">${esc(version)}</span>${earlier}<span class="sr-only">${esc(tip)}</span></td>`;
}

/** @param {string[]} keys MDN browser-compat-data keys, e.g. ["css.properties.clip-path"] */
export function compatTable(keys) {
  load();
  const desktop = data.browsers.filter((b) => b.group === "desktop");
  const mobile = data.browsers.filter((b) => b.group === "mobile");
  const ordered = [...desktop, ...mobile];
  const head =
    `<tr><th scope="col" rowspan="2" class="oc-compat__feature-head">Feature</th>` +
    `<th scope="colgroup" colspan="${desktop.length}" class="oc-compat__group">Desktop</th>` +
    `<th scope="colgroup" colspan="${mobile.length}" class="oc-compat__group oc-compat__group--mobile">Mobile</th></tr><tr>` +
    ordered.map((b, i) => `<th scope="col" class="oc-compat__browser${i === desktop.length ? " oc-compat__first-mobile" : ""}">${logo(b.logo, b.name)}<span class="oc-compat__browser-name">${esc(b.name)}</span></th>`).join("") +
    "</tr>";
  const rows = keys.map((key) => {
    const f = data.features[key] ?? (data.features[key] = bcdLib.featureEntry(key));
    if (!f) return `<tr><th scope="row">${esc(key)}</th><td colspan="${ordered.length}">No data — run npm run compat:build</td></tr>`;
    const badges = (f.status.experimental ? ' <span class="oc-compat__badge">experimental</span>' : "") + (f.status.deprecated ? ' <span class="oc-compat__badge oc-compat__badge--deprecated">deprecated</span>' : "");
    const name = f.mdn ? `<a href="${esc(f.mdn)}" target="_blank" rel="noopener"><code>${esc(f.label)}</code></a>` : `<code>${esc(f.label)}</code>`;
    return `<tr><th scope="row" class="oc-compat__feature">${name}${badges}</th>${ordered.map((b, i) => cell(b, f.support[b.id] || { state: "no" }, i === desktop.length)).join("")}</tr>`;
  }).join("");
  const legend = `<ul class="oc-compat__legend">${Object.entries(STATES).map(([k, v]) => `<li class="is-${k}"><span aria-hidden="true">${v.icon}</span> ${v.label.replace(" since", "")}</li>`).join("")}</ul>`;
  const source = `<p class="oc-compat__source">Version = first release with support. Hover a cell for notes. Data: <a href="https://github.com/mdn/browser-compat-data" target="_blank" rel="noopener">MDN browser-compat-data</a> ${esc(data.source.version)} (${esc(String(data.source.timestamp).slice(0, 10))}).</p>`;
  return `<div class="oc-compat"><div class="oc-compat__scroll"><table class="oc-compat__table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>${legend}${source}</div>`;
}

/**
 * Support summary for a page's badge: "baseline" when every feature works in Chrome, Firefox and Safari (desktop and
 * mobile), "newest" when at least one engine lacks a feature. Returns null without data.
 * @param {string[]} keys
 * @returns {{ level: "baseline" | "newest", missing: string[] } | null}
 */
export function supportSummary(keys) {
  load();
  const engines = ["chrome", "firefox", "safari", "chrome_android", "safari_ios"];
  const missing = [];
  let known = 0;
  for (const key of keys) {
    const f = data.features[key] ?? (data.features[key] = bcdLib.featureEntry(key));
    if (!f) continue;
    known++;
    if (!engines.every((id) => f.support[id]?.state === "yes")) missing.push(f.label);
  }
  if (!known) return null;
  return { level: missing.length ? "newest" : "baseline", missing };
}

/** True when MDN has data for the key. */
export const hasCompat = (key) => !!bcdLib.lookup(key);

/** MDN page + label for a browser-compat-data key (null when MDN has no page for it). */
export function mdnLink(key) {
  load();
  const f = data.features[key] ?? (data.features[key] = bcdLib.featureEntry(key));
  return f?.mdn ? { href: f.mdn, label: f.label } : null;
}
