# Changelog

## Unreleased

- Completions and hover CSS for the new OmniaUI widget parts: status dot (`oc-status-dot`, `--working`, `oc-status`),
  glass (`oc-glass`, `oc-glass-panel`, `--flat`), title bar (`oc-titlebar`, `__btn--close`, `oc-titlebar-body`), and the
  new modifiers `oc-progress--glow`, `oc-progress-marker`, `oc-alert--inline`, `oc-btn--inline` and `oc-prose--compact`.
- `oc-price-card__price--lifetime`: the optional third price of the price card (radio `value="lifetime"`).

## 0.12.2

- Completions and hover CSS for the new OmniaUI components: watermark (`oc-watermark`, `--tile`, `--corner`,
  `__stack` …), live frame (`oc-live-frame`, `--static`) and link row (`oc-link-row`, `--accent`, `--muted`).
  The Pro blocks spotlight cards, device mockups and ecosystem map appear in projects that have OmniaUI Pro installed.
- No more false "Duplicate class '+'" warnings for markup built in a JavaScript or PHP string
  (`'<i class="a ' + cls + '">'`): only the literal parts of such a class value are read.

## 0.12.1

- No more "is not an OmniaCSS utility" warnings in projects that still run on Tailwind class names (`tailwindcss`,
  `@tailwindcss/vite`, `@tailwindcss/postcss` or `@birdycom/omniacss-migrate` in the nearest `package.json`).
  Duplicate classes are still reported. `omniacss.lint.tailwindProjects: "lint"` turns the old behaviour back on,
  for example to see what a migration still has to change.

## 0.12.0

First release on the VS Code Marketplace and Open VSX.

- OmniaUI classes: completions and hover CSS for every component and block class (`oc-btn`, `oc-card`,
  `oc-tooltip__title`, `oc-block-…`). The free OmniaUI classes ship with the extension; when the project has
  `@birdycom/omniaui`, `-blocks` or `-pro` installed, the classes and CSS of that installed version are used, so
  OmniaUI Pro classes appear only in projects that have Pro.
- The `unknownClass` lint (off by default) no longer flags OmniaUI classes.
- New icon: the OmniaCSS palette with a code badge, in the omniacss.eu colors (256 px).

## 0.11.0

Version only, in step with `@birdycom/omniacss` 0.11.0. The extension itself is unchanged.

## 0.10.0

Version only, in step with `@birdycom/omniacss` 0.10.0. The extension itself is unchanged.

## 0.9.0

Version only, in step with `@birdycom/omniacss` 0.9.0. The extension itself is unchanged.

## 0.8.4

Version only, in step with `@birdycom/omniacss` 0.8.4. The extension itself is unchanged.

## 0.8.3

- README pictures are product shots: a window bar, 2× stills and a banner taken from the live editor.

## 0.8.2

- Published as `Birdycom.omniacss-intellisense` on the VS Code Marketplace and Open VSX, so editors update it automatically.
- New icon, and a README with a demo and pictures of each feature, recorded in VS Code.
- Completion details for color utilities now show the generated CSS (they showed only the color).

## 0.8.1

Version only, in step with `@birdycom/omniacss` 0.8.1. The extension itself is unchanged.

## 0.8.0

First release, in step with `@birdycom/omniacss` 0.8.0.

- Autocomplete for every OmniaCSS utility and variant (`hover:`, `cq-md:`, `group-hover/card:`, `data-[…]:` …).
- Hover shows the CSS a class generates, variants included.
- Color swatches for color utilities and `var(--color-…)` tokens; the color picker picks the nearest Omnia color.
- Linting for unknown variants, unknown utilities behind a variant, and duplicate classes, with quick fixes.
