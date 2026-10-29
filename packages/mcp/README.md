# @birdycom/omniacss-mcp

An [MCP](https://modelcontextprotocol.io) server for **OmniaCSS**. AI assistants such as Claude, Cursor, VS Code Copilot,
Windsurf and Zed use it to check OmniaCSS classes before they write them, instead of guessing from Tailwind.

The server is read-only: it never changes your files. Only `read_docs` goes on the network, and only to omniacss.eu.

## Tools

| Tool | What it does |
|---|---|
| `getting_started` | Install (CDN, npm + PostCSS/Vite, CLI), dark mode and the rules for writing OmniaCSS markup |
| `lookup_classes` | Checks classes, variants included (`md:hover:…`), and OmniaUI `oc-*` classes. Returns the exact CSS, or the closest correct name for a typo |
| `search_utilities` | Finds classes by name or by CSS (`"anchor"`, `"grid cols"`, `"position-area"`) |
| `list_variants` | Lists every variant prefix, or shows the selector or at-rule that one variant produces |
| `color_tokens` | Lists the theme tokens (`--oc-primary` …) with their light and dark colors, and the palette colors (`--color-*`) with their hex value |
| `convert_tailwind` | Gives the native OmniaCSS class for a Tailwind class, or the CSS that the migrate plugin generates for it |
| `search_docs` / `read_docs` | Finds documentation pages and sections, and reads one as text with its code examples |

The class index is the same one the [OmniaCSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=Birdycom.omniacss-intellisense)
editor extension uses, built from the same OmniaCSS version. OmniaUI component classes are included. When the project
has `@birdycom/omniaui-pro` installed, the Pro classes are included too.

## Setup

Node.js 22 or newer. The server runs with `npx`, so there is nothing to install first.

**Claude Code**

```bash
claude mcp add omniacss -- npx -y @birdycom/omniacss-mcp
```

**Claude Desktop, Cursor, Windsurf** (`claude_desktop_config.json`, `.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json`)

```json
{
  "mcpServers": {
    "omniacss": { "command": "npx", "args": ["-y", "@birdycom/omniacss-mcp"] }
  }
}
```

**VS Code** (`.vscode/mcp.json`)

```json
{
  "servers": {
    "omniacss": { "type": "stdio", "command": "npx", "args": ["-y", "@birdycom/omniacss-mcp"] }
  }
}
```

Start the server in your project folder. Most clients do that by default; then OmniaUI packages installed in the
project are found.

To pin the server to the OmniaCSS version your project uses, put a version in the package name, for example
`@birdycom/omniacss-mcp@0.12`.

Once it is connected, ask your assistant something like *"Build a pricing card with OmniaCSS; check the classes with the
omniacss tools"*.

## In code

```js
import { load } from "@birdycom/omniacss-mcp/knowledge";
const kb = await load();
kb.lookup(["p-1", "md:flx"]);   // [{ token: "p-1", known: true, css: ".p-1 { padding: 1rem; … }" }, { …, hint: 'did you mean "md:flex"?' }]
```

Docs: https://omniacss.eu/docs/ · MIT
