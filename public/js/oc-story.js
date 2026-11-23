// File: public/js/oc-story.js
// The rebuilt April 2022 docs page (apps/docs/src/partials/story-2022.html, on the home and /story.html): the sidebar
// shows one section at a time inside the frame, marks the active link (aria-current) and never scrolls the page itself.
// Without this script every section stays visible and the sidebar links are plain anchors.
// Map: per [data-st-old] -> links + sections -> show(i) -> click (mouse/keyboard; keyboard moves focus to the heading)
(() => {
  for (const root of document.querySelectorAll("[data-st-old]")) {
    const main = root.querySelector(".st-old-main");
    const links = [...root.querySelectorAll(".st-old-nav a[href^='#']")];
    const sections = links.map((a) => root.querySelector(a.getAttribute("href")));
    if (!main || sections.some((s) => !s)) continue;
    const show = (i, focus) => {
      links.forEach((a, j) => (j === i ? a.setAttribute("aria-current", "location") : a.removeAttribute("aria-current")));
      sections.forEach((s, j) => { s.hidden = j !== i; });
      main.scrollTop = 0;
      if (focus) sections[i].querySelector("h3")?.focus({ preventScroll: true });
    };
    links.forEach((a, i) => a.addEventListener("click", (e) => {
      e.preventDefault();
      // e.detail is 0 for Enter on a focused link: move focus into the section for keyboard and screen reader users.
      show(i, e.detail === 0);
    }));
    root.classList.add("is-paged");
    show(Math.max(0, links.findIndex((a) => a.hasAttribute("aria-current"))), false);
  }
})();
