// File: public/js/oc-docs-v2.js
// Docs v2 behaviour, shared by the OmniaCSS and OmniaUI sites (identical copy in both repos). Loaded with "defer".
// Map: copy buttons on code blocks -> search dialog (Ctrl K, "/", the top bar button) over /data/search-index.json
// Everything else on the docs pages (demo tabs, widths, theme switch, tabs, accordions) works without JavaScript.
(() => {
  // ---- Copy buttons on code blocks ----
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-oc-copy]");
    if (!btn) return;
    const code = btn.closest(".oc-code-block")?.querySelector("pre.code-preview")?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(code.replace(/\n$/, ""));
      btn.textContent = "Copied";
      btn.classList.add("is-copied");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(btn.closest(".oc-code-block").querySelector("pre.code-preview"));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      btn.textContent = "Selected";
    }
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("is-copied"); }, 1600);
  });

  // ---- Search ----
  const dialog = document.getElementById("ocd-search");
  if (!dialog) return;
  const input = dialog.querySelector("input");
  const list = dialog.querySelector(".ocd-search-results");
  const empty = dialog.querySelector(".ocd-search-empty");
  let index = null, items = [], active = 0;

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const mark = (text, words) => {
    let html = esc(text);
    for (const w of words) if (w.length > 1) html = html.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "<mark>$1</mark>");
    return html;
  };

  async function load() {
    if (index) return index;
    try { index = await (await fetch("/data/search-index.json")).json(); } catch { index = []; }
    return index;
  }

  // Score: every word must appear in the title, heading or keywords; title and start-of-word hits rank higher.
  function search(query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    for (const page of index) {
      const hay = fold(`${page.t} ${page.g} ${page.k || ""}`);
      const title = fold(page.t);
      if (words.every((w) => hay.includes(w))) {
        let score = 10 + words.reduce((n, w) => n + (title.includes(w) ? 5 : 0) + (title.startsWith(w) ? 5 : 0), 0);
        hits.push({ score, title: page.t, sub: page.g, url: page.u });
      }
      for (const h of page.h || []) {
        const ht = fold(h[1]);
        if (words.every((w) => ht.includes(w) || title.includes(w))) {
          const score = words.reduce((n, w) => n + (ht.includes(w) ? 3 : 0), 0);
          if (score) hits.push({ score, title: h[1], sub: `${page.g} › ${page.t}`, url: `${page.u}#${h[0]}` });
        }
      }
    }
    return hits.sort((a, b) => b.score - a.score || a.title.length - b.title.length).slice(0, 30);
  }

  function render() {
    const query = input.value.trim();
    const words = fold(query).split(/\s+/).filter(Boolean);
    items = query ? search(query) : (index || []).filter((p) => p.f).map((p) => ({ title: p.t, sub: p.g, url: p.u }));
    active = 0;
    list.innerHTML = (query ? "" : '<li class="ocd-search-group" role="presentation">Popular</li>') + items.map((it, i) =>
      `<li role="presentation"><a href="${esc(it.url)}" role="option" id="ocd-r${i}" aria-selected="${i === 0}"><b>${mark(it.title, words)}</b><span>${esc(it.sub)}</span></a></li>`).join("");
    empty.hidden = !query || items.length > 0;
    input.setAttribute("aria-activedescendant", items.length ? "ocd-r0" : "");
  }

  function move(step) {
    if (!items.length) return;
    active = (active + step + items.length) % items.length;
    list.querySelectorAll("[role=option]").forEach((a, i) => a.setAttribute("aria-selected", String(i === active)));
    const el = document.getElementById(`ocd-r${active}`);
    el?.scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", `ocd-r${active}`);
  }

  async function open() {
    if (dialog.open) return;
    dialog.showModal();
    input.select();
    await load();
    render();
  }

  document.addEventListener("click", (e) => { if (e.target.closest("[data-ocd-search]")) open(); });
  document.addEventListener("keydown", (e) => {
    const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); open(); }
  });
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && items[active]) { e.preventDefault(); location.href = items[active].url; dialog.close(); }
  });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
})();
