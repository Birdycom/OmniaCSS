# Plan: QuestPost-wensen in OmniaCSS / OmniaUI

Bron: `D:\webdev\questpost\docs\omnia-wensen.md` (81 wensen, commit f8311f2 op develop van Birdycom/QuestPost).
QuestPost-bestanden zijn alleen referentie: daar wijzigen we niets. Gevraagd door Serge via questpost-0a (10 nov 2026).

## Werkwijze

- Releaseproces volgens `/commit`: bugfixes naar `main` (patch, deploy met `/commit deploy`), nieuwe items naar
  `develop`, release op zondag (`/commit release`, minor). OmniaCSS, OmniaUI en Pro in lockstep.
- Elk nieuw onderdeel: CSS + snippet + docs-pagina (demo met versiebadge) + React/Vue/Blade-wrapper + tests,
  en mee in MCP, extensie-index, llms.txt, README/CHANGELOG (zie memory "alles mee bijwerken").
- Demo's alleen met neutrale data (Team 1, Company 1 …), nooit "QuestPost" of andere bronapps in publieke docs.
- Iconen: **Omnia-webicons** (de 6 Iconify-sets, lokaal gebundeld), nooit Lucide. #46 wordt dus een `name`-prop
  op webicons (`mdi:map-marker` …), geen lucide-subset.

## Versies

### 0.14.5: bugfixes (main, zo snel mogelijk)

| Wens | Wat |
|---|---|
| #17, #32, #33 | PostCSS-plugin leest per build welke componenten uit `@birdycom/omniaui-react` / `-vue` geïmporteerd worden en scant die bronnen (ook componenten die ze intern gebruiken). Geen herstart, geen eigen omweg, samengestelde namen (`oc-price-card__price--${kind}`) en `oc-otp` blijven. |
| #37 | `DropdownItem` sluit het omringende popover-menu na een klik (opt-out `keepOpen`). |
| #28 | Tooltip in een glaspaneel: niet langer gevangen door `backdrop-filter` (glas in `::before`, of de tooltip in de top layer). |
| #40 | `User`: initialen ook uit een ReactNode-naam (`textContent`) of prop `initials`. |

### 0.15.0: zondag 15 nov (develop)

Al op develop: thema-schakelaar met iconen (#1, deels) en de juridische verwijspagina's.

| Wens | Wat |
|---|---|
| #1 | ThemeSwitch: vertaalbare `labels` (React/Vue/Blade). |
| #82 | LanguageSelect (bestaat al: opties als prop, value/onChange, ghost, code) uitbreiden: vlag per optie, maat `sm` gelijk aan ghost-knoppen sm, vertaalbare tooltip/aria-label, dynamisch geladen talen. |
| #83 | Block "taal + thema" (`BlockHeaderPrefs` / `x-oc::block.header-prefs`): LanguageSelect + ThemeSwitch met iconen als één groep voor elke kop, maat ghost sm, tooltips onder (`side="bottom"`), `labels` per taal, werkt in glaskoppen. |
| #46 | Icoon op naam: `<Webicon name="mdi:…" size>` (React/Vue/Blade), `oc-icon` maten xs–xl. |
| #5, #6 | Semantische kleur-utilities (`text-muted`, `bg-card`, `border-default`, `text-success` …) en typografie (`text-xs…3xl`, `leading-*`, `tracking-*`, `tabular-nums`, `oc-overline`). |
| #49 | Glastokens `--oc-glass-bg(-strong)`, `--oc-glass-line`, `--oc-glass-blur`; `Glass density="dense"`. |
| #3 | Touch-dichtheid `data-density="touch"`. |
| #50, #63 | Display-cijfers (`StatCard variant="display"`, `oc-num-display`) en display-kop/kicker. |
| #56, #57, #77 | Pulserende stip, status-pil (glas, stip, toon), teller-badge op een knop. |
| #78, #79 | Scroll-fade/scrollbar-none en safe-area-utilities. |

### 0.16.0: zondag 22 nov

#7 + #74 kaartpin en positiemarker · #73 + #18 Leaflet-thema en donkere tegels · #10 + #51 klassement en podium ·
#11 countdown · #20 kleurchip · #25 glasknop, actierail, pilnavigatie · #22 schermvullende app-indeling.

### 0.17.0: zondag 29 nov

#47 QR-code · #55 voortgangsbalken · #53 meldingenlijst · #42 sorteerbare lijst (touch) · #2 sheet · #14/#26/#36 OtpInput
· #9 stat-lijst · #12 sync-indicator · #13 omgevingsbalk · #31 toast met actie · #39 CopyField-labels.

### Daarna (volgorde in overleg)

De overige wensen (#4, #8, #15, #16 docs, #19, #21, #23, #24, #27, #29, #30, #34, #35, #38, #41, #43–45, #48,
#52, #54, #58–62, #64–72, #75, #76, #80, #81). Een paar bestaan deels al (Spotlight-kaarten is Pro, Gallery,
Timeline, Marquee): die worden een variant op het bestaande component.

## Al in 0.14.3 (QuestPost stapt zelf over)

ChipFilter, InputGroup/AffixInput, Dropzone, BlockAuth, `line-clamp-*`, Glass/GlassPanel (na #28).
