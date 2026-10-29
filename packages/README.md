<!-- File: packages/README.md -->
# OmniaCSS packages (npm workspaces)

| Folder | Package | |
|--------|---------|---|
| `core` | `@birdycom/omniacss` | utilities, tokens, SCSS, on-demand engine, PostCSS plugin |
| `cli` | `@birdycom/omniacss-cli` | `omniacss init / build / migrate` |
| `migrate` | `@birdycom/omniacss-migrate` | migration from other utility frameworks (PostCSS + Vite plugin) |
| `mcp` | `@birdycom/omniacss-mcp` | MCP server for AI assistants (class lookup, variants, tokens, docs, Tailwind conversion) |

Components, blocks and the React/Vue wrappers moved to the OmniaUI repo
(`@birdycom/omniaui`, `@birdycom/omniaui-blocks`, `@birdycom/omniaui-react`, `@birdycom/omniaui-vue`).

All packages share one version, also with OmniaUI (see `.cursor/rules/omniacss-versioning.mdc`). Build with `npm run build` in the repository root.
