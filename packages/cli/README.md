# @birdycom/omniacss-cli

```bash
npm install -D @birdycom/omniacss-cli
npx omniacss init                    # omnia.config.json (detects Laravel, Astro, Nuxt, Vite)
npx omniacss build --watch           # only the CSS your project uses
npx omniacss build --minify
npx omniacss migrate scan            # Tailwind CSS -> OmniaCSS (needs @birdycom/omniacss-migrate)
```

Options: `-c/--content <glob>`, `-o/--output <file>`, `--no-components`, `--no-layer`. Node.js 22+. MIT

## Theme tokens for desktop apps

Native toolkits have no CSS engine. `omniacss tokens` writes the theme tokens resolved per mode (light/dark),
without `var()`, as sRGB hex gamut mapped like CSS Color 4, with the OmniaCSS version stamped in:

```bash
npx omniacss tokens --format json   --out tokens/omnia.tokens.json
npx omniacss tokens --format python --out myapp/omnia_tokens.py
npx omniacss tokens --format dtcg   --out tokens/omnia.dtcg.json   # W3C Design Tokens
npx omniacss tokens --format css    --out css/oc-theme.css         # the web side of the same source
```

`--source <file>` uses your own copy of `@birdycom/omniacss/tokens/semantic.json` (re-theme); `--out -` prints to stdout.

## Components and blocks

Components and blocks moved to **OmniaUI** (`@birdycom/omniaui`). Copy them into your project with its CLI:

```bash
npm install -D @birdycom/omniaui
npx omniaui add button modal
npx omniaui list -f vue
```

`omniacss build` still includes the OmniaUI CSS when `@birdycom/omniaui` (and, with `"blocks": true` in
`omnia.config.json`, `@birdycom/omniaui-blocks`) is installed, and the OmniaUI Pro CSS when `@birdycom/omniaui-pro`
is installed (`"pro": false` turns that off). Turn the components off with `--no-components`.
