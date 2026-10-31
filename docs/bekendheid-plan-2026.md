# OmniaCSS en OmniaUI bekend maken — plan en concepten

Stand: 31 oktober 2026. Geschreven voor Serge: wat we posten, waar, in welke volgorde, met kant-en-klare teksten.
De teksten zijn in het Engels, omdat de doelgroep internationaal is. Jij post ze zelf; pas aan wat niet klinkt als jij.

## 1. Waarom nu, en wat we eerst nodig hebben

Een AI-vergelijking (ChatGPT/Perplexity) noemde OmniaCSS "technisch interessant, maar het ecosysteem is klein, er is geen
benchmark en AI-tools schrijven Tailwind". Dat beeld komt uit wat er online te vinden is. Bekendheid bouw je dus met
**bewijs dat iemand kan nalezen**, niet met claims.

Klaar of bijna klaar (31/10):

| Bewijs | Stand |
|---|---|
| `llms.txt` + `llms-full.txt` op omniacss.eu en omniaui.eu | gebouwd en gecommit, live na de volgende deploy |
| MCP-server voor Claude/Cursor/Copilot | live (0.12.4) |
| VS Code / Cursor-extensie | live (0.12.4) |
| Laravel-starterkit Livewire | lokaal klaar, 34/34 tests groen, 52 kB CSS (10 kB gzip); publiceren na release 0.12.5 |
| Laravel-starterkits Blade, Vue, React | in aanmaak |
| Filament zonder Tailwind | onderzoek/prototype |
| Benchmark OmniaCSS vs Tailwind | nog te doen: zelfde app in beide, ruw/min/gzip/brotli + buildtijd, open repo |
| Pagina "OmniaCSS vs Tailwind" | nog te doen, pas na de benchmark |

**Volgorde:** eerst de starterkits + benchmark live, dan pas de grote kanalen (Hacker News, Product Hunt). Je hebt maar
één kans op een eerste indruk; een "Show HN" zonder benchmark lokt precies de vragen uit waarop we nog geen link hebben.

## 2. Kanalen, prioriteit en timing

| # | Kanaal | Waarom | Wanneer | Inspanning |
|---|---|---|---|---|
| 1 | **Laravel News** (tip indienen, laravel-news.com/links) | grootste Laravel-publiek, ze plaatsen community-pakketten | zodra de starterkits op Packagist staan | 15 min |
| 2 | **r/laravel** | starterkit zonder Tailwind is daar nieuws; Laravel-mensen kennen Flux/Tailwind-moeheid | dag na Laravel News | 15 min + reacties |
| 3 | **dev.to / Hashnode** artikel | blijft vindbaar (ook voor AI-zoekers), linkt naar docs | week 1 | 2 u |
| 4 | **r/css, r/webdev** | modern-CSS-invalshoek (anchor positioning, container queries, light-dark) | week 1–2 | 15 min |
| 5 | **Awesome-lijsten** (PR's) | permanente backlinks, AI-trainingsdata | week 1 | 1 u |
| 6 | **Product Hunt** | eenmalige piek, badge voor de site | week 3, dinsdag–donderdag | 3 u voorbereiding |
| 7 | **Show HN** | technisch publiek, grootste piek als het aanslaat | na benchmark, dinsdag 15:00 CET | 1 u + de hele dag reageren |
| 8 | **Laracasts-forum, Laravel Discord (#showcase)** | directe Laravel-gebruikers | doorlopend | — |
| 9 | **X / Bluesky / Mastodon** korte clips | GIF's van CSS-only componenten (modal, tabs zonder JS) | 2× per week | 20 min per post |
| 10 | **YouTube** "Laravel app zonder Tailwind in 10 min" | handleiding + vindbaarheid | maand 2 | 1 dag |
| 11 | **Podcasts/nieuwsbrieven** (CSS Weekly, Frontend Focus, Laravel News podcast) | tip sturen met de benchmark | na benchmark | 30 min |

Awesome-lijsten om een PR te doen: `awesome-css-frameworks` (troxler), `awesome-laravel` (chiraggude), `awesome-tall-stack`,
`awesome-mcp-servers` (punkpeye) voor de MCP-server, `awesome-vscode` voor de extensie.

**Meten:** npm-downloads per week (npm-stat), Packagist-installs, bezoekers per bron (serverlogs, zonder cookies),
GitHub-sterren. Elke maand één regel in dit bestand.

## 3. Concepten (klaar om te posten)

### 3.1 Laravel News — tip

> **OmniaUI starter kits: Laravel's starter kits without Tailwind**
>
> OmniaUI now has starter kits for Blade, Livewire, Vue and React: `laravel new app --using=birdycom/omniaui-livewire-starter-kit`.
> They have the same features and tests as the official kits (Fortify, two-factor, passkeys, settings) but use OmniaCSS and
> OmniaUI instead of Tailwind, Flux and shadcn. The CSS is built from what your views use: the complete Livewire kit ships
> 52 kB of CSS (10 kB gzip). Components rely on native HTML (dialog, popover, details, anchor positioning), so most need
> no JavaScript. MIT licensed. https://omniaui.eu

### 3.2 r/laravel

**Titel:** I rebuilt the Livewire starter kit without Tailwind or Flux — same tests, 10 kB of CSS

> I maintain OmniaCSS (utility CSS built on modern CSS) and OmniaUI (components for Blade, Livewire, Vue, React).
> To see whether it holds up in a real app, I took Laravel's official Livewire starter kit and replaced Flux and Tailwind:
>
> - all 34 upstream tests still pass (Fortify, 2FA, passkeys, settings)
> - modals are `<dialog>`, menus are `popover`, the sidebar collapses with a checkbox and `:has()`: no JS for those
> - light/dark via `light-dark()` tokens, one setting in `theme.css`
> - CSS: 52 kB raw, 10 kB gzip for the whole app
>
> `laravel new app --using=birdycom/omniaui-livewire-starter-kit`
>
> Honest limits: Filament still runs on Tailwind (I'm working on it), and the ecosystem is far smaller than Tailwind's.
> I'd love feedback on what's missing for you to try it in a project.

### 3.3 dev.to-artikel — opzet

**Titel:** What a Laravel app looks like when the CSS framework uses 2026 CSS
1. Het probleem: utility-CSS van 2019 schrijft workarounds voor dingen die browsers nu zelf doen.
2. Vijf voorbeelden met code naast elkaar (Tailwind vs OmniaCSS): container queries, anchor-positioned dropdown,
   `<dialog>`-modal, dark mode met `light-dark()`, scroll-driven progress bar.
3. De starterkit: wat zat er in, wat ging eruit (Flux, Radix), hoeveel CSS bleef over.
4. AI-assistenten: waarom ze Tailwind schrijven en hoe MCP + `llms.txt` dat oplossen.
5. Eerlijke grenzen: ecosysteem, Filament, browsers ouder dan 2023.
6. Links: docs, starterkits, benchmark-repo.

### 3.4 Show HN

**Titel:** Show HN: OmniaCSS – utility CSS built on anchor positioning, container queries and light-dark()

> Hi HN. OmniaCSS is a utility-first CSS framework that targets the CSS browsers ship today instead of polyfilling it.
> Its sister project OmniaUI has 145 components built on native HTML (dialog, popover, details), mostly without JS.
>
> Things that might be interesting: a build that keeps only the classes you use (PostCSS/Vite/CLI), an MCP server
> so AI assistants stop writing Tailwind classes into OmniaCSS projects, a codemod from Tailwind, and Laravel starter kits.
>
> Benchmark (same app in Tailwind v4 and OmniaCSS, reproducible): <link>
>
> It's a small project from a Belgian company; I'm here to answer questions.

### 3.5 Product Hunt

- **Naam:** OmniaUI · **Tagline:** Components for modern CSS — no Tailwind, mostly no JavaScript
- **Eerste reactie (maker):** waarom we het bouwden, wat gratis is (alles behalve 39 Pro-blocks), wat Pro kost.
- **Media:** 5 beelden (dashboard licht/donker, starterkit-login, componentengalerij, MCP in Claude Code), 1 GIF van
  de CSS-only modal/tabs, 1 video van 60 s.
- Lanceren op een dinsdag; de avond ervoor de mensen in je netwerk een seintje geven (niet om upvotes vragen, dat
  verbiedt PH).

### 3.6 Korte posts (X / Bluesky / Mastodon)

1. "A dropdown that stays on screen, with zero JavaScript: `popover` + anchor positioning. One class: `oc-dropdown-menu`." + GIF
2. "Dark mode in OmniaUI is one CSS function: `light-dark()`. No `dark:` on every element." + codevoorbeeld
3. "We rebuilt Laravel's Livewire starter kit without Tailwind. All tests pass, 10 kB of CSS." + screenshot
4. "Your AI assistant writes Tailwind into every project. Ours checks every class first: `claude mcp add omniacss …`" + clip
5. "`p-4` in OmniaCSS is 4rem, not 1rem. Here's why the scale is in rem units you can read." + tabel

## 4. Handleidingen die we nog moeten schrijven

Deze maken zoekverkeer én geven AI-assistenten bronnen. Elk als pagina op omniaui.eu of omniacss.eu, kort, met code.

| Handleiding | Site | Prioriteit |
|---|---|---|
| Laravel 13 + OmniaCSS in 5 minuten (starterkit of bestaande app) | omniaui.eu/guides | hoog |
| Tailwind-project overzetten met `omniacss-migrate` (stap voor stap, met valkuilen) | omniacss.eu | hoog |
| Vue / React (Inertia) met OmniaUI-wrappers | omniaui.eu | hoog |
| Je AI-assistent OmniaCSS leren (MCP, llms.txt, regelbestand) | omniacss.eu/docs/ai | hoog |
| Thema maken: eigen merkkleuren, RAL-kleuren, radius | omniaui.eu | middel |
| Filament zonder Tailwind (als het prototype lukt) | omniaui.eu | middel |
| Dashboard bouwen met Pro-blocks | omniaui.eu (Pro) | middel |
| Modern CSS uitgelegd met OmniaCSS-klassen (anchor, container queries, scroll-timeline) | omniacss.eu | laag, maar goed voor SEO |

## 5. Wat ik niet zou doen

- Geen betaalde reclame vóór de benchmark en de starterkits live zijn.
- Geen vergelijking die Tailwind afkraakt: eerlijk zijn over grenzen levert op HN/Reddit meer op dan claims.
- Geen nepreviews, geen upvote-ringen: dat schaadt meer dan het helpt (en PH/HN verbieden het).
