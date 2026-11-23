// scripts/release.mjs
// Version bump for the whole OmniaCSS workspace (root + every @birdycom/omniacss* package, kept in lockstep).
// Flags: --dry-run (write nothing, only show + verify), --no-verify (skip build + pack dry-run).
// Usage: npm run release -- <patch|minor|major|x.y.z> "Short summary of the change" [--dry-run]
// Map: parse args -> next version -> package.json files -> README (Version + Recent changes) -> docs/release-history.json
//      (+ the English notes from docs/release-notes-next.json) -> verify
//
// The release notes page (omniacss.eu/release-notes.html, apps/docs/src/lib/release-notes.mjs) reads docs/release-history.json.
// Collect the English notes of the coming release in docs/release-notes-next.json ({ summary, new, improved, changed,
// fixed }); this script moves them into the new release and empties the file again. Without notes the page shows the
// summary given here, so write that in English when there are no notes.
//
// Rules (same workflow as OmniaDesk, but npm needs 3-part semver):
//   patch  +0.0.1  bugfix, polish, typo, small UI tweak
//   minor  +0.1.0  new utilities, components, blocks, pages or other noticeable change
//   major  +1.0.0  breaking change (renamed/removed classes, new required setup)
// Commit subject afterwards: <type>: [vX.Y.Z] - <short description>

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { readLock, restoreOptional, snapshotOptional, writeLock } from "./preserve-optional-lock.mjs";

const root = process.cwd();
// OmniaCSS packages only. The OmniaUI repo has its own copy of this script and keeps the same version number.
const PACKAGES = ["package.json", "packages/core/package.json", "packages/cli/package.json", "packages/migrate/package.json", "packages/mcp/package.json", "apps/docs/package.json", "packages/vscode/package.json"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipVerify = args.includes("--no-verify");
const [bump, ...summaryParts] = args.filter((a) => !["--dry-run", "--no-verify"].includes(a));
const summary = summaryParts.join(" ").trim();

if (!bump || !summary) {
  console.error('Usage: npm run release -- <patch|minor|major|x.y.z> "Short summary" [--dry-run] [--no-verify]');
  process.exit(1);
}

const readJson = async (file) => JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
const current = (await readJson("package.json")).version;

function next(version, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump "${kind}" (use patch, minor, major or x.y.z)`);
}

const version = next(current, bump);
const date = new Date().toISOString().slice(0, 10);
const write = async (file, text) => {
  if (dryRun) console.log(`[dry-run] would write ${file}`);
  else await fs.writeFile(path.join(root, file), text);
};

// 1. package.json files (+ internal dependency ranges)
for (const file of PACKAGES) {
  const pkg = await readJson(file);
  pkg.version = version;
  for (const field of ["dependencies", "peerDependencies", "devDependencies"]) {
    for (const dep of Object.keys(pkg[field] || {})) {
      if (dep.startsWith("@birdycom/omniacss")) pkg[field][dep] = `^${version}`;
    }
  }
  await write(file, JSON.stringify(pkg, null, 2) + "\n");
}

// 2. README: version line + newest row on top of "Recent changes" (\r? : the working copy may use CRLF)
const readmePath = "README.md";
let readme = await fs.readFile(path.join(root, readmePath), "utf8");
readme = readme.replace(/(\*\*Version:\*\* `)[^`]+(`)/, `$1${version}$2`);
readme = readme.replace(/(\| Version \| Date \| Changes \|\r?\n\|[-| ]+\|\r?\n)/, `$1| \`${version}\` | ${date} | ${summary.replace(/\|/g, "\\|")} |\n`);
await write(readmePath, readme);

// 3. docs/release-history.json (read by the docs site: docs home + /release-notes.html), with the English notes
//    collected in docs/release-notes-next.json. Re-running the same version keeps the notes it already has.
const historyPath = "docs/release-history.json";
const nextNotesPath = "docs/release-notes-next.json";
const NOTE_LISTS = ["new", "improved", "changed", "fixed"];
const emptyNotes = { summary: "", new: [], improved: [], changed: [], fixed: [] };
const history = await readJson(historyPath).catch(() => ({ releases: [] }));
const nextNotes = await readJson(nextNotesPath).catch(() => ({}));
const notes = {};
if (typeof nextNotes.summary === "string" && nextNotes.summary.trim()) notes.summary = nextNotes.summary.trim();
for (const key of NOTE_LISTS) {
  const items = (Array.isArray(nextNotes[key]) ? nextNotes[key] : []).map((item) => String(item).trim()).filter(Boolean);
  if (items.length) notes[key] = items;
}
const hasNotes = Object.keys(notes).length > 0;
const previous = history.releases.find((r) => r.version === version);
const entry = { version, date, summary };
if (hasNotes) entry.notes = notes;
else if (previous?.notes) entry.notes = previous.notes;
history.releases = [entry, ...history.releases.filter((r) => r.version !== version)];
await write(historyPath, JSON.stringify(history, null, 2) + "\n");
if (hasNotes) await write(nextNotesPath, JSON.stringify(emptyNotes, null, 2) + "\n");
else if (!entry.notes) console.warn(`[release] ${nextNotesPath} is empty: the release notes page shows only the summary of v${version}.`);

// 4. Verify: refresh lockfile, build the packages and dry-run the npm tarballs (nothing is published).
if (!skipVerify) {
  const run = (cmd) => { console.log(`> ${cmd}`); execSync(cmd, { cwd: root, stdio: "inherit" }); };
  // Windows drops optional Linux binaries from the lockfile. Keep the ones CI needs.
  const optionalSnap = dryRun ? null : snapshotOptional(await readLock(root));
  if (!dryRun) run("npm install --package-lock-only --ignore-scripts");
  if (!dryRun) {
    const lock = await readLock(root);
    const restored = restoreOptional(lock, optionalSnap);
    if (restored) await writeLock(root, lock);
    console.log(`[release] restored ${restored} optional platform package(s) in the lockfile`);
  }
  run("npm run build:packages");
  run("npm run vscode:build && npm run build -w @birdycom/omniacss-mcp");
  run("npm pack --dry-run --workspace packages/core --workspace packages/migrate --workspace packages/cli --workspace packages/mcp");
}

console.log(`${dryRun ? "[dry-run] " : ""}OmniaCSS ${current} → ${version}`);
console.log(`Commit subject: <type>: [v${version}] - ${summary}`);
