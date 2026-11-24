# Changelog

## 0.18.0

- Completions and hover CSS for the OmniaUI additions of 0.18.0 for overlays in a dialog: `oc-card--bare`,
  `oc-scroll-area--bare`, the time slots of a time field (`oc-time-picker`, `oc-time-slots`, `oc-time-slot`),
  `data-match-width` on a popover panel and `data-side` / `data-align` on a dropdown menu.
- The app parts of 0.18.0: the QR code of the barcode (`oc-barcode--qr`, `oc-barcode__qr`, `--oc-barcode-qr-size`), the
  striped track and split bar of the progress bar (`oc-progress--striped`, `oc-progress--split`, `oc-progress-segment`
  with `--success`, `--warning`, `--danger`, `--info`, `--muted`, and `oc-progress-legend`), compact alert rows
  (`oc-severity-card--compact`, `oc-severity-card--calm`, `oc-severity-card-text`), the sortable list
  (`oc-sortable-list`, `oc-sortable-item`, `__body`, `__arrows`, `--grabbed`, `--dragging`, `oc-dropline`,
  `oc-drag-ghost`), the floating and rounded sheet (`oc-sheet--floating`, `oc-sheet--rounded`, `--oc-sheet-max`,
  `--oc-sheet-margin`), the code input variants (`oc-otp--block`, `oc-otp--lg`, `oc-otp--tiles`), the stat list
  (`oc-dl--stat`, `oc-dl-sub`, `oc-dl-row--total`), the compact sync status (`oc-status--compact`, `oc-status__count`),
  the staging and offline modes and the environment frame (`oc-env-frame`, `--contained`, `--oc-mode-staging`,
  `--oc-mode-offline`), the toast action button (`oc-toast-action`) and `oc-copy-field--block`.
- The media state variants of OmniaCSS: `playing:`, `paused:`, `seeking:`, `buffering:`, `stalled:`, `muted:` and
  `volume-locked:`.

## 0.17.3

- `break-words` (overflow-wrap: break-word) next to `wrap-break-word` and `wrap-anywhere`.
- The display titles (`oc-display`, `oc-display--page`) break long words, and the contact form block follows
  `--oc-block-gap` on a narrow screen.

## 0.17.2

- Completions and hover CSS for the OmniaUI additions of 0.17.2: the header combobox (`oc-combobox--ghost`,
  `oc-combobox--header`, `oc-combobox--icon-only`, `oc-combobox-code`), the radio group in a dropdown and the bulk
  action bar of the data table (`oc-data-table-bulk`).

## 0.17.0

- Completions and hover CSS for the OmniaUI additions of 0.17.0: module colors (`data-module`, `--oc-module`,
  `--oc-module-soft`, `--oc-module-fg`), the ledger variant (`oc-input--ledger`), the hero media
  (`oc-hero-media`, `--center`, `--end`, `--scrim`), the scrim (`oc-scrim`, `--dark`, `--top`, `--start`, `--end`,
  `--full`, `oc-scrim-content`), the floating heart button (`oc-btn--float`), the calendar (`oc-calendar`), the
  countdown (`oc-countdown`), the save status (`oc-status`), `oc-barcode--bare`, `oc-copy-field--display` and `--wrap`,
  `oc-otp--fit` and `--group`, the sortable row (`oc-sortable-row`, `oc-sortable-row-grip`) and `oc-dl--numbered`.
- The OmniaCSS additions of 0.17.0: the `d-*` display aliases (`d-block`, `d-flex` ...) with their responsive variants and
  the print utilities `print-hidden`, `print-only`, `print-light` and `page-a4`.

## 0.17.1

- Completions and hover CSS for the OmniaUI additions of 0.17.1: `oc-btn--inherit` (an outline or ghost button that
  follows the text color around it) and the button theming tokens `--oc-btn-radius`, `--oc-btn-hover-mix`,
  `--oc-btn-hover-tint`, `--oc-btn-hover-opacity`, `--oc-btn-outline-mix` and `--oc-btn-disabled-opacity`.
- The status badges (`oc-badge--status` with `data-status`), the read-only badge, the compound breadcrumb parts
  (`oc-breadcrumb-item`, `oc-breadcrumb-separator`, `oc-breadcrumb-ellipsis`), the active cell of the one-time code
  (`data-otp-active` on `oc-otp`) and the collapsible search of the app header (`oc-block-appbar-search--collapse`).
- The `--oc-info` token is sky blue, and `.dark` / `.light` on `<html>` also set `color-scheme`.

## 0.16.1

- Completions and hover CSS for the OmniaUI additions of 0.16.1: `oc-icon--xs` … `oc-icon--xl` (Webicon sizes),
  `oc-card--fill`, `oc-live-frame--laptop` and the card band height token.

## 0.16.0

- Completions and hover CSS for the new utilities: `border-conic-spin`, `shadow-neon`, `text-shadow-neon`,
  `text-shadow-3d`, `text-shadow-3d-2`, `glass`, `animate-float`, `animate-typing`, `animate-wave`, `animate-beat`,
  `transition-clip`, `clip-circle-0`, `clip-circle-cover`, `mask-ring`, `bg-size-full`, `bg-size-x-0`, `bg-size-y-0`,
  `ease-overshoot` and `scroll-buttons-outside`.
- The new OmniaUI parts: paper, combobox with icons, language menu, logo, mode badge, code plate, card accent band,
  sheet options (glass, inset, footer panel), sidebar meta, and the blocks type picker, content blocks, route steps,
  route progress and step view.
- `hover:scale-*`, `hover:rotate-*` and `hover:translate-*` show the CSS they now generate (the individual
  `scale`, `rotate` and `translate` properties, so the change is no longer applied twice).

## 0.14.2

- `oc-dl--flush` (a definition list without a line above it).
- The OmniaCSS build keeps element modifiers built in code, such as `oc-terminal-log__line--{{ $level }}` in Blade:
  before, the `__` in the name made it keep only `line--*`, so those classes were missing from the CSS.
- `dialog.oc-modal` is as large as its card instead of the whole screen, so `closedby="any"` closes it on a click next
  to the card (before, that click counted as inside the dialog). The size modifiers keep working.

## 0.14.1

- Completions and hover CSS for the new OmniaUI parts: tint card (`oc-tint-card`, `__head`, `__title`, `__text`,
  `__meta`, `__go`, `__art`, `__link`, `--success`, `--warning`, `--destructive`, `--info`, `--muted`, `--lg`), the split
  section head (`oc-section-head--split`), document layout (`oc-doc-layout`, `--end`, `__aside`, `__main`), the table of
  contents group label (`oc-toc-group-label`), `oc-prose--ruled` and the glossary (`oc-dl--glossary`).
- The Pro shape of the tint card (`oc-tint-card--fill`) appears in projects that have OmniaUI Pro.
- New modifiers: `oc-status-dot--still`, `oc-progress--live`, `oc-meter-list--live`.
- Step list (`oc-step-list`, `--sm`): a compact numbered list of steps in a card.

## 0.14.0

- Completions and hover CSS for the new OmniaUI parts: meter row sub-line (`oc-meter-row__sub`, `__subbar`, `__fill`,
  `oc-meter-list--dense`), reading (`oc-reading`, `--warm`, `--hot`), callout (`oc-callout`, `__text`, `__action`),
  static menu (`oc-dropdown-menu--static`, `--flat`, `oc-dropdown-check`, `oc-dropdown-hint`), `oc-language-select--code`,
  group (`oc-group`, `__head`, `__title`, `__aside`, `__meta`), the accordion status dot (`oc-accordion-accent-dot`,
  `oc-accordion-item--info`, `--muted`), neon (`oc-glow-border`, `oc-btn--neon`), backgrounds (`oc-bg-grid`, `oc-orb`,
  `oc-scanlines`, `oc-particles`), graph (`oc-graph`, `__edge`, `__node`, `__tip` …) and `oc-lead--plain`.
- The Pro network graph (`oc-network-graph`) appears in projects that have OmniaUI Pro.

## 0.13.0

- Completions and hover CSS for the new OmniaUI site parts: forms (`oc-form`, `--filled`, `oc-form-actions`,
  `oc-form-note`, `oc-honeypot`, `oc-textarea`), panel (`oc-panel`, `--glow`, `--glow-end`, `--glow-both`), result
  (`oc-result`, `__title`, `__text`, `__actions`, `--center`), brand mark, page sections (`oc-page-header`,
  `oc-section-head`, `oc-actions`, `oc-band`, `oc-meta`, `oc-text-muted`, `oc-text-subtle`), feature and link cards,
  icon list, shot grid, fly-in (`oc-reveal--fly`), `oc-skip-link` and `oc-icon`.
- Hover effects for any card: `oc-hover-lift`, `oc-hover-grow`, `oc-hover-glow`, `oc-hover-none`.
- The new block `oc-block-contact-form`; the Pro block event scene appears in projects that have OmniaUI Pro.

## 0.12.4

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
