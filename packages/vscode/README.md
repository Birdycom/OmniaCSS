<img src="media/readme/banner.png" alt="OmniaCSS IntelliSense" width="100%">

OmniaCSS IntelliSense brings [OmniaCSS](https://github.com/Birdycom/OmniaCSS) into your editor: autocomplete for every utility and variant, the generated CSS on hover, color swatches and linting with quick fixes. It works in **VS Code**, **Cursor** and other editors built on VS Code.

<img src="media/readme/demo.gif" alt="Typing bg-blue- shows Omnia colors with swatches, hover shows the generated CSS, a typo in a variant gets a quick fix" width="100%">

## Installation

**[Install from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Birdycom.omniacss-intellisense)**, or search for *OmniaCSS IntelliSense* in the Extensions view.

- **Cursor, VSCodium, Windsurf:** the extension comes from [Open VSX](https://open-vsx.org/extension/Birdycom/omniacss-intellisense). Search for *OmniaCSS IntelliSense* in the Extensions view.
- **Updates** arrive automatically, like for any other extension. Each release follows `@birdycom/omniacss` and has the same version number.

The extension needs nothing from your project: no config file and no install. It ships the full OmniaCSS index and starts working in any HTML, Blade, Vue, JSX or CSS file.

## Features

### Autocomplete

Suggestions for every OmniaCSS utility, variant (`hover:`, `focus-visible:`, `dark:`, `cq-md:`, `group-hover/card:`, `has-checked:` …) and arbitrary variant (`data-[state=open]:`, `supports-[…]:`). Color utilities show their color, and the details panel shows the CSS the class generates. Accepting a variant opens the list again for the utility.

<img src="media/readme/autocomplete.png" alt="Completion list for bg-blue- with color swatches and the CSS of bg-blue-50" width="100%">

### Hover Preview

Hover a class to see the CSS it generates, with its variants applied (`md:hover:bg-red-50` → `@media … { .md\:hover\:bg-red-50:hover { … } }`). rem values get a px comment. For colors you also see the Omnia token and its sRGB value.

<img src="media/readme/hover.png" alt="Hovering hover:bg-blue-70 shows the generated rule and the color token" width="100%">

### Color swatches and picker

A swatch appears next to color utilities (`bg-red-50`, `text-blue-30`, `border-ral9023` …) and next to `var(--color-…)` tokens in CSS, SCSS, HTML and templates. Pick another color in the picker and the class or token changes to the **nearest Omnia color**. Inside `var(--…)` you get completion for every token.

### Linting

Problems show up as you type, each with a quick fix (<kbd>Ctrl</kbd>+<kbd>.</kbd> / <kbd>Cmd</kbd>+<kbd>.</kbd>):

- an unknown variant: `hovr:flex` → *Did you mean 'hover'?*
- a variant on something that is not a utility: `hover:bg-rde-50` generates no CSS
- the same class twice in one class list
- optional: every class that is not an OmniaCSS utility (`omniacss.lint.unknownClass`)

<img src="media/readme/linting.png" alt="A wavy underline under hovr with the message: Unknown OmniaCSS variant 'hovr'. Did you mean 'hover'?" width="100%">

### Where classes are recognised

| Where | Example |
|---|---|
| Class attributes | `class="…"`, `className="…"` |
| Bound attributes and expressions | `:class="{ 'p-2': on }"`, `className={cn("flex", on && "gap-1")}`, `` className={`p-2 ${x}`} ``, `class:list={[…]}` |
| Helper calls | `clsx(…)`, `cn(…)`, `cx(…)`, `cva(…)`, `classNames(…)`, Blade `@class([…])`, `classList.add(…)` |

Languages: HTML, PHP/Blade, Vue, Svelte, Astro, JSX/TSX, Markdown/MDX, Twig, Handlebars, ERB, Django/Jinja, Liquid, Razor and more; CSS, SCSS, Sass and Less for tokens. Add more with `omniacss.includeLanguages`.

## Recommended VS Code Settings

### `editor.quickSuggestions`

VS Code does not open suggestions inside strings on its own. The extension opens them on `"`, `'`, space, `:` and `-`. To get them on every keystroke as well:

```json
"editor.quickSuggestions": {
  "strings": "on"
}
```

### `editor.colorDecoratorsActivatedOn`

By default VS Code opens its color picker when you hover a color class, on top of the CSS preview. To keep the preview and open the picker by clicking the swatch:

```json
"editor.colorDecoratorsActivatedOn": "click"
```

### `files.associations`

Blade templates get class support as `php`. With a Blade extension installed they are `blade`, which works too. For other template formats, map them to a supported language or add their id to `omniacss.includeLanguages`.

## Extension Commands

### `OmniaCSS: Show Output`

Opens the *OmniaCSS IntelliSense* output channel: the index version, the number of utilities and the load time, or the error when the index could not be loaded.

## Extension Settings

| Setting | Default | |
|---|---|---|
| `omniacss.enable` | `true` | Turn the extension off per workspace or folder. |
| `omniacss.classAttributes` | `class`, `className`, `class:list`, `:class`, `v-bind:class`, `x-bind:class`, `ngClass`, `[ngClass]`, `[class]` | Attributes that hold classes. |
| `omniacss.classFunctions` | `clsx`, `cn`, `cx`, `cva`, `classNames`, `classnames`, `@class` | Calls whose string arguments hold classes. |
| `omniacss.includeLanguages` | `[]` | Extra language ids (reload the window after changing). |
| `omniacss.colorDecorators` | `true` | Color swatches and the picker. |
| `omniacss.showPixelEquivalents` | `true` | px comments for rem values. |
| `omniacss.rootFontSize` | `16` | Root font size for those px values. |
| `omniacss.lint.unknownVariant` | `warning` | `ignore`, `hint`, `info`, `warning` or `error`. |
| `omniacss.lint.unknownUtility` | `warning` | |
| `omniacss.lint.unknownClass` | `ignore` | |
| `omniacss.lint.duplicateClass` | `warning` | |

## Troubleshooting

- No suggestions inside a string? Add the `editor.quickSuggestions` setting above, or press <kbd>Ctrl</kbd>+<kbd>Space</kbd>.
- Nothing at all in a file? Check the language in the status bar. If it is not in the list above, add its id to `omniacss.includeLanguages` and reload the window.
- Classes in a custom attribute or helper function? Add the name to `omniacss.classAttributes` or `omniacss.classFunctions`.
- Still stuck? Run **OmniaCSS: Show Output** and include its contents when you [open an issue](https://github.com/Birdycom/OmniaCSS/issues).

## How it works

The extension ships an index of the full OmniaCSS build (every utility, its declarations and colors) and the engine's own variant module. Variant CSS is derived from the base utility exactly like `omniacss build` and the PostCSS plugin do it, so the hover shows what will end up in your CSS. Nothing runs in your project and no files are read outside the open documents.

## Build from source

From the OmniaCSS repository root:

```bash
npm run build:packages   # packages/core/dist (the full build)
npm run vscode:package   # index + .vsix in packages/vscode
```

Install the `.vsix` with **Extensions: Install from VSIX…**, or `code --install-extension packages/vscode/omniacss-intellisense-<version>.vsix` (`cursor --install-extension …` for Cursor).

Tests: `npm run vscode:test`. The demo and the feature pictures are recorded in real VS Code with this extension loaded: `npm install --prefix packages/vscode && npm run media --prefix packages/vscode` (needs VS Code, plus Chrome or Edge to frame the shots and draw the icon; set `VSCODE_PATH` if VS Code is not in its default place).

MIT © Serge Cools (Birdycom)
