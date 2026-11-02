# OmniaUI Pro — roadmap na 0.12.6 (beter dan Tailwind Plus)

Opgesteld 2026-11-02. Intern document. Vergelijking met Tailwind Plus: hun publieke pagina's
(tailwindcss.com/plus/ui-blocks, /ui-kit, /templates/catalyst) en hun bekende catalogusindeling; de catalogus zelf
zit achter een login.

## 1. Waar we staan

| | Tailwind Plus | OmniaUI (0.12.6) |
|---|---|---|
| Blocks | 500+ voorbeelden: Marketing, Application UI, Ecommerce | 46 gratis + 41 Pro blocks, 151 componenten |
| Templates | ~12 marketing- en docs-sites (React/Next) | 4 starterkits (apps, geen marketingsites) |
| App-kit | Catalyst (alleen React + Headless UI) | componenten in HTML, React, Vue, Blade, Livewire |
| Gedrag | voorbeelden zijn vooral statisch; JS via Headless UI / Elements | native platform (dialog, popover, details, :has, anchor positioning), kleine optionele scripts |
| Demo's | screenshots + code | werkende demo's in licht en donker |
| Tooling | — | MCP-server voor AI-assistenten, VS Code/Cursor-IntelliSense |
| Licentie | eenmalig | maand, jaar, lifetime (tot 31/12/2027) |

## 2. Hoe we beter worden zonder de kern te verliezen

De kern blijft: **snel, CSS eerst, goed.** Elk nieuw block moet langs dezelfde poort:

1. **CSS eerst.** Werkt zonder JavaScript; een script is alleen een verbetering en blijft onder 2 kB (gzip).
   Native elementen vóór eigen code (dialog, popover, details, `:has()`, container queries, anchor positioning).
2. **Budget.** Elk CSS-deel < 200 regels; een block voegt hoogstens ~3 kB (gzip) CSS toe en hergebruikt componenten.
   Geen nieuwe afhankelijkheden.
3. **Overal hetzelfde.** HTML-snippet, React, Vue, Blade (en Livewire waar het server-side zinvol is), met tests.
4. **Kwaliteit.** Licht en donker, 360 px breed tot breedbeeld (container queries), toetsenbord en screenreader
   (axe: 0 fouten), print-stijl waar het om documenten gaat (offerte, factuur, bestelling), afknip-scan zonder meldingen.
5. **Demo's die werken** met neutrale data (Company 1, Customer 1, Product 1), zonder bronapps te noemen.
6. **Meetbaar.** Per block op de site: CSS-grootte, JS-grootte (meestal 0), "werkt zonder JS". Dat is ons verschil
   met Tailwind en dat tonen we.

Waar we Tailwind voorbijsteken:
- **Volledige bedrijfspagina's** (offerte, factuur, producten, planning, werkbonnen) — een domein dat Tailwind niet heeft.
- **Werkende demo's** in plaats van stille voorbeelden.
- **Vijf stacks met één markup** (HTML, React, Vue, Blade, Livewire) in plaats van alleen React.
- **AI-klaar**: elk block komt in de MCP-server met beschrijving en markup.

## 3. Batches

### Batch A — Producten en winkel (Pro), voorbeeld: OmniaDesk-producten

Beheerkant (geïnspireerd op OmniaDesk Producten, niet gekopieerd):
| Block | Inhoud |
|---|---|
| product-list | data table met foto, artikelnummer, categorie, voorraadbadge (onder minimum = waarschuwing), prijs excl/incl btw, gepubliceerd/zichtbaarheid |
| product-detail | foto's, identificatie (artikelnr, merk, model, barcode), commercieel (verkoop/aankoop, btw, marge), voorraad en minimum, technische specificaties per sectie, documenten, serienummers, voorraadbewegingen, zijbalk met verkoop- en aankoopfacturen, activiteit |
| product-editor | inklapbare secties (identificatie, commercieel, media, omschrijvingen, specificaties, diensten/kosten, serienummers), opslaan-balk |
| product-picker | combobox met foto, artikelnr, prijs en voorraad (voor offertes en facturen) |
| stock-movements | tijdlijn/tabel van in- en uitgaande voorraad |

Winkelkant:
| Block | Inhoud |
|---|---|
| shop-catalog | productgrid met filters (categorie, prijs, op voorraad), sortering, paginering — filters werken met `:has()` |
| shop-product | galerij met thumbnails, varianten (kleur/maat), aantal, in winkelmand, tabs specificaties/reviews |
| shop-quick-view | dialog met de kern van shop-product |
| shop-cart | winkelmand als lade (drawer) en als pagina, aantallen, kortingscode, totalen |
| shop-checkout | adres, levering, betaling, besteloverzicht, één pagina met stappen |
| shop-order | bevestiging, besteldetail en bestelgeschiedenis |

Nieuwe gratis componenten die hierbij horen: rating (sterren, ook invoer), price (excl/incl btw, korting),
quantity (stepper), gallery (thumbnails + hoofdbeeld), stock-indicator, description-list.

### Batch B — Marketing (gratis + Pro)
testimonials (rij, raster, uitgelicht), logo-cloud, newsletter, blog-list en blog-post, bento-grid,
announcement-bar, flyout- en megamenu, content-section, contact-varianten.

### Batch C — App UI
description-list-pagina's, activity-feed, gestapelde en raster-lijsten, notificatiecentrum, kanban-bord,
detailpagina, set lege toestanden, command-palette-pagina.

### Batch D — Volledige templates (Pro), geïnspireerd, niet gekopieerd
| Template | Inspiratie | Pagina's |
|---|---|---|
| Desk (bedrijfssuite) | OmniaDesk | dashboard, relaties, producten, offerte-editor, factuur (met print), planning, instellingen |
| Projects (werkbonnen) | Korrekt Interieur | projecten, project-detail, werkbonnen, planning en resources, medewerkers, voorraad, bestellingen, meldingen |
| Shop | batch A | catalogus, product, winkelmand, checkout, account en bestellingen |
| SaaS-site | eigen | home, features, prijzen, blog, docs, contact |

Templates leveren we als HTML én als Laravel-kit (Blade/Livewire) en Inertia (React/Vue), gebouwd op de
starterkits, zodat een klant ze met `laravel new --using=…` kan starten.

## 4. Volgorde en werkwijze

1. Batch A in twee delen: eerst beheerkant + de zes gratis componenten, daarna de winkelkant.
2. Batch B en C afwisselend, telkens 6–8 blocks per release.
3. Batch D na A–C, omdat de templates uit die blocks bestaan.

Per release: alles mee bijwerken (MCP, extensie-index, docs, README/CHANGELOG, thumbnails), tests groen,
GitHub Actions groen, commit en push via BirdyOps.
