# OmniaCSS-versie (semver, alle packages in lockstep)

Formaat: `MAJOR.MINOR.PATCH` (bijv. `0.4.0`). npm accepteert geen vier-delige versies, daarom drie delen
(zelfde workflow als OmniaDesk). Root `package.json`, `apps/docs` en alle `@birdycom/omniacss*` packages hebben altijd dezelfde versie.

**OmniaCSS en OmniaUI (`D:\webdev\omniaUI`) houden hetzelfde versienummer aan.** Breng je de ene repo naar
een nieuwe versie, zet de andere bij de volgende release op hetzelfde nummer (daar: `npm run release -- X.Y.Z "..."`).

## Agent bepaalt de bump (niet de gebruiker vragen)

| Soort wijziging | Bump | Voorbeeld `0.4.0` → |
|-----------------|------|----------------------|
| **Kleine ingreep** — bugfix, polish, typo, kleine UI-tweak | `patch` | `0.4.1` |
| **Nieuw item** — utilities, tokens, CLI-commando, docs-pagina, merkbare wijziging | `minor` | `0.5.0` |
| **Breaking** — klasse hernoemd/verwijderd, nieuwe verplichte setup | `major` | `1.0.0` |

Bij twijfel: de **kleinere** bump. Geen bump bij pure interne docs/rules zonder effect voor gebruikers.

## Werkwijze

```bash
npm run release -- minor "Korte omschrijving van de wijziging"
```

Dit script:
1. zet de versie in `package.json` + `packages/*/package.json` (en de onderlinge `@birdycom/omniacss*`-ranges),
2. werkt **Versie:** en de tabel **Recente wijzigingen** (nieuwste bovenaan) in `README.md` bij,
3. zet dezelfde rij bovenaan in `docs/release-history.json` (de docs-site toont deze historiek).

## Elke commit vermeldt de versie vooraan

```
<type>: [vX.Y.Z] - <korte omschrijving>
```

Voorbeelden: `fix: [v0.4.1] - hero padding op mobiel`, `feat: [v0.5.0] - block testimonials`.

## Publiceren (alleen op vraag van de gebruiker)

```bash
npm run build
npm publish --workspaces --access public
```
