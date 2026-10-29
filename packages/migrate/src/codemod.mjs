// File: packages/migrate/src/codemod.mjs
// Codemod: rewrite Tailwind-style class names to native OmniaCSS classes where the declarations are identical.
// Everything else is left untouched and reported. Dry-run unless `write` is true.
// Author: Serge Cools | Framework: OmniaCSS

import fs from "node:fs/promises";
import path from "node:path";
import { classStrings, walk, DEFAULT_EXTENSIONS } from "./extract.mjs";
import { isClassString, makeKind } from "./scan.mjs";
import { loadOmniaIndex, nativeFor } from "./native.mjs";

export const MANIFEST = "omniacss-migrate.manifest.json";

// Tests and scripts often assert or build class names as data: rewriting them breaks the tests. Skipped unless asked.
const TEST_DIRS = /[\\/](tests?|__tests__|specs?|e2e|cypress|playwright|scripts)[\\/]/i;
const TEST_FILES = /\.(test|spec|cy)\.[cm]?[jt]sx?$|Test\.php$/;
const isTestOrScript = (file, dir) => TEST_DIRS.test(path.sep + path.relative(dir, file)) || TEST_FILES.test(file);

/**
 * @param {string} dir
 * @param {{ ctx: object, write?: boolean, extensions?: string[], cwd?: string }} o
 */
export async function runCodemod(dir, o) {
  const { ctx, write = false } = o;
  const index = loadOmniaIndex(o.cwd || dir);
  const kind = makeKind(ctx);
  const memo = new Map();
  const map = (t) => { if (!memo.has(t)) memo.set(t, nativeFor(t, ctx, index)); return memo.get(t); };
  const all = await walk(dir, { extensions: o.extensions || DEFAULT_EXTENSIONS });
  const skipped = o.includeTests ? [] : all.filter((f) => isTestOrScript(f, dir));
  const files = o.includeTests ? all : all.filter((f) => !isTestOrScript(f, dir));
  const report = { dir, write, files: [], skipped, total: 0, rewritten: 0, unchanged: 0, leftovers: new Map(), collisions: new Map(), mapping: new Map() };
  for (const file of files) {
    let text;
    try { text = await fs.readFile(file, "utf8"); } catch { continue; }
    const edits = [];
    for (const s of classStrings(text)) {
      if (!s.words.length) continue;
      const kinds = s.words.map(kind);
      if (!isClassString(kinds, s.hinted)) continue;
      s.spans.forEach((sp, i) => {
        if (kinds[i] !== "supported") return;
        report.total++;
        const r = map(sp.token);
        if (r?.native && r.native !== sp.token) {
          edits.push({ ...sp, to: r.native });
          report.rewritten++;
          report.mapping.set(sp.token, r.native);
        } else if (r?.collision) {
          report.collisions.set(sp.token, (report.collisions.get(sp.token) || 0) + 1);
          report.leftovers.set(sp.token, (report.leftovers.get(sp.token) || 0) + 1);
        } else if (r?.native) report.unchanged++;
        else report.leftovers.set(sp.token, (report.leftovers.get(sp.token) || 0) + 1);
      });
    }
    if (!edits.length) continue;
    let out = text;
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.to + out.slice(e.end);
    report.files.push({ file, changes: edits.length, sample: edits.slice(0, 5).map((e) => `${e.token} -> ${e.to}`) });
    if (write) await fs.writeFile(file, out);
  }
  const native = new Set(report.mapping.values());
  const manifestFile = path.join(o.manifestDir || dir, MANIFEST);
  if (write && native.size) {
    const prev = JSON.parse(await fs.readFile(manifestFile, "utf8").catch(() => "{}"));
    for (const t of prev.native || []) native.add(t);
    const ambiguous = [...native].filter((t) => report.leftovers.has(t));
    await fs.writeFile(manifestFile, JSON.stringify({ note: "Written by omniacss-migrate codemod: native OmniaCSS classes the compat layer must not emit.", native: [...native].sort(), ambiguous }, null, 1) + "\n");
    report.manifestFile = manifestFile;
  }
  report.ambiguous = [...native].filter((t) => report.leftovers.has(t));
  return report;
}

export function formatCodemod(r, { top = 25 } = {}) {
  const pct = r.total ? ((r.rewritten / r.total) * 100).toFixed(1) : "0";
  const lines = [];
  lines.push(`${r.write ? "Rewrote" : "Dry run, would rewrite"} ${r.rewritten} of ${r.total} class occurrences (${pct}%) in ${r.files.length} files under ${r.dir}`);
  for (const f of r.files.slice(0, 15)) lines.push(`  ${f.file}  (${f.changes})  e.g. ${f.sample.slice(0, 3).join(", ")}`);
  if (r.files.length > 15) lines.push(`  ... and ${r.files.length - 15} more files`);
  if (r.skipped?.length) {
    lines.push("", `Skipped ${r.skipped.length} test and script files (tests/, scripts/, *.test.*, *.spec.* …); add --include-tests to rewrite them too:`);
    for (const f of r.skipped.slice(0, 8)) lines.push(`  ${path.relative(r.dir, f)}`);
    if (r.skipped.length > 8) lines.push(`  ... and ${r.skipped.length - 8} more`);
  }
  const left = [...r.leftovers.entries()].sort((a, b) => b[1] - a[1]);
  lines.push("", `Left as they are (no 1:1 native class): ${left.reduce((n, [, c]) => n + c, 0)} occurrences, ${left.length} unique`);
  for (const [t, n] of left.slice(0, top)) lines.push(`  ${String(n).padStart(5)}  ${t}${r.collisions.has(t) ? "   (name exists in OmniaCSS with different meaning)" : ""}`);
  if (r.manifestFile) lines.push("", `Wrote ${r.manifestFile}: the compat layer skips these native classes so names never collide.`);
  if (r.ambiguous?.length) lines.push(`Ambiguous (both a native class and a Tailwind-style leftover): ${r.ambiguous.slice(0, 10).join(", ")}`);
  lines.push("", "Note: leftover classes keep working only while the compat layer (@birdycom/omniacss-migrate/postcss) stays enabled.");
  if (!r.write) lines.push("Run again with --write to apply.");
  return lines.join("\n");
}
