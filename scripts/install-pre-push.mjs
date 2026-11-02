// File: scripts/install-pre-push.mjs
// Installs a git pre-push hook that runs the same checks as the repo's GitHub Actions workflow, so a push that would
// turn a run red is refused locally (rule: never a red run on a Birdycom repo).
// Map: checks per repo kind -> hook text -> write .git/hooks/pre-push -> report
// Run: node scripts/install-pre-push.mjs                      (OmniaCSS, OmniaUI, OmniaUI Pro)
//      node scripts/install-pre-push.mjs <kit clone> [...]    (a starter kit clone, e.g. %TEMP%/kitpub/react)
// Kit clones in %TEMP%/kitpub are temporary: install the hook again after a fresh clone.

import fs from "node:fs";
import path from "node:path";

const PHP = "/c/Users/SergeCools/.config/herd/bin/php85/php.exe";

// The steps of each workflow (.github/workflows/*.yml), in order. npm ci is left out: the local node_modules is used.
const CHECKS = {
  omniacss: ["npm test", "npm run docs:check", "npm audit --omit=dev --audit-level=high"],
  omniaui: [
    "npm test",
    "npm audit --omit=dev --audit-level=high",
    "(cd packages/react && npx tsc --noEmit -p .)",
    "(cd packages/vue && npx vue-tsc --noEmit)",
    `(cd php-packages/omniaui-laravel && ${PHP} vendor/bin/phpunit)`,
    `(cd php-packages/omniaui-livewire && ${PHP} vendor/bin/phpunit)`,
  ],
  "omniaui-pro": [
    "npm test",
    "(cd packages/react && npx tsc --noEmit -p .)",
    "(cd packages/vue && npx vue-tsc --noEmit)",
    `(cd php-packages/omniaui-pro-laravel && ${PHP} vendor/bin/phpunit)`,
  ],
  // composer ci:check of the kits: npm run check (format + lint), types:check, then the PHP tests.
  kit: ["npm run check", "npm run types:check", `${PHP} artisan test --compact`],
};

const kindOf = (dir) => {
  const name = path.basename(path.resolve(dir)).toLowerCase();
  if (fs.existsSync(path.join(dir, "artisan"))) return "kit";
  if (name === "omniacss") return "omniacss";
  if (name === "omniaui") return "omniaui";
  if (name === "omniaui-pro") return "omniaui-pro";
  return null;
};

const hook = (kind) => `#!/bin/sh
# Installed by omniacss/scripts/install-pre-push.mjs (${kind}): the checks of the GitHub Actions workflow.
# A failing step refuses the push. Never skip it with --no-verify: fix the failure instead.
cd "$(git rev-parse --show-toplevel)" || exit 1
step() {
  echo "[pre-push] $1"
  sh -c "$1" > /tmp/oc-pre-push.log 2>&1 || { tail -40 /tmp/oc-pre-push.log; echo "[pre-push] FAILED: $1 (push refused)"; exit 1; }
}
${CHECKS[kind].map((c) => `step ${JSON.stringify(c)}`).join("\n")}
echo "[pre-push] all checks passed"
`;

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["D:/webdev/omniacss", "D:/webdev/omniaUI", "D:/webdev/omniaUI-pro"];

for (const dir of targets) {
  const kind = kindOf(dir);
  const hooks = path.join(dir, ".git", "hooks");
  if (!kind || !fs.existsSync(hooks)) { console.log(`[pre-push] skipped ${dir} (no git repo or unknown kind)`); continue; }
  fs.writeFileSync(path.join(hooks, "pre-push"), hook(kind), { mode: 0o755 });
  console.log(`[pre-push] ${dir}: ${kind}, ${CHECKS[kind].length} checks`);
}
