#!/usr/bin/env node
// File: packages/migrate/bin/omniacss-migrate.mjs
// Author: Serge Cools | Framework: OmniaCSS
import { run } from "../src/cli.mjs";

run().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
