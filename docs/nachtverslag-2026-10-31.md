# Nachtverslag 30–31 oktober 2026

Voor Serge. Wat er vannacht gebouwd is, wat ik onderweg ontdekte, en wat jij nog moet beslissen of doen.
Afspraak was: lokaal bouwen en testen, committen en pushen mag; niet deployen, niet releasen, geen nieuwe publieke repo's.

## 1. Klaar

| Wat | Waar | Stand |
|---|---|---|
| `llms.txt` + `llms-full.txt` | omniacss (`scripts/build-llms.mjs`, in `docs:build`) en omniaUI (`scripts/build-llms.mjs`, in `site:build`) | gecommit + gepusht; live na de volgende deploy |
| Laravel-starterkit **Livewire** | `D:\webdev\omniaui-starter-kits\livewire` | 34/34 tests, 58 kB CSS (11 kB gzip) |
| Laravel-starterkit **Blade** | `…\blade` | 35/35 tests (één nieuw), 56 kB CSS |
| Laravel-starterkit **React** (Inertia) | `…\react` | 40/40 tests, `tsc` schoon, 61 kB CSS (12,6 kB gzip) |
| Laravel-starterkit **Vue** (Inertia) | `…\vue` | 40/40 tests, `vue-tsc` schoon, 58 kB CSS (12 kB gzip) |
| **Filament zonder Tailwind** (prototype) | omniaUI `php-packages/omniaui-filament` | gecommit + gepusht; getest in Filament 5.11 |
| Bekendheidsplan + kant-en-klare posts | `docs/bekendheid-plan-2026.md` | klaar |
| Livewire 4-ondersteuning in `omniaui-livewire` | omniaUI | gecommit + gepusht, 21 tests groen op Livewire 4.4 |
| Build werkt met jouw geüpgradede PostCSS-stack | omniacss `config/postcss.config.mjs` | gecommit + gepusht |

Alle schermen van de vier kits en van Filament zijn bekeken in een zichtbare Chrome, licht en donker, telefoon en desktop,
zonder consolefouten. Elke kit is gemaakt van Laravels officiële kit (MIT): Fortify-backend, routes en tests ongewijzigd,
de frontend vervangen door OmniaCSS + OmniaUI. De kits staan in een **lokale** git-repo (4 commits, geen remote).

### Filament: wat het prototype wel en niet doet

- Wel: het panel krijgt de OmniaUI-kleuren, je eigen pagina's en widgets gebruiken OmniaCSS + OmniaUI (free én Pro),
  en de app heeft **geen Tailwind-build** meer nodig (`tailwindcss` en `@tailwindcss/vite` eruit). Licht/donker volgt
  Filaments schakelaar.
- Twee demopagina's: **Operations** (KPI's, CSS-only tabs, grafiek met 3 reeksen, capaciteit met drempels, release-
  pipeline, live terminal-log, incidentfilters met uitklapbare kaarten, servicetree, tijdlijn) en **Pro showcase**
  (chartsgalerij, kalender, onboarding, chat-inbox).
- Niet: Filaments eigen schermen draaien nog op Filaments meegeleverde CSS (door het Filament-team met Tailwind
  gebouwd, 906 `fi-*`-klassen). Die volledig herschrijven is een apart, groot project; mijn inschatting: enkele weken.

## 2. Gevonden en opgelost (raakt ook bestaande klanten)

1. **De build gooide component-modifiers weg** die in code worden opgebouwd (`'oc-btn--'.$variant` in Blade,
   `` `oc-btn--${variant}` `` in React/Vue). Wie de Blade/React/Vue-wrappers met de gesnoeide `@omniaui;`-build gebruikte,
   kreeg bv. een blauwe in plaats van rode "Delete"-knop. Opgelost in de engine (BEM-modifiers worden als familie
   bewaard) + test.
2. **React/Vue-wrappers werden nooit gescand** (alles onder `node_modules` werd overgeslagen). Nu worden expliciete
   `node_modules`-patronen wel gescand + test; de kits scannen alleen de wrappers die ze echt importeren.
3. **`postcss-custom-properties` 15.0.4** (uit jouw upgrade) brak de build. De fallbacks die het schreef waren
   nutteloze placeholders; uitgezet. De volledige build is nu zelfs 80 kB kleiner.
4. **Valkuil Filament**: Tailwind-klassen in gescande views (zoals Laravels standaard-welkomstpagina) krijgen in
   OmniaCSS een andere betekenis (`w-5` = 5rem) en maakten Filaments iconen reusachtig. Gedocumenteerd in de README.

## 3. Gevonden, nog niet opgelost → roadmap

Deze kwamen boven bij het omzetten van de officiële kits. Ik heb ze bewust niet in de core gebouwd zonder jouw blik.

| # | Lacune | Waarom belangrijk |
|---|---|---|
| 1 | **Geen utilities voor de OmniaUI-thematokens** (`text-muted-foreground`, `bg-background`, `border-input` …) | shadcn-projecten gebruiken die overal; de codemod kan ze nu niet omzetten (de grootste groep "unsupported") |
| 2 | **Lettergroottes**: `font-0.8` is 0,875rem, `font-0.7` is 0,75rem; geen tussenstappen als 0,8125 | naam ≠ waarde verwart mensen én AI |
| 3 | **`size-1` = 0,25rem** terwijl `w-1` = 1rem | inconsistente schaal |
| 4 | Ontbrekend: `font-mono`, `ms-*`/`me-*` (logische marges), `border-b-0`, `space-y-0.5`, negatieve marges, `shrink-0` | veelgebruikte namen; codemod laat ze staan |
| 5 | **Codemod is niet veilig op gemengde code**: draait hij over al-omgezette OmniaCSS, dan wordt `gap-1` → `gap-0.2` | waarschuwing of detectie nodig |
| 6 | Codemod zet `dark:` met kleuren niet om (`dark:bg-gray-800`) hoewel OmniaCSS het kan | strenger dan nodig |

## 4. Wat jij moet doen (in deze volgorde)

1. **Release 0.12.5** (`/npm-upgrade patch`): de kits hebben de engine-fix en `omniaui-livewire` met Livewire 4 nodig.
2. **Sites deployen** (komt mee met de release): dan staan `llms.txt` en de nieuwe Livewire-vermelding live.
3. **Vier publieke repo's** aanmaken (bv. `Birdycom/omniaui-livewire-starter-kit`, `-blade-`, `-react-`, `-vue-`), elke map
   uit `omniaui-starter-kits` erin, en op Packagist registreren. Daarna werkt `laravel new app --using=birdycom/…`.
   Haal vóór publicatie het `repositories`-blok (lokale paden) uit de `composer.json` van livewire en blade.
4. **`omniaui-filament`**: beslissen of het als prototype mag uitkomen; zo ja toevoegen aan `split-php.yml` + Packagist.
5. **Posts** uit `docs/bekendheid-plan-2026.md` plaatsen, pas ná stap 1–3.

## 5. Niet gedaan

- **Benchmark** OmniaCSS vs Tailwind: auto mode weigerde de officiële Tailwind-kits te installeren (externe code), dus
  ik heb hun CSS-grootte niet kunnen meten. Voorstel: jij draait `npm install && npm run build` in
  `D:\webdev\omniaui-starter-kits\_upstream\{livewire,react,vue}`; dan hebben we de cijfers naast 58/61/58 kB.
- **Handleidingen als pagina's** (Laravel in 5 minuten, Tailwind-migratie, AI): opgesomd in het bekendheidsplan §4, nog niet geschreven.
- **Pagina "OmniaCSS vs Tailwind"**: wacht op de benchmark.
- Kleine cosmetica in de React/Vue-kits: de stat-card met `tone="accent"` toont een rode in plaats van blauwe streep.
