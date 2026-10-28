// scripts/deploy.mjs
// Uploads the built docs site (public/) to the live server over SFTP (SSH key) or FTPS. Only changed files go up:
// a local manifest (.deploy-manifest.json, git-ignored) remembers the hash of every uploaded file.
// Flags: --dry-run (list what would change, upload nothing), --full (ignore the manifest, upload everything).
// Usage: "npm run docs:build" first when the content changed, then "npm run deploy [-- --dry-run]".
// Map: read .env -> collect files (public/ + color JSON) -> rewrite local .test URLs -> diff manifest -> upload (sftp | ftps)
//
// .env (never committed):
//   DEPLOY_HOST=<server hostname>   DEPLOY_USER=…   DEPLOY_PATH=/home/<user>/public_html
//   SFTP (used when the key file exists): DEPLOY_PORT=4000   DEPLOY_KEY=~/.ssh/omniacss_deploy (default)
//   FTPS (fallback, or DEPLOY_PROTOCOL=ftps): DEPLOY_PASS=…
//   DEPLOY_SITE_URL=https://omniacss.eu  DEPLOY_OMNIAUI_URL=https://omniaui.eu   (optional, these are the defaults)

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import tls from "node:tls";
import { Client } from "basic-ftp";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const manifestFile = path.join(root, ".deploy-manifest.json");

/** KEY=value lines; the value is taken literally (passwords may contain any character). */
async function readEnv(file) {
  const env = {};
  for (const line of (await fs.readFile(file, "utf8")).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/i);
    if (m) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

const env = await readEnv(path.join(root, ".env")).catch(() => ({}));
const sshKey = (env.DEPLOY_KEY || "~/.ssh/omniacss_deploy").replace(/^~/, os.homedir());
const useSftp = env.DEPLOY_PROTOCOL !== "ftps" && (await fs.stat(sshKey).then(() => true, () => false));
for (const key of ["DEPLOY_HOST", "DEPLOY_USER", ...(useSftp ? [] : ["DEPLOY_PASS"])]) {
  if (!env[key]) throw new Error(`${key} is missing in .env`);
}
// Accept the cPanel address too ("https://host:2083"). SFTP starts in the home folder, FTP is chrooted to it.
const host = env.DEPLOY_HOST.replace(/^\w+:\/\//, "").replace(/[:/].*$/, "");
const homePath = env.DEPLOY_PATH || "public_html";
const remoteRoot = useSftp ? homePath : homePath.replace(/^\/home\/[^/]+/, "") || "/";
const siteUrl = env.DEPLOY_SITE_URL || "https://omniacss.eu";
const omniauiUrl = env.DEPLOY_OMNIAUI_URL || "https://omniaui.eu";

// Local-only files: source maps (29 MB, devtools only) and the Herd router (Apache uses .htaccess below).
const SKIP = [/\.map$/, /^index\.php$/];
const TEXT = /\.(html|js|json|css|xml|txt|svg)$/;

async function collect() {
  const files = new Map(); // remote path -> local path
  for await (const rel of fs.glob("**/*", { cwd: path.join(root, "public") })) {
    const local = path.join(root, "public", rel);
    if (!(await fs.stat(local)).isFile()) continue;
    const posix = rel.split(path.sep).join("/");
    if (!SKIP.some((re) => re.test(posix))) files.set(posix, local);
  }
  // The palette playground (js/colors.js) loads /src/scss/json/*.json; on Herd index.php serves them.
  for await (const rel of fs.glob("*.json", { cwd: path.join(root, "src/scss/json") })) {
    files.set(`src/scss/json/${rel}`, path.join(root, "src/scss/json", rel));
  }
  return files;
}

// Search engines: every page gets a canonical URL (a folder's index.html is the folder itself), robots.txt points
// at sitemap.xml, and sitemap.xml lists all pages. Not listed: redirects and Google Search Console verification files.
const NOT_A_PAGE = [/(^|\/)google[0-9a-f]+\.html$/];
const isPage = (remote) => remote.endsWith(".html") && !NOT_A_PAGE.some((re) => re.test(remote));
// The address of a page: no .html (clean URLs), a folder's index.html is the folder itself.
const pageUrl = (remote) => `${siteUrl}/${remote.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "")}`;
function withCanonical(remote, text) {
  if (!isPage(remote) || /rel="canonical"/.test(text)) return text;
  return text.replace("</head>", `<link rel="canonical" href="${pageUrl(remote)}">\n</head>`);
}
async function seoFiles(files) {
  const urls = [];
  for (const [remote, local] of [...files].filter(([remote]) => isPage(remote)).sort()) {
    if (/http-equiv="refresh"/i.test(await fs.readFile(local, "utf8"))) continue; // redirect from an old URL
    const lastmod = (await fs.stat(local)).mtime.toISOString().slice(0, 10);
    urls.push(`  <url><loc>${pageUrl(remote)}</loc><lastmod>${lastmod}</lastmod></url>`);
  }
  return new Map([
    ["robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`],
    ["sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`],
  ]);
}

/** The local build links to the Herd hosts (omniacss.test, omniaui.test); the live site uses the real domains. */
async function contentOf(remote, local) {
  const buf = await fs.readFile(local);
  if (!TEXT.test(remote)) return buf;
  let text = buf.toString("utf8").replaceAll("https://omniaui.test", omniauiUrl).replaceAll("https://omniacss.test", siteUrl);
  // The full builds (omnia_main*.css, used by the color pages) import Google Fonts for package users; the live
  // site serves the same fonts itself (scripts/self-host-fonts.mjs), so no visitor IP goes to Google.
  if (remote.endsWith(".css")) text = text.replace(/@import url\(["']https:\/\/fonts\.googleapis\.com\/[^)]*\);?/g, '@import url("oc-google-fonts.css");');
  if (/\.(css|html)$/.test(remote) && /fonts\.(googleapis|gstatic)\.com/.test(text)) throw new Error(`${remote} still loads Google Fonts`);
  return Buffer.from(withCanonical(remote, text));
}

const htaccess = `# Generated by scripts/deploy.mjs — changes here are overwritten on the next deploy.
DirectoryIndex index.html
Options -Indexes
AddType application/manifest+json .webmanifest
AddType image/x-icon .ico

RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]
# Components, blocks and webicons moved to the OmniaUI site (October 2026).
RewriteRule ^ui/(.*)$ ${omniauiUrl}/ui/$1 [L,R=301]
# Clean URLs (scripts/clean-urls.mjs): an old .html address redirects to the address without it
# (/docs/index.html -> /docs/), and the address without .html serves the file. google*.html keeps its name.
RewriteCond %{THE_REQUEST} \\s/+((?:[^\\s?]*/)?)index\\.html[\\s?] [NC]
RewriteRule ^ /%1 [L,R=301]
RewriteCond %{REQUEST_URI} !/google[0-9a-f]+\\.html$
RewriteCond %{THE_REQUEST} \\s/+([^\\s?]+)\\.html[\\s?] [NC]
RewriteRule ^ /%1 [L,R=301]
# A page wins over a folder of the same name (ui/components.html next to ui/components/, which has no index.html):
# "/ui/components/" redirects to "/ui/components" (so relative links on the page resolve from /ui/), which serves the page.
RewriteCond %{DOCUMENT_ROOT}/$1.html -f
RewriteCond %{DOCUMENT_ROOT}/$1/index.html !-f
RewriteRule ^(.+)/$ /$1 [L,R=301]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{DOCUMENT_ROOT}/$1.html -f
RewriteRule ^(.+)$ $1.html [L]

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml font/ttf
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 0 seconds"
  # CSS and JS URLs carry a content hash (?v=…), see scripts/cache-bust-assets.mjs.
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType font/ttf "access plus 1 year"
  ExpiresByType image/webp "access plus 1 month"
</IfModule>
`;

const files = await collect();
const uploads = [];
const manifest = args.has("--full") ? {} : JSON.parse(await fs.readFile(manifestFile, "utf8").catch(() => "{}"));
const next = {};
// Generated files; a file of the same name in public/ wins.
const generated = new Map([[".htaccess", htaccess], ...[...(await seoFiles(files))].filter(([name]) => !files.has(name))]);
for (const [remote, local] of [...files, ...[...generated.keys()].map((name) => [name, null])]) {
  const body = local ? await contentOf(remote, local) : Buffer.from(generated.get(remote));
  const hash = crypto.createHash("sha1").update(body).digest("hex");
  next[remote] = hash;
  if (manifest[remote] !== hash) uploads.push([remote, body]);
}
const bytes = uploads.reduce((n, [, body]) => n + body.length, 0);
console.log(`[deploy] ${files.size + generated.size} files, ${uploads.length} changed (${(bytes / 1024 / 1024).toFixed(1)} MB) → ${useSftp ? "sftp" : "ftps"} ${host}:${remoteRoot}`);
if (dryRun || !uploads.length) {
  for (const [remote] of uploads) console.log(`  ${remote}`);
  process.exit(0);
}

/**
 * SFTP with the system OpenSSH client (Windows and Git Bash ship it): write the changed files to a staging folder,
 * then one batch session creates the folders ("-" ignores "already exists") and uploads them.
 */
async function uploadSftp() {
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), "omniacss-deploy-"));
  const quote = (p) => `"${p.replaceAll("\\", "/")}"`;
  const dirs = new Set();
  const puts = [];
  for (const [remote, body] of uploads) {
    const local = path.join(stage, remote);
    await fs.mkdir(path.dirname(local), { recursive: true });
    await fs.writeFile(local, body);
    for (let d = path.posix.dirname(remote); d !== "."; d = path.posix.dirname(d)) dirs.add(d);
    puts.push(`put ${quote(local)} ${quote(path.posix.join(remoteRoot, remote))}`);
  }
  const mkdirs = [...dirs].sort((a, b) => a.length - b.length).map((d) => `-mkdir ${quote(path.posix.join(remoteRoot, d))}`);
  const batch = path.join(stage, "batch.txt");
  await fs.writeFile(batch, [...mkdirs, ...puts].join("\n") + "\n");
  try {
    const sftp = spawnSync("sftp", ["-b", batch, "-i", sshKey, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-P", env.DEPLOY_PORT || "22", `${env.DEPLOY_USER}@${host}`], { encoding: "utf8" });
    // "mkdir … Failure" only means the folder exists already.
    const errors = sftp.stderr.split(/\r?\n/).filter((l) => l.trim() && !/^remote mkdir .*: Failure$/.test(l));
    if (sftp.status !== 0 || errors.length) throw new Error(`sftp failed (exit ${sftp.status}):\n${errors.join("\n")}`);
    Object.assign(manifest, next);
    console.log(`[deploy] done: ${siteUrl}`);
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 1) + "\n");
  }
}

if (useSftp) {
  await uploadSftp();
  process.exit(0);
}

/**
 * The FTP server sends only its own certificate, without the Let's Encrypt intermediate. Read the issuer URL from
 * that certificate (probe connection, no login) and add the intermediate: the chain is still verified up to the
 * trusted root, so nothing is skipped.
 */
async function trustedCa() {
  const probe = new Client(30_000);
  try {
    await probe.connect(host);
    await probe.useTLS({ host, rejectUnauthorized: false });
    const ca = [...tls.rootCertificates];
    const roots = new Set(ca.map((pem) => new crypto.X509Certificate(pem).subject));
    // Follow the issuer links up to a root Node knows (newer Let's Encrypt roots are cross-signed by ISRG Root X1/X2).
    let issuerUrl = probe.ftp.socket.getPeerCertificate().infoAccess?.["CA Issuers - URI"]?.[0];
    for (let depth = 0; issuerUrl && depth < 4; depth++) {
      const cert = new crypto.X509Certificate(Buffer.from(await (await fetch(issuerUrl)).arrayBuffer()));
      ca.push(cert.toString());
      if (roots.has(cert.issuer)) break;
      issuerUrl = cert.infoAccess?.match(/CA Issuers - URI:(\S+)/)?.[1];
    }
    return ca;
  } finally {
    probe.close();
  }
}

const ca = await trustedCa();
const connect = async () => {
  const client = new Client(60_000);
  client.ftp.verbose = !!process.env.DEPLOY_VERBOSE;
  await client.access({ host, user: env.DEPLOY_USER, password: env.DEPLOY_PASS, secure: true, secureOptions: { ca } });
  return client;
};

// The server drops long sessions now and then: reconnect and retry the file (a few times per file).
let client = await connect();
let done = 0;
try {
  for (const [remote, body] of uploads) {
    for (let attempt = 1; ; attempt++) {
      try {
        await client.ensureDir(path.posix.join(remoteRoot, path.posix.dirname(remote)));
        await client.uploadFrom(Readable.from(body), path.posix.basename(remote));
        break;
      } catch (err) {
        if (attempt === 4) throw err;
        console.log(`[deploy] ${remote}: ${err.message} — reconnecting (${attempt}/3)`);
        client.close();
        client = await connect();
      }
    }
    manifest[remote] = next[remote];
    if (++done % 25 === 0) console.log(`[deploy] ${done}/${uploads.length}`);
  }
  console.log(`[deploy] done: ${siteUrl}`);
} finally {
  client.close();
  // Save progress even after a failure, so the next run continues where this one stopped.
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 1) + "\n");
}
