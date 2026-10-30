// File: packages/core/src/postcss.mjs
// PostCSS plugin: replaces `@omnia;` (or `@omnia utilities;`) in your CSS with the OmniaCSS classes your
// project uses, and `@omniaui;` with the OmniaUI components, blocks and Pro blocks it uses (when installed).
// Works in every PostCSS pipeline (Vite, Laravel Vite, Next.js, Astro, webpack …).
//
//   // postcss.config.js
//   import omniacss from "@birdycom/omniacss/postcss";
//   export default { plugins: [omniacss({ content: ["resources/**/*.blade.php", "resources/js/**/*.{vue,tsx}"] })] };
//
//   /* app.css */
//   @omniaui;          (optional: `@omniaui components;`, `@omniaui components blocks;` …)
//   @omnia;
//
// Map: find directives -> scan content once -> OmniaUI CSS (installed packages, pruned) -> utilities (pruned, keep the
// palette tokens the components use) -> layer order -> dependencies for watch mode
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import postcss from "postcss";
import { collectCandidates, generate, loadFullCss } from "./engine.mjs";

/** The OmniaUI packages `@omniaui;` can bring in: [package, css file]. */
const OMNIAUI = {
  components: ["@birdycom/omniaui", "dist/components.css"],
  blocks: ["@birdycom/omniaui-blocks", "dist/blocks.css"],
  pro: ["@birdycom/omniaui-pro", "dist/pro.css"],
};

/**
 * The CSS of the OmniaUI packages named in the directive (none named: every installed one), from the project.
 * Returns the CSS and the names that were asked for but are not installed.
 */
async function omniauiSource(params, cwd) {
  const asked = params.split(/[\s,]+/).filter(Boolean);
  const unknown = asked.filter((k) => !OMNIAUI[k]);
  if (unknown.length) throw new Error(`omniacss: @omniaui ${unknown.join(" ")}: use components, blocks and/or pro`);
  const require = createRequire(path.join(cwd, "package.json"));
  let css = "";
  const missing = [];
  for (const key of asked.length ? asked : Object.keys(OMNIAUI)) {
    const [name, file] = OMNIAUI[key];
    let dir;
    try { dir = path.dirname(require.resolve(`${name}/package.json`)); } catch { if (asked.length) missing.push(name); continue; }
    css += "\n" + (await fs.readFile(path.join(dir, file), "utf8"));
  }
  return { css, missing };
}

/**
 * @param {{ content: string[], layer?: string|false, omniauiLayer?: string|false, keep?: string[], cwd?: string,
 *   referencedBy?: string[] }} options
 *   layer: cascade layer of the utilities ("omnia"); omniauiLayer: of the OmniaUI CSS ("omniaui"). With both, the
 *   utilities layer comes last, so a utility class on a component wins.
 *   referencedBy: CSS text of other stylesheets whose var(--…) tokens must stay (this stylesheet always counts).
 */
export default function omniacss(options = {}) {
  return {
    postcssPlugin: "omniacss",
    async Once(root, { result }) {
      const omnia = [], ui = [];
      root.walkAtRules("omnia", (at) => omnia.push(at));
      root.walkAtRules("omniaui", (at) => ui.push(at));
      if (!omnia.length && !ui.length) return;
      if (!options.content || !options.content.length) throw new Error("omniacss: no content globs given (e.g. ['src/**/*.{html,vue,jsx,tsx,php}'])");

      const cwd = options.cwd || process.cwd();
      const keep = options.keep || [];
      const layer = options.layer ?? "omnia";
      const uiLayer = options.omniauiLayer ?? "omniaui";
      // The stylesheet itself uses tokens too (`color: var(--color-teal-60)` next to `@omnia;`): keep those, without
      // having to list this file under content. Other CSS files: put them in content (or in referencedBy).
      const referencedBy = [root.toString(), ...(options.referencedBy || [])];
      const { candidates, files } = await collectCandidates(options.content, cwd);
      // `from`: the stylesheet being built, so Vite resolves url() in the generated CSS against it.
      const parse = (css) => postcss.parse(css, { from: result.opts.from }).nodes;

      let uiCss = "";
      if (ui.length) {
        const { css, missing } = await omniauiSource(ui[0].params, cwd);
        for (const name of missing) result.warn(`@omniaui: ${name} is not installed — skipped (npm i -D ${name})`, { node: ui[0] });
        uiCss = css ? generate(css, candidates, { layer: uiLayer, keep, referencedBy }) : "";
      }
      // The utilities keep the palette colors (--color-*) that the component tokens point to.
      const utilities = omnia.length ? generate(await loadFullCss(), candidates, { layer, keep, referencedBy: [...referencedBy, uiCss] }) : "";

      const first = [...omnia, ...ui].sort((a, b) => a.source.start.offset - b.source.start.offset)[0];
      if (omnia.length && ui.length && layer && uiLayer && layer !== uiLayer) first.before(postcss.atRule({ name: "layer", params: `${uiLayer}, ${layer}` }));
      if (ui.length) ui[0].replaceWith(parse(uiCss));
      if (omnia.length) omnia[0].replaceWith(parse(utilities));
      [...ui.slice(1), ...omnia.slice(1)].forEach((at) => at.remove());

      // Let Vite & co. rebuild when a content file changes.
      for (const file of files) {
        result.messages.push({ type: "dependency", plugin: "omniacss", file: path.resolve(file), parent: result.opts.from });
      }
    },
  };
}
omniacss.postcss = true;
