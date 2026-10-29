#!/usr/bin/env node
// File: packages/mcp/bin/omniacss-mcp.mjs
// Starts the OmniaCSS MCP server on stdio (the way Claude Code, Claude Desktop, Cursor and VS Code run local servers).
// The working directory is the project: OmniaUI (Pro) classes installed there are included.
// Author: Serge Cools | Framework: OmniaCSS

import { createRequire } from "node:module";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { load } from "../src/knowledge.mjs";
import { createServer } from "../src/server.mjs";

const { version } = createRequire(import.meta.url)("../package.json");

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(version);
  process.exit(0);
}

const kb = await load({ project: process.cwd() });
await createServer(kb, { version }).connect(new StdioServerTransport());
// stdout carries the protocol; anything for people goes to stderr.
console.error(`[omniacss-mcp] ${version} ready (OmniaCSS ${kb.version}, ${kb.omnia.names.length} utilities, ${kb.components.names.length} OmniaUI classes)`);
