#!/usr/bin/env node
/**
 * Split borders_full.html into borders/*.html section files.
 * Run from repo root: node scripts/split-borders-docs.js
 * Reads public/docs/borders_full.html, writes public/docs/borders/*.html (except index)
 * with correct ../../ paths and Source & Further reading links.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public/docs/borders_full.html');
const outDir = path.join(root, 'public/docs/borders');

const sections = [
  { name: 'width', start: '<!-- BORDERS & WIDTH', endId: 'borders-style', title: 'Border-width' },
  { name: 'style', start: '<!-- BORDERS & STYLE', endId: 'borders-color', title: 'Border-style' },
  { name: 'color', start: '<!-- BORDERS & COLOR', endId: 'outline-width', title: 'Border-color' },
  { name: 'outline-width', start: '<!-- OUTLINE WIDTH', endId: 'outline-style', title: 'Outline-width' },
  { name: 'outline-style', start: '<!-- OUTLINE STYLE', endId: 'outline-color', title: 'Outline-style' },
  { name: 'outline-color', start: '<!-- OUTLINE COLOR', endId: 'outline-offset', title: 'Outline-color' },
  { name: 'outline-offset', start: '<!-- OUTLINE OFFSET', endId: 'outline-focus-ring', title: 'Outline-offset' },
  { name: 'outline-focus-ring', start: 'id="outline-focus-ring"', endId: 'corner-shape', title: 'Outline (focus ring)' },
  { name: 'corner-shape', start: '<!-- CORNER SHAPE', endId: 'source', title: 'Corner shape' },
];

const shellStart = `<!--
  File: public/docs/borders/{{name}}.html
  Description: {{title}} — borders/outline utilities
  Copyright: 2021-2026 Birdycom
  Framework: OmniaCSS
-->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OmniaCSS Docs - {{title}}</title>
  <link rel="stylesheet" href="../../css/oc-layout-module.css">
  <link rel="stylesheet" href="../../css/omnia_main.css">
  <link rel="stylesheet" href="../../css/oc-components.css">
  <link rel="stylesheet" href="../../css/oc-code-syntax.css">
  <link rel="stylesheet" href="../../css/oc-docs-shell.css">
</head>
<body data-ocm-mode="docs" data-ocm-root="../../../" data-ocm-active="docs-new" data-oc-docs-page="borders">
  <div data-ocm-header-slot></div>
  <div class="oc-docs-shell oc-docs-shell--no-right">
    <aside class="oc-docs-sidebar-left" data-oc-docs-left-slot></aside>
    <main class="oc-docs-content">

`;

const shellEnd = `
    </main>
    <aside class="oc-docs-sidebar-right" data-oc-docs-right-slot></aside>
  </div>
  <div data-ocm-footer-slot></div>
  <script src="../../js/oc-layout-module.js"></script>
  <script src="../../js/oc-docs-nav-module.js"></script>
  <script src="../../js/oc-docs-highlight.js"></script>
  <script src="../../js/oc-components.js"></script>
</body>
</html>
`;

let html = fs.readFileSync(src, 'utf8');

function extractSection(content, startMark, endId) {
  const startIdx = content.indexOf(startMark);
  if (startIdx === -1) return null;
  const sectionStart = content.indexOf('<section', startIdx);
  if (sectionStart === -1) return null;
  const nextSectionStart = content.indexOf(`<section class="oc-docs-section" id="${endId}"`, sectionStart + 1);
  const end = nextSectionStart === -1 ? content.length : nextSectionStart;
  const chunk = content.substring(sectionStart, end);
  const lastClose = chunk.lastIndexOf('</section>');
  return lastClose === -1 ? chunk : chunk.substring(0, lastClose + '</section>'.length);
}

function fixFooterLinks(block) {
  return block
    .replace(/<h2 class="oc-section-footer__title">Reference — [^<]+<\/h2>/, '<h2 class="oc-section-footer__title" id="source">Source &amp; Further Reading</h2>')
    .replace(/href="colors\.html"/g, 'href="../colors.html"')
    .replace(/href="borders\.html#([^"]+)"/g, (_, id) => {
      const map = { 'borders-radius': 'radius.html', 'borders-width': 'width.html', 'corner-shape': 'corner-shape.html' };
      return `href="${map[id] || id + '.html'}"`;
    })
    .replace(/Gerelateerde pagina's/g, 'Related pages')
    .replace(/SCSS-bron \(/g, 'SCSS source (');
}

sections.forEach(({ name, start, endId, title }) => {
  const sectionHtml = extractSection(html, start, endId);
  if (!sectionHtml) {
    console.warn('Section not found:', name);
    return;
  }
  const withFooter = fixFooterLinks(sectionHtml);
  const full = shellStart.replace(/\{\{name\}\}/g, name).replace(/\{\{title\}\}/g, title)
    + withFooter
    + shellEnd;
  const outPath = path.join(outDir, name + '.html');
  fs.writeFileSync(outPath, full, 'utf8');
  console.log('Wrote', outPath);
});

console.log('Done.');
