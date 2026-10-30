// File: packages/core/src/postcss.mjs
// PostCSS plugin: replaces `@omnia;` (or `@omnia utilities;`) in your CSS with the OmniaCSS classes your
// project uses. Works in every PostCSS pipeline (Vite, Laravel Vite, Next.js, Astro, webpack …).
//
//   // postcss.config.js
//   import omniacss from "@birdycom/omniacss/postcss";
//   export default { plugins: [omniacss({ content: ["resources/**/*.blade.php", "resources/js/**/*.{vue,tsx}"] })] };
//
//   /* app.css */
//   @omnia;
//
// Author: Serge Cools | Framework: OmniaCSS

import path from "node:path";
import postcss from "postcss";
import { buildCss } from "./engine.mjs";

/**
 * @param {{ content: string[], layer?: string|false, keep?: string[], cwd?: string, referencedBy?: string[] }} options
 *   referencedBy: CSS text of other stylesheets whose var(--…) tokens must stay (this stylesheet always counts).
 */
export default function omniacss(options = {}) {
  return {
    postcssPlugin: "omniacss",
    async Once(root, { result }) {
      const directives = [];
      root.walkAtRules("omnia", (at) => directives.push(at));
      if (!directives.length) return;

      const cwd = options.cwd || process.cwd();
      // The stylesheet itself uses tokens too (`color: var(--color-teal-60)` next to `@omnia;`): keep those, without
      // having to list this file under content. Other CSS files: put them in content (or in referencedBy).
      const own = root.toString();
      const { css, files } = await buildCss({ content: options.content, cwd, layer: options.layer ?? "omnia", keep: options.keep, referencedBy: [own, ...(options.referencedBy || [])] });
      // `from`: the stylesheet being built, so Vite resolves url() in the generated CSS against it.
      const generated = postcss.parse(css, { from: result.opts.from });

      directives[0].replaceWith(generated.nodes);
      directives.slice(1).forEach((at) => at.remove());

      // Let Vite & co. rebuild when a content file changes.
      for (const file of files) {
        result.messages.push({ type: "dependency", plugin: "omniacss", file: path.resolve(file), parent: result.opts.from });
      }
    },
  };
}
omniacss.postcss = true;
