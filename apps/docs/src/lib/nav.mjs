// File: apps/docs/src/lib/nav.mjs
// Build-time sidebars from the navigation JSON files (public/data/oc-*-nav.json) — the docs use the
// OmniaCSS components themselves: .oc-sidebar--docs (left) and .oc-toc (right). No JavaScript in the page.

import fs from "node:fs";
import path from "node:path";
import { REPO } from "./site.mjs";

// Only the CSS docs have a sidebar here; the components/blocks/icons navs moved to the OmniaUI site.
const NAV_FILES = {
  docs: "oc-docs-nav.json",
};
const cache = {};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function navData(section) {
  const file = NAV_FILES[section];
  if (!file) return null;
  cache[section] ??= JSON.parse(fs.readFileSync(path.join(REPO, "public/data", file), "utf8"));
  return cache[section];
}

/** Docs nav JSON uses hrefs relative to /docs/ and children relative to their module folder. */
function docsHref(href, folder) {
  if (!href || href.startsWith("#") || href.startsWith("/") || href.startsWith("http")) return href || "#";
  if (href.includes("/")) return `/docs/${href}`;
  return folder ? `/docs/${folder}/${href}` : `/docs/${href}`;
}

const samePage = (href, route) => {
  const target = href.endsWith("/") ? href + "index.html" : href;
  return target === "/" + route;
};

/** Left sidebar HTML for a page. */
export function leftSidebar(section, route) {
  const data = navData(section);
  if (!data) return "";
  const isDocs = section === "docs";
  const groups = (data.leftSections || []).map((group) => {
    const items = (group.items || []).map((item) => {
      const folder = isDocs && item.href?.includes("/") ? item.href.split("/")[0] : "";
      const href = isDocs ? docsHref(item.href, "") : item.href;
      const inModule = isDocs ? (folder ? route.startsWith(`docs/${folder}/`) : samePage(href, route)) : samePage(href, route);
      const active = inModule ? `${samePage(href, route) ? ' aria-current="page"' : ' class="oc-sidebar-menu-button is-active"'} data-ocd-active="true"` : "";
      let children = "";
      if (Array.isArray(item.children) && item.children.length) {
        children = `<ul class="oc-sidebar-menu-sub">${item.children.map((child) => {
          const childHref = isDocs ? docsHref(child.href, folder) : child.href;
          const childActive = samePage(childHref, route) ? ' aria-current="page" data-ocd-active="true"' : "";
          return `<li><a class="oc-sidebar-menu-button" href="${esc(childHref)}"${childActive}>${esc(child.label || "")}</a></li>`;
        }).join("")}</ul>`;
      }
      return `<li><a${active.includes("class=") ? "" : ' class="oc-sidebar-menu-button"'} href="${esc(href)}"${active}>${esc(item.label)}</a>${children}</li>`;
    }).join("");
    return `<p class="oc-sidebar-group-label">${esc(group.title)}</p><ul class="oc-sidebar-menu">${items}</ul>`;
  }).join("");
  return `<nav class="oc-sidebar oc-sidebar--docs" aria-label="${esc(data.sidebarTitle || "Navigation")}"><h2 class="oc-sidebar-title">${esc(data.sidebarTitle || "OmniaCSS Docs")}</h2>${groups}</nav>`;
}

/** Right sidebar ("On this page") from the headings found in the page content. */
export function tocSidebar(toc) {
  if (!toc.length) return "";
  const items = toc.map((h) => `<li${h.level === 3 ? ' class="oc-toc-item--sub"' : ""}><a class="oc-toc-link" href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join("");
  return `<nav class="oc-toc" aria-label="On this page"><p class="oc-toc-title">On This Page</p><ul class="oc-toc-list">${items}</ul></nav>`;
}
