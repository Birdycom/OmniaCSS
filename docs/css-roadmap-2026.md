# OmniaCSS roadmap: new CSS not yet in OmniaCSS (2026)

Internal planning document, not published. It lives in `docs/`, not in `apps/docs`.

**Date:** 2026-10-29.

**Question:** which CSS features have shipped (or are close to shipping) since 2025 that OmniaCSS does not cover yet?

**Method:**
- A search of ~140 feature names in `packages/core/dist/omnia.css` (the full build), `packages/core/src/variants.mjs` (the variants) and `apps/docs/src/content` (the docs pages).
- Browser news: web.dev's "New to the web platform" and Baseline digests, Chrome release notes 140–152, WebKit's WWDC26 / Safari 27 notes, and Interop 2026.

**Caveat on support data:** the search sources sometimes contradicted each other. Every support claim below must be checked against MDN / caniuse before building. A version marked "beta" or "flag" may have moved since this date.

## Already covered: no work needed

OmniaCSS already has utilities or docs for nearly all of modern CSS. These checks found classes in the build:

| Area | Features |
|---|---|
| Form controls and selects | `field-sizing`, `appearance: base-select` and `::picker(select)` |
| Text and typography | `text-box` / `text-box-trim` / `text-box-edge`, `text-fit`, `text-justify`, `ruby-*`, `text-wrap`, `line-clamp`, `text-spacing-trim`, `text-autospace`, `word-break: auto-phrase`, `hanging-punctuation`, `initial-letter`, `font-size-adjust`, `font-palette`, `math-depth`, `caret-shape` / `caret-animation` |
| Functions | `sibling-index()` / `sibling-count()`, `progress()` (docs), `attr()` (docs) |
| Shapes and corners | `corner-shape`, `shape()` |
| Layout | `column-wrap` / `column-height`, gap decorations (`row-rule`, `rule-break`), `reading-flow` / `reading-order`, `interpolate-size`, `::details-content`, `zoom`, `stretch` |
| Scroll | scroll-state container queries (`stuck:`, `snapped:`, `scrollable-*:`), `::scroll-marker` / `scroll-target-group` / `scroll-initial-target`, scroll and view timelines |
| Anchor positioning | `anchor-scope`, `position-area`, `position-try`, `position-visibility`, `anchor-size()` |
| View transitions | `view-transition-class`, `view-transition-scope` |
| Rendering and color | `dynamic-range-limit`, `content-visibility`, `light-dark()`, OKLCH, `color-mix()` |

Language features documented without utilities, and fine that way because they are author-level CSS: `@function` and `if()`, `calc-size()`, `random()`, `@scope`, `@layer`, `@property`, `@custom-media`.

## Missing: candidates for a later release

The priority reflects browser support plus how well the feature fits a utility or variant.

**H** = Baseline or Interop 2026, cheap to add. **M** = one engine or behind a flag, worth an `experimental-css` entry. **L** = niche, or best left to plain CSS.

### Variants (packages/core/src/variants.mjs)

| # | Feature | Support (check first) | Proposed OmniaCSS form | Prio |
|---|---|---|---|---|
| 1 | Media-element pseudo-classes `:playing`, `:paused`, `:seeking`, `:buffering`, `:stalled`, `:muted`, `:volume-locked` | Interop 2026. web.dev's Aug 2026 digest reports Baseline; MDN still says limited | `playing:`, `paused:`, `seeking:`, `buffering:`, `stalled:`, `muted:`, `volume-locked:` (PSEUDO_CLASS) plus `group-paused:` and similar via group | H |
| 2 | Custom element states `:state(name)` | Baseline 2024 (CustomStateSet) | `state-[name]:` → `&:state(name)` | H |
| 3 | `:modal`, `:fullscreen`, `:picture-in-picture` | Long supported | `modal:`, `fullscreen:`, `pip:` | H |
| 4 | Container style queries `@container style(--x: y)` | Interop 2026 (Chrome, Safari; Firefox in progress) | `style-[--theme:dark]:` → `@container style(--theme: dark)`; maybe also named `@cq/style-[…]:` | H |
| 5 | Customizable `<select>` parts `::picker(select)`, `::checkmark`, `::picker-icon` | Chrome 135+, Safari 27 (beta at WWDC26), Firefox in progress | `picker:`, `checkmark:`, `picker-icon:` (PSEUDO_ELEMENT). `appearance-base-select` already exists | H |
| 6 | `::target-text`, `::spelling-error`, `::grammar-error`, `::highlight(name)` | `::target-text` is Baseline; the others vary | `target-text:`, `spelling-error:`, `grammar-error:`, `highlight-[name]:` | M |
| 7 | `(prefers-reduced-transparency: reduce)` | Chrome / Edge; Safari and Firefox partial | `transparency-reduce:` (MEDIA) | M |
| 8 | `(dynamic-range: high)` | Safari, Chrome | `hdr:` (MEDIA), pairs with the existing `dynamic-range-limit` | M |
| 9 | `:heading` / `:heading(1, 2)` | Experimental (Firefox preview, Safari 27 beta) | `heading:` / `heading-[1,2]:`, behind the docs' "experimental" label | L |
| 10 | `:has-slotted` | Partial | `has-slotted:` | L |

### Utilities and values (SCSS utilities / engine)

| # | Feature | Support (check first) | Proposed OmniaCSS form | Prio |
|---|---|---|---|---|
| 11 | `contrast-color()`: black or white text against a color | Baseline Newly available (web.dev, Apr 2026) | `text-contrast-<color>` → `color: contrast-color(var(--color-<color>))`, plus `text-contrast` reading `--oc-bg` / the element's own background token. Fits the RAL/Omnia palette well | H |
| 12 | `display: grid-lanes` (masonry) | Safari 26.4+; Chrome and Firefox behind a flag | `grid-lanes`, `grid-lanes-cols-*` (reuse the grid-template helpers); docs section in `flex-grid` with a `supports-[display:grid-lanes]:` fallback | M |
| 13 | `background-clip: border-area` (gradient borders without tricks) | Chrome 150+, Safari 18.2+; Firefox no | `bg-clip-border-area`; a demo in `creative` (gradient border) with an `@supports` fallback | M |
| 14 | Scroll-triggered animations: `timeline-trigger`, `animation-trigger`, `trigger-scope` | Chrome 145/146; Chromium only | `trigger-view` / `animate-trigger-*` in `scroll-animations`, marked experimental | M |
| 15 | Relative alpha `alpha(from …)` (CSS Color 5) | Chrome 152 | Mostly covered by the `/50` opacity modifier and `color-mix()`. Only a docs note under colors | L |
| 16 | `polygon(round …)` rounded polygon corners, `path-length` property | Chrome 150 | `clip-poly-round-*` presets in `shapes`; `path-length` in `svg` | L |
| 17 | `revert-rule` keyword | Safari 27 beta | Docs note in `variables` / cascade; no utility | L |
| 18 | `window-drag` (replaces `app-region`, installed web apps) | Chrome 152 | `window-drag` / `window-no-drag`, niche (PWA title bars) | L |

## Suggested first batch (one minor release)

The aim is small, safe and visible.

1. **Variants #1–#5:** media states, `state-[…]:`, `modal:` / `fullscreen:`, `style-[…]:` and the select parts. Each is a few lines in `variants.mjs`. After a change there, the IntelliSense extension picks them up automatically (`VARIANT_GROUPS`).
2. **`contrast-color()` utilities (#11):** they showcase the color system ("readable text on any RAL color").
3. **Docs:** a "media player without JavaScript" demo (`paused:`, `playing:`) in `interactivity`, and a contrast-color demo in `colors`.

Each item needs its MDN browser-support table on its docs page (see `apps/docs/scripts/check-pages.mjs`).

The second batch would bring Grid Lanes (#12), `border-area` (#13) and the scroll triggers (#14) as experimental.

## Sources

- web.dev, New to the web platform: [June](https://daily.dev/posts/new-to-the-web-platform-in-june-ego8ywxmf), [July](https://web.dev/blog/web-platform-07-2026), [September 2026](https://web.dev/blog/web-platform-09-2026), [April 2026 (contrast-color)](https://web.dev/blog/web-platform-04-2026)
- web.dev, [August 2026 Baseline digest](https://web.dev/blog/baseline-digest-aug-2026) (media pseudo-classes)
- web.dev, [Interop 2026](https://web.dev/blog/interop-2026?hl=en); Igalia, [Interop 2026 focus areas](https://igalia.com/news/interop-2026.html)
- Chrome release notes: [140](https://developer.chrome.com/release-notes/140), [145 beta](https://developer.chrome.com/blog/chrome-145-beta), [150](https://developer.chrome.com/release-notes/150), [151](https://developer.chrome.com/release-notes/151), [152](https://developer.chrome.com/release-notes/152); [scroll-triggered animations](https://developer.chrome.com/blog/scroll-triggered-animations)
- WebKit, [News from WWDC26 (Safari 27)](https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-saf); [When will CSS Grid Lanes arrive?](https://webkit.org/blog/17758/when-will-css-grid-lanes-arrive-how-long-until-we-can-use-it/)
- caniuse: [background-clip: border-area](https://caniuse.com/wf-background-clip-border-area), [CSS Grid Lanes](https://caniuse.com/css-grid-lanes)
- MDN: [:paused](https://developer.mozilla.org/en-US/docs/Web/CSS/:paused), [:heading](https://developer.mozilla.org/en-US/docs/Web/CSS/:heading), [Animation triggers](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Animation_triggers)
