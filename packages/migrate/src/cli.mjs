// File: packages/migrate/src/cli.mjs
// OmniaCSS migrate CLI (used by bin/omniacss-migrate.mjs and `omniacss migrate`): scan | setup | codemod | build | css
// Author: Serge Cools | Framework: OmniaCSS

import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadProject } from "./project.mjs";
import { scanDir, formatScan } from "./scan.mjs";
import { runCodemod, formatCodemod } from "./codemod.mjs";
import { planSetup, applySetup, formatPlan } from "./setup.mjs";
import { compileToken } from "./resolve.mjs";

export const HELP = `
omniacss-migrate - switch from Tailwind CSS to OmniaCSS and keep your class names

  omniacss-migrate scan <dir>                    coverage report: how many classes the compat layer supports
  omniacss-migrate setup <project> [--write]     plan (default) or apply the switch (deps, vite/postcss config, CSS)
  omniacss-migrate codemod <dir> [--write]       rewrite classes to native OmniaCSS names where 1:1 (dry run by default)
  omniacss-migrate build [-c glob]... [-o file]  write the compat + core CSS once (no Vite/PostCSS needed)
  omniacss-migrate css "<class>"                 print the CSS for one class

Bootstrap 3/4/5 -> OmniaCSS + OmniaUI
  omniacss-migrate bootstrap scan <dir>              report: what converts, what stays (grid), what needs a hand
  omniacss-migrate bootstrap codemod <dir> --write   rewrite classes, swap the <link>, write bootstrap-compat.css

Options
  --write               apply changes (setup, codemod)
  --top <n>             rows in the unsupported list (scan, codemod; default 40)
  --json                machine readable output (scan)
  --breakpoints <omnia|tailwind>   sm/md/lg values (default omnia)
  --dark <class|media>  dark mode strategy (default: detected)
  --tailwind <3|4>      naming flavor (default: detected)
  --keep-brand-colors   keep literal brand colors from tailwind.config instead of mapping to Omnia tokens
  --bs <3|4|5>          (bootstrap) Bootstrap version (default: detected)
  --breakpoints exact   (bootstrap) keep Bootstrap's px breakpoints as min-[…]: variants instead of the nearest Omnia breakpoint
  --compat <file>       (bootstrap) where to write the compat stylesheet (default bootstrap-compat.css)
  --omnia-href, --omniaui-href, --compat-href   (bootstrap) stylesheet URLs that replace the Bootstrap <link>
`;

function parse(args) {
  return parseArgs({
  args, allowPositionals: true,
  options: {
    write: { type: "boolean" }, top: { type: "string" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" },
    breakpoints: { type: "string" }, dark: { type: "string" }, tailwind: { type: "string" }, "keep-brand-colors": { type: "boolean" },
    content: { type: "string", short: "c", multiple: true }, output: { type: "string", short: "o" }, backup: { type: "boolean" },
    bs: { type: "string" }, compat: { type: "string" }, "omnia-href": { type: "string" }, "omniaui-href": { type: "string" }, "compat-href": { type: "string" },
  },
  });
}

let values, positionals;

function ctxOptions() {
  return {
    breakpoints: values.breakpoints, darkMode: values.dark, v4: values.tailwind ? Number(values.tailwind) >= 4 : undefined,
    keepBrandColors: values["keep-brand-colors"],
  };
}

export async function run(args = process.argv.slice(2)) {
  ({ values, positionals } = parse(args));
  const [command, target] = positionals;
  if (!command || values.help || command === "help") { console.log(HELP); return; }
  const cwd = process.cwd();
  const dir = path.resolve(cwd, target || ".");
  const top = Number(values.top || 40);

  if (command === "bootstrap") {
    const [, sub, where] = positionals;
    if (!["scan", "codemod"].includes(sub)) { console.log(HELP); process.exitCode = 1; return; }
    const { migrateBootstrap, formatBootstrap } = await import("./bootstrap/migrate.mjs");
    const report = await migrateBootstrap(path.resolve(cwd, where || "."), {
      write: sub === "codemod" && !!values.write, version: values.bs ? Number(values.bs) : undefined,
      breakpoints: values.breakpoints === "exact" ? "exact" : "omnia", compatFile: values.compat,
      omniaHref: values["omnia-href"], omniauiHref: values["omniaui-href"], compatHref: values["compat-href"],
    });
    console.log(formatBootstrap(report, { top }));
    return;
  }

  if (command === "scan") {
    const { ctx, info } = await loadProject(dir, ctxOptions());
    const stats = await scanDir(dir, { ctx });
    if (values.json) {
      console.log(JSON.stringify({ dir, files: stats.files, occurrences: stats.occurrences, supported: stats.supported, coverage: +stats.coverage.toFixed(2),
        unsupported: Object.fromEntries([...stats.unsupported].sort((a, b) => b[1] - a[1]).slice(0, top)) }, null, 2));
    } else {
      console.log(`Tailwind ${info.tailwindVersion ?? "?"} project, dark mode: ${ctx.darkMode}, ${info.themeVars.size} custom theme variables\n`);
      console.log(formatScan(stats, { top }));
    }
    return;
  }

  if (command === "setup") {
    const plan = await planSetup(dir, { keepBrandColors: values["keep-brand-colors"] });
    if (values.write) await applySetup(plan, { backup: values.backup });
    console.log(formatPlan(plan, dir, { write: !!values.write }));
    return;
  }

  if (command === "codemod") {
    const { ctx } = await loadProject(dir, { ...ctxOptions(), breakpoints: values.breakpoints || "omnia" });
    const report = await runCodemod(dir, { ctx, write: !!values.write, cwd: dir });
    console.log(formatCodemod(report, { top }));
    return;
  }

  if (command === "build") {
    const postcss = (await import("postcss")).default;
    const plugin = (await import("./postcss.mjs")).default;
    const output = values.output || "omnia-compat.css";
    const content = values.content?.length ? values.content : undefined;
    const input = '@import "tailwindcss";\n';
    const result = await postcss([plugin({ cwd: dir, content, ...ctxOptionsForPlugin() })]).process(input, { from: path.join(dir, "entry.css") });
    await fs.writeFile(path.resolve(cwd, output), result.css);
    console.log(`Wrote ${output} (${(result.css.length / 1024).toFixed(1)} KB)`);
    return;
  }

  if (command === "css") {
    const { ctx } = await loadProject(cwd, ctxOptions());
    for (const token of positionals.slice(1).length ? positionals.slice(1) : [target]) {
      const css = compileToken(token, ctx);
      console.log(css ?? `/* ${token}: not supported */`);
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.log(HELP);
  process.exitCode = 1;
}

function ctxOptionsForPlugin() {
  return { breakpoints: values.breakpoints, darkMode: values.dark, tailwind: values.tailwind ? Number(values.tailwind) : undefined };
}

