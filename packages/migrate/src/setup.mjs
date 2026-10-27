// File: packages/migrate/src/setup.mjs
// `omniacss-migrate setup <project>`: detect Tailwind in package.json / vite / postcss / CSS and plan (or apply)
// the switch to OmniaCSS. Planning never touches the disk; `apply` writes only the planned files.
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { loadProject, loadTailwindConfig, themeFromConfig, findFiles } from "./project.mjs";
import { createContext } from "./resolve.mjs";

const TW_PKGS = ["tailwindcss", "@tailwindcss/vite", "@tailwindcss/postcss"];
const TW_NAME = "(?:@tailwindcss\\/vite|@tailwindcss\\/postcss|tailwindcss)";
const VERSION = "^0.4.0";

const read = (f) => fs.readFile(f, "utf8").catch(() => null);

function detectIndent(text) {
  const m = text.match(/^([ \t]+)"/m);
  return m ? m[1] : "  ";
}

/** Tiny line diff (common prefix/suffix trimmed) for the dry-run output. */
export function diffLines(before, after) {
  const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length - 1, eb = b.length - 1;
  while (ea >= s && eb >= s && a[ea] === b[eb]) { ea--; eb--; }
  const x = a.slice(s, ea + 1), y = b.slice(s, eb + 1);
  const out = [];
  if (x.length * y.length > 4_000_000) {
    x.forEach((l) => out.push(`- ${l}`)); y.forEach((l) => out.push(`+ ${l}`));
    return out;
  }
  // LCS table (lines are few: config files)
  const dp = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; }
    else if (j < y.length && (i === x.length || dp[i][j + 1] >= dp[i + 1][j])) out.push(`+ ${y[j++]}`);
    else out.push(`- ${x[i++]}`);
  }
  return out;
}

function transformVite(text) {
  let out = text;
  const notes = [];
  const imp = out.match(new RegExp(`^[ \\t]*import\\s+(\\w+)\\s+from\\s+['"]${TW_NAME}['"];?[ \\t]*$`, "m"));
  const req = out.match(new RegExp(`^[ \\t]*(?:const|let|var)\\s+(\\w+)\\s*=\\s*require\\(['"]${TW_NAME}['"]\\);?[ \\t]*$`, "m"));
  const hit = imp || req;
  const name = hit?.[1];
  if (hit) {
    const line = imp ? "import omniaMigrate from '@birdycom/omniacss-migrate/vite';" : "const omniaMigrate = require('@birdycom/omniacss-migrate/vite');";
    out = out.replace(hit[0], hit[0].replace(/\S.*$/, line));
    out = out.replace(new RegExp(`\\b${name}\\(`, "g"), "omniaMigrate(");
    // bare references inside the css.postcss.plugins array: the Vite plugin injects the PostCSS part itself
    out = out.replace(new RegExp(`(plugins:\\s*\\[)\\s*${name}\\s*,\\s*`, "g"), "$1");
    out = out.replace(new RegExp(`,\\s*${name}\\s*(?=[,\\]])`, "g"), "");
    out = out.replace(new RegExp(`(plugins:\\s*\\[)\\s*${name}\\s*\\]`, "g"), "$1]");
  } else if (!/@birdycom\/omniacss-migrate/.test(out)) {
    // no Tailwind import: add the plugin when there is a plugins array
    if (/plugins:\s*\[/.test(out) && /import\s/.test(out)) {
      const lines = out.split("\n");
      const lastImport = lines.map((l, i) => (/^\s*import\s/.test(l) ? i : -1)).filter((i) => i >= 0).pop();
      lines.splice(lastImport + 1, 0, "import omniaMigrate from '@birdycom/omniacss-migrate/vite';");
      out = lines.join("\n").replace(/(\n\s*)plugins:\s*\[/, "$1plugins: [$1    omniaMigrate(),");
      notes.push("added omniaMigrate() to plugins");
    }
  }
  return { out, notes };
}

function transformPostcss(text, hasVite) {
  let out = text;
  const entry = new RegExp(`^[ \\t]*["']?${TW_NAME}["']?[ \\t]*:[ \\t]*\\{[^}]*\\}[ \\t]*,?[ \\t]*\\r?\\n`, "gm");
  const arrayEntry = new RegExp(`^[ \\t]*(?:require\\(['"]${TW_NAME}['"]\\)|['"]${TW_NAME}['"]|tailwindcss(?:\\(\\))?)[ \\t]*,?[ \\t]*\\r?\\n`, "gm");
  const replacement = hasVite ? "" : null;
  if (replacement !== null) out = out.replace(entry, "").replace(arrayEntry, "");
  else {
    out = out.replace(entry, (m) => m.replace(/\S[\s\S]*?:\s*\{[^}]*\}/, '"@birdycom/omniacss-migrate/postcss": {}'));
    out = out.replace(arrayEntry, (m) => m.replace(/\S[^,\r\n]*/, "require('@birdycom/omniacss-migrate/postcss')()"));
  }
  return out;
}

/**
 * Plan the switch for a project.
 * @param {string} dir
 * @returns {Promise<{ changes: Array<{file:string, before:string, after:string, note:string}>, notes: string[], commands: string[], detected: object }>}
 */
export async function planSetup(dir, { keepBrandColors = false } = {}) {
  const changes = [], notes = [], commands = [];
  const detected = { tailwind: false, packages: [], vite: [], postcss: [], css: [], config: null };

  // package.json
  const pkgFile = path.join(dir, "package.json");
  const pkgText = await read(pkgFile);
  if (pkgText == null) throw new Error(`No package.json in ${dir}`);
  const pkg = JSON.parse(pkgText);
  const removed = [];
  for (const section of ["dependencies", "devDependencies"]) {
    for (const name of TW_PKGS) if (pkg[section]?.[name]) { removed.push(name); detected.packages.push(`${name}@${pkg[section][name]}`); }
  }
  detected.tailwind = removed.length > 0;
  const afterPkg = structuredClone(pkg);
  for (const section of ["dependencies", "devDependencies"]) for (const name of TW_PKGS) if (afterPkg[section]) delete afterPkg[section][name];
  afterPkg.devDependencies ||= {};
  afterPkg.devDependencies["@birdycom/omniacss-migrate"] = VERSION;
  afterPkg.devDependencies = Object.fromEntries(Object.entries(afterPkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)));
  const nl = pkgText.includes("\r\n") ? "\r\n" : "\n";
  const pkgAfter = JSON.stringify(afterPkg, null, detectIndent(pkgText)).replace(/\n/g, nl) + (pkgText.endsWith("\n") ? nl : "");
  changes.push({ file: pkgFile, before: pkgText, after: pkgAfter, note: `remove ${removed.join(", ") || "(no tailwind packages)"}; add @birdycom/omniacss-migrate` });
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["@iconify/tailwind4"] || deps["@iconify/tailwind"]) notes.push("Icon classes from the Iconify Tailwind plugin (icon-[mdi--home]) are not generated: switch those to an icon component or the Iconify web component.");
  if (deps["@tailwindcss/typography"]) notes.push("@tailwindcss/typography (prose) is not emulated.");
  if (deps["@tailwindcss/forms"]) notes.push("@tailwindcss/forms is not emulated; the base reset covers most form basics.");
  if (deps["tailwindcss-animate"] || deps["tw-animate-css"]) notes.push("tailwindcss-animate classes (animate-in, fade-in-0, zoom-in-95, slide-in-from-*) are emulated.");
  if (deps["tailwind-merge"]) notes.push("tailwind-merge keeps working unchanged: your class names stay the same.");
  if (deps["prettier-plugin-tailwindcss"]) notes.push("prettier-plugin-tailwindcss only sorts class names; it can stay.");

  // vite + postcss configs
  const viteFiles = [];
  for (const n of ["vite.config.js", "vite.config.ts", "vite.config.mjs", "vite.config.mts"]) if (await read(path.join(dir, n)) != null) viteFiles.push(path.join(dir, n));
  for (const f of viteFiles) {
    const before = await read(f);
    const { out, notes: n } = transformVite(before);
    detected.vite.push(path.basename(f));
    if (out !== before) changes.push({ file: f, before, after: out, note: "use the OmniaCSS Vite plugin" + (n.length ? ` (${n.join(", ")})` : "") });
    else notes.push(`${path.basename(f)}: no Tailwind plugin found. Add \`import omniaMigrate from '@birdycom/omniacss-migrate/vite'\` and put omniaMigrate() in plugins.`);
  }
  for (const n of ["postcss.config.js", "postcss.config.cjs", "postcss.config.mjs"]) {
    const f = path.join(dir, n);
    const before = await read(f);
    if (before == null) continue;
    detected.postcss.push(n);
    const after = transformPostcss(before, viteFiles.length > 0);
    if (after !== before) changes.push({ file: f, before, after, note: viteFiles.length ? "remove the Tailwind PostCSS plugin (the Vite plugin injects the OmniaCSS one)" : "swap the Tailwind PostCSS plugin for @birdycom/omniacss-migrate/postcss" });
  }

  // tailwind.config + css
  const project = await loadProject(dir, { keepBrandColors });
  detected.config = project.info.configFile ? path.basename(project.info.configFile) : null;
  const loaded = await loadTailwindConfig(dir);
  const cssFiles = (await findFiles(dir, (n) => n.endsWith(".css"))).filter((f) => !/[\\/]public[\\/]/.test(f));
  let entryDone = false;
  for (const f of cssFiles) {
    const before = await read(f);
    if (!/@import\s+["']tailwindcss|@tailwind\s+(base|utilities)/.test(before)) continue;
    detected.css.push(path.relative(dir, f));
    if (entryDone) continue;
    entryDone = true;
    const add = [];
    if (loaded?.config) {
      const t = themeFromConfig(loaded.config, createContext({}), { keepColors: keepBrandColors });
      if (t.decls.length && !/omniacss-migrate: theme/.test(before)) {
        add.push("/* omniacss-migrate: theme from tailwind.config (literal colors mapped to the nearest Omnia palette token) */");
        add.push("@theme {");
        for (const [k, v] of t.decls) add.push(`  ${k}: ${v};`);
        add.push("}");
      }
      notes.push(...t.notes.filter((n) => !n.startsWith("color ")));
      const dm = Array.isArray(loaded.config.darkMode) ? loaded.config.darkMode[0] : loaded.config.darkMode;
      if ((dm === "class" || dm === "selector") && !/@custom-variant\s+dark/.test(before)) add.push("@custom-variant dark (&:where(.dark, .dark *));");
    }
    if (add.length) {
      const re = /^(@import\s+["']tailwindcss["'][^;\n]*;|@tailwind\s+utilities;)[ \t]*\r?\n/m;
      const m = before.match(re);
      const eol = before.includes("\r\n") ? "\r\n" : "\n";
      const after = m ? before.replace(re, `${m[0]}${eol}${add.join(eol)}${eol}`) : before + eol + add.join(eol) + eol;
      changes.push({ file: f, before, after, note: "carry tailwind.config theme into CSS (@theme) and dark mode variant" });
    } else notes.push(`${path.relative(dir, f)}: the directives (@import "tailwindcss" / @tailwind …) are handled by the plugin; no change needed.`);
    if (/@plugin\s+['"]@iconify/.test(before)) notes.push("`@plugin '@iconify/...'` is ignored by the plugin (icon-[...] classes are not generated).");
  }
  if (!detected.css.length) notes.push("No CSS file with Tailwind directives found. The plugin works on `@import \"tailwindcss\"` or `@tailwind base/components/utilities`.");
  commands.push("npm uninstall " + (removed.join(" ") || "tailwindcss @tailwindcss/vite"));
  commands.push("npm install -D @birdycom/omniacss-migrate");
  return { changes, notes, commands, detected };
}

/** Write the planned changes to disk. */
export async function applySetup(plan, { backup = false } = {}) {
  for (const c of plan.changes) {
    if (backup) await fs.copyFile(c.file, c.file + ".pre-omnia");
    await fs.writeFile(c.file, c.after);
  }
}

export function formatPlan(plan, dir, { write = false } = {}) {
  const lines = [];
  lines.push(`OmniaCSS setup for ${dir}`);
  lines.push(`Detected: ${plan.detected.tailwind ? "Tailwind " + plan.detected.packages.join(", ") : "no Tailwind package"}; vite: ${plan.detected.vite.join(", ") || "-"}; postcss: ${plan.detected.postcss.join(", ") || "-"}; css: ${plan.detected.css.join(", ") || "-"}; config: ${plan.detected.config || "-"}`);
  lines.push("");
  for (const c of plan.changes) {
    lines.push(`${write ? "Updated" : "Would update"} ${path.relative(dir, c.file) || c.file}  (${c.note})`);
    const diff = diffLines(c.before, c.after);
    for (const l of diff.slice(0, 40)) lines.push("    " + l);
    if (diff.length > 40) lines.push(`    ... ${diff.length - 40} more lines`);
  }
  if (plan.notes.length) { lines.push("", "Notes:"); for (const n of plan.notes) lines.push("  - " + n); }
  lines.push("", write ? "Next:" : "Dry run only. Re-run with --write to apply. Then:");
  for (const c of plan.commands) lines.push("  " + c);
  return lines.join("\n");
}
