# Plan: birdycom.be zonder eigen CSS (OmniaCSS / OmniaUI 0.13.0)

Vraag van Serge via `birdycom-f3` (2 november 2026). Bron: `D:\webdev\birdycom\public\assets\css\` (1.167 regels).
Doel: elk patroon wordt een token, klasse, component of block in OmniaCSS/OmniaUI (Pro), zodat de site alleen nog
tokens zet (base.css als thema).

Regels voor alles hieronder:
- Alleen `--oc-*`-tokens en het OmniaCSS-palet, geen vaste kleuren; licht en donker via `light-dark()`.
- Elke block: HTML-snippet, Blade (`<x-oc::block.…>`), React en Vue, demo met neutrale data, MCP en extensie-index bijgewerkt.
- Wat al bestaat wordt uitgebreid, geen tweede variant ernaast.
- Versie **0.13.0** (minor: nieuwe componenten en blocks). De event-scene komt mee als Pro-block, als laatste fase.

Legende: **T** = token, **K** = klasse in OmniaUI-componenten (`@birdycom/omniaui`), **C** = OmniaCSS-utility/basis,
**B** = block (gratis), **P** = Pro-block, **F** = fix in een bestaand OmniaUI-component.

## Fase 1: contactformulier (voorrang)

| Patroon (birdycom) | Wordt | Soort |
|---|---|---|
| Velden op een donkere kaart (`.contact-form .oc-input`) | Veldtokens op `.oc-input`: `--oc-input-bg`, `--oc-input-border`, `--oc-input-padding`, `--oc-input-radius`, `--oc-ring-width`/`--oc-ring-alpha` (focusring `--oc-ring` op 25 %). Modifier op de vorm: `.oc-form--filled` (donkere vulling `oklch(0 0 0 / .25)`, `--oc-border-strong`, padding .75/.9rem). | T + K |
| `aria-invalid="true"` + foutmelding | Bestaat (`.oc-input[aria-invalid]`, `.oc-field-error`); kleur van de foutmelding wordt `--oc-destructive-text` (lichter in donker via `light-dark`). | F |
| `<select>` met eigen pijltje | `.oc-select` bestaat (pijl als achtergrond); nakijken op donkere vulling + `option`-achtergrond. `.oc-select--custom` blijft voor `appearance: base-select`. | F |
| textarea | `.oc-textarea` (resize vertical, `min-block-size: var(--oc-textarea-min, 9rem)`) | K |
| "(optioneel)" in het label | `.oc-field-label__hint` (gedempt, normaal gewicht) | K |
| Kaart rond het formulier met gloed | `.oc-panel` + `.oc-panel--glow` (radial-gradient linksboven in `--oc-glow-1`, `--oc-border-strong`, radius `--oc-radius-lg` × 1.2, `scroll-margin-top: var(--oc-scroll-offset, 6rem)`) | K |
| Verzendknop + notitie | `.oc-form-actions` + `.oc-form-note` (links in `--oc-primary`, onderlijnd) | K |
| Busy | `form[aria-busy="true"] [type=submit]`: gedimd, `cursor: progress` (in de basis van OmniaUI-formulieren) | F |
| Honeypot | `.oc-honeypot` (buiten beeld, niet `display: none`) | C |
| `[hidden]` wint | `[hidden]:not([hidden="until-found"]) { display: none !important }` in de OmniaCSS-reset | C |
| Succesblok | `.oc-result` (icon-tile + titel + tekst + knoppen; `--success`/`--danger`) | K |
| Foutbalk boven het formulier | `.oc-alert--danger`: nagekeken op donkere achtergrond, kleuren via tokens | F |
| Formulier + kolom contactkaarten | **Block `contact-form`**: `.oc-block-contact-form` (1.6fr / 1fr, onder 960px kaarten in auto-fill), kaarten = bestaande `.oc-block-contact-card` + `-line` uit `contact-grid` (link wordt foreground bij hover). Met een optionele `contact-form.js`: fetch met `Accept: application/json`, antwoord `{sent, errors: {veld: tekst}}` (200 of 422), per veld `aria-invalid` + `.oc-field-error#err-<veld>`, busy, succesblok en `[data-contact-again]`. | B |

## Fase 2: header, layout, footer

| Patroon | Wordt | Soort |
|---|---|---|
| Logo: icoon + woordmerk + baseline | `.oc-brand-mark` met `__icon`, `__word`, `__accent` (gradient `--oc-brand-1` → `--oc-brand-2`), `__tagline`; maten `--sm`, standaard, `--lg` (ook voor de ecosystem-map) | K |
| Menuknop-icoon even hoog als tekst | `.oc-site-header__toggle` svg/iconify `display: block` | F |
| CTA in het mobiele menu | `.oc-site-header__cta` (margin-top .75rem in het popover-menu) | F |
| Achtergrondvlekken in eigen tinten | `.oc-backdrop`: `--oc-backdrop-1/2/3` en `--oc-backdrop-grid` (standaard = huidige kleuren) | T |
| Paginakop | `.oc-section-pad--page` (padding clamp 4–7rem / 2–3rem) + `.oc-display--page` (clamp 2.5–4.75rem) | K |
| Sectiekop / "meer"-link | `.oc-section-head` (max 46rem, mb 3rem), `.oc-section-more` (mt 2.5rem) | K |
| Knoppenrij | `.oc-actions` (+ `--center`, `--end`) | K |
| Groepstitel met teller | `.oc-group-title` + `.oc-group-title__count` (pill) | K |
| Kerncijferstrook full-bleed | `.oc-stat-strip--bleed` (border-block, achtergrond `--oc-surface`, cijfers in de container) en standaard 2 kolommen onder 960px; cijfer in `--oc-font-display` | K + F |
| Footer | `.oc-site-footer`: `--oc-footer-cols` (standaard `1.6fr repeat(3,1fr)`), responsieve stappen 4 → 2 kolommen, `--gradient`, `__subtitle`, `__social`, `__legal` (linkrij), `__build` (tabular-nums); de responsieve stappen werken ook met 5 kolommen (about over de volle breedte bij 4); onderbalk in `--oc-subtle-foreground` | K |

## Fase 3: juridisch, motion, pagina's, brand

| Patroon | Wordt | Soort |
|---|---|---|
| Juridische tekst | `.oc-prose--legal` (max 46rem, gedempt, 1.0625rem, h2/h3 in foreground, disc-lijsten met gap, links in `--oc-brand-1`) | K |
| Metaregel (versie · datum) onder de h1, buiten de prose | `.oc-meta` | K |
| Tabel + scrollen | Bestaat: `.oc-table` in `.oc-table-wrap` (scrollt horizontaal); voorbeeld op de prose-pagina | — |
| Nav naar andere juridische pagina's | `.oc-actions` + outline-knoppen; plus **block `legal-page`** (prose + tabel + nav) | B |
| Kaarten binnenvliegen | `.oc-reveal--fly` + `fly.js` (zet `--oc-fly-x` en `.is-visible`, IntersectionObserver), reduced motion uit; zonder JS staat alles op zijn plaats | K + JS |
| Hover-lift productkaart | `.oc-product-card:hover` via `translate` (niet `transform`), dus geen botsing met de reveal | F |
| "Nieuw" in de kaartnaam | `.oc-product-card__badge` | K |
| Home-hero met zwevende merken | Block `hero-orbit` krijgt variant `--float` (8 vaste plekken, float-animatie, weg onder 560px); syntaxkleuren als tokens `--oc-code-keyword/string/comment/function/muted` met klassen `.oc-tok-k/s/c/f/m` (alleen in `.oc-code-window`); in `--float` krijgt het venster een halfdoorzichtige card-achtergrond (85 %) boven de merken | B + T |
| Dienst- en featurekaarten | `.oc-feature-card` (icon-tile + h3 + tekst, surface, hover border-strong) in `.oc-card-grid` met `--oc-card-min` (15.5rem; diensten 19rem) | K |
| Projectraster | `.oc-card-grid--wide` (min 32rem, 3 kolommen vanaf 1280px) | K |
| "Meer werk dan getoond" | `.oc-panel--glow` + `.oc-icon-list` (icoonregels in kaders) | K |
| 2-koloms-splits met verhoudingen | `.oc-split` krijgt `--oc-split-cols` (vrije verhouding) en 2 presets: `--lead` (tekst breder, 1.25/1) en `--media` (beeld breder, 1/1.15); 1 kolom onder 960px | K |
| Productmerk in de product-hero | `.oc-split__media`: gecentreerd; onder 960px komt het eerst (links uitgelijnd) en wordt een `.oc-icon-tile--xl` 7rem | K |
| "Meer werk dan getoond" | `.oc-panel--glow` met `.oc-split` erin (align-items center); getest als combinatie | K |
| Losse marges (marquee mt 4rem, timeline mt 2rem, max 60rem) | Bestaande OmniaCSS-utilities (`mt-*`, `max-w-*`); ontbrekende waarden aanvullen | C |
| Productpagina | `.oc-badge-row`, `.oc-tagline--accent` (accent gemengd met wit), `.oc-browser-frame--glow` + `__mark` (merk rechtsonder) | K |
| Screenshotgalerij | `.oc-shot-grid` + `.oc-shot` (figure, img contain 16/10, figcaption, zoom-in); `<picture>` in `.oc-lightbox__media` | K + F |
| Levende demo-tekst | `.oc-list--accent` (markers in de accentkleur) + `.oc-note` | K |
| Call to action | Block `cta` krijgt `--glow` (2 radial-gloeden, titel clamp 1.8–2.75rem, smalle tekst) | B |
| 404 | utility `min-h-55vh` → bestaande min-height-utility nakijken | C |
| Kleine overrides | Spotlight-kolommen `--oc-spotlight-cols`; `__modules li`-achtergrond token; breadcrumb krijgt `--oc-breadcrumb-gap`; lightbox-sluitknop-icoon 1.1rem; stat-strip-cijfer `--oc-font-display` | F |
| Merkenstrook | `.oc-tag-list--lg` (display-font, 700) + `.oc-note` | K |
| AI-paneel | `.oc-panel--glow` (variant `--glow-end`), `.oc-icon-list--points` (icon-tile + titel + tekst), `.oc-link-card` (hover in `--oc-accent`) met `.oc-accent--violet` | K |

## Fase 4: basis (OmniaCSS) en Pro

| Patroon | Wordt | Soort |
|---|---|---|
| Skip-link | `.oc-skip-link` | C |
| Basis-icoon | `.oc-icon` (1.25em, flex-shrink 0) | C |
| Display-font, derde tekstkleur | `--oc-font-display` (standaard = `--oc-font-sans`) en `--oc-subtle-foreground` | T |
| Knoppen | `--oc-btn-weight`, `--oc-btn-lg-padding`, `--oc-btn-gradient-ink` | T |
| Elementbasis | Opt-in `@birdycom/omniacss/base.css` (laag `omnia`: body met `--oc-body-size` (1rem) en `--oc-body-leading` (1.6), koppen in `--oc-font-display`, lijsten, focus-visible, selection, smooth scroll met `--oc-scroll-offset`) | C |
| 3D-zaal | **Pro-block `event-scene`** (truss, spots, haze, podium met LED-wall via device-mockup, publiek, FOH met mengtafel en laptop), met `.oc-live-frame` en `.oc-watermark`; neutrale demo-inhoud, geen productnamen | P |

## Volgorde en oplevering

1. Fase 1 → per fase lokaal alle CI-stappen groen, dan "klaar met taak" aan BirdyOps (geen release per fase).
2. Fase 2, 3, 4 in dezelfde werkboom; daarna release **0.13.0** via BirdyOps na Serges ja (npm, Packagist, Pro, sites, Polar-telling).
3. Na de release: per onderdeel de klassen en snippets naar `birdycom-f3` (tabel: oud birdycom-selector → nieuwe klasse/markup).

## Stand na het bouwen (2 november 2026, alle vier de fases klaar)

Afwijkingen tegenover de tabellen hierboven (de rest is gebouwd zoals gepland):

- Kerncijferstrook: `.oc-band` (volle breedte) + `.oc-stat-strip--plain`, in plaats van `.oc-stat-strip--bleed`.
- Footer: tokens (`--oc-footer-bg`, `--oc-footer-cols`, `--oc-footer-cols-md`, `--oc-footer-bottom-color`) in plaats van
  een `--gradient`-modifier; container queries op de footer (66rem / 54rem). Sociale link: bestaande `__social`.
- Blocks volgen `--oc-container`: `--oc-block-max-width` = `calc(var(--oc-container, 1152px) + 2 × --oc-block-gap)`.
- `omniacss build` meldt `oc-block-*`-klassen als `"blocks"` uit staat.
- Juridisch: geen apart block `legal-page`; demo "Legal page" op de prose-pagina (`.oc-prose--legal`, `.oc-meta`,
  `.oc-table-wrap`, `.oc-actions`).
- `.oc-skip-link` en `.oc-icon` zitten in OmniaUI (`parts/site-base.css`); de elementbasis is
  `@birdycom/omniacss/base.css` (opt-in). Nieuwe themetokens: `--oc-subtle-foreground`, `--oc-font-display`.
- Pro-block `event-scene` (52 Pro-blocks); fix in de device-mockups: een `.oc-live-frame` in `.oc-device__display`
  behoudt zijn virtuele grootte voor een `<img>`.
- Nieuwe componentpagina's: panel, result, brand-mark, page-sections, feature-card, icon-list, shot-grid, fly-in
  (167 componenten, 47 gratis + 52 Pro = 99 blocks).
