# @birdycom/omniacss

OmniaCSS utilities — modern CSS (anchor positioning, container queries, view transitions, scroll-driven animations, `light-dark()`, gradients, logical properties …) as utility classes, **generated on demand**.

```bash
npm install -D @birdycom/omniacss
```

**PostCSS / Vite / Laravel** — put `@omnia;` in your CSS:

```js
// postcss.config.js
import omniacss from "@birdycom/omniacss/postcss";
export default { plugins: [omniacss({ content: ["src/**/*.{html,js,vue,tsx}"] })] };
```

**Engine API**

```js
import { buildCss } from "@birdycom/omniacss/engine";
const { css, stats } = await buildCss({ content: ["src/**/*.html"], layer: "omnia" });
```

Full build (prototyping): `import "@birdycom/omniacss"` · palette tokens: `@birdycom/omniacss/tokens` · theme tokens: `@birdycom/omniacss/theme` · SCSS: `@birdycom/omniacss/scss/*`.

## Theme tokens (web and desktop)

`tokens/semantic.json` is the single source of the semantic theme: `--oc-background`, `--oc-foreground`,
`--oc-primary`, `--oc-border`, the interaction states `--oc-row-alt`, `--oc-hover`, `--oc-pressed`,
`--oc-selected`, `--oc-disabled-foreground`, plus `--oc-radius`, `--oc-focus-width`, fonts and shadows.
Every color is an Omnia palette token, light first, dark second.

- **Web:** `dist/oc-theme.css` (load after `oc-colors.css`) — `light-dark()` custom properties. OmniaUI builds on it.
- **Desktop apps** (Tkinter, Qt, WinUI …): `dist/tokens/` holds the same tokens resolved per mode, with no
  `var()` left, as sRGB hex (gamut mapped the CSS Color 4 way, not clipped), the source `oklch` and alpha apart,
  and the OmniaCSS version on top:
  - `omnia.tokens.json` — `{ omniacss, tokens: { background: { light: { hex, oklch }, dark: { … } }, radius: { px }, … } }`
  - `omnia.dtcg.json` — W3C Design Tokens (light as `$value`, dark in `$extensions`)
  - `omnia_tokens.py` — `PALETTES = {"light": {…}, "dark": {…}}`, `SIZES`, `TEXT`, `FONTS`, `SHADOWS`, `font()`

  No Node in your app? Download them from the CDN: `https://unpkg.com/@birdycom/omniacss@<version>/dist/tokens/omnia_tokens.py`.
  With your own theme: `npx omniacss tokens --source my-semantic.json --format python` (see `@birdycom/omniacss-cli`).

Docs: https://github.com/Birdycom/OmniaCSS#readme — MIT
