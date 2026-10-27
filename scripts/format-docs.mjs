import fs from 'fs';
import path from 'path';

const files = [
  'configuration.html',
  'fluid.html',
  'responsive.html',
  'utilities.html',
  'layout-module.html',
  'code-syntax-theme.html',
  'code-syntax.html'
];
const root = 'd:\\webdev\\omniacss\\public\\docs';

files.forEach(fileName => {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`File missing: ${fileName}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Fix Hero block
  content = content.replace(/<section class="oc-docs-hero"([^>]*)>\s*<h1[^>]*>(.*?)<\/h1>\s*<p(?: class="desc")?>(.*?)<\/p>/gs, 
    '<section class="oc-hero" id="overview">\n        <h1 class="oc-hero-title">$2</h1>\n        <p class="oc-hero-text">$3</p>');

  content = content.replace(/<section class="oc-hero">/g, '<section class="oc-hero" id="overview">');

  // 2. Wrap Sections
  content = content.replace(/<section class="oc-docs-section"([^>]*)>(.*?)<\/section>/gs, (match, attrs, inner) => {
    
    let h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/;
    let h2Match = inner.match(h2Regex);
    if (!h2Match || inner.includes('oc-section-header')) {
      return match;
    }

    let h2Content = h2Match[1];
    let afterH2 = inner.substring(h2Match.index + h2Match[0].length);
    
    // Replace old badge classes
    h2Content = h2Content.replace(/class="badge-version"/g, 'class="oc-section-header__badge-version oc-badge-version"');
    h2Content = h2Content.replace(/class="badge"/g, 'class="oc-section-header__badge-version oc-badge-version"');

    let pContent = '';
    let rest = afterH2;

    // Strict <p> tag match
    let pMatch = afterH2.match(/^\s*<p(?: [^>]*)?>([\s\S]*?)<\/p>/);
    if (pMatch) {
      pContent = pMatch[0].replace(/<p(?: [^>]*)?>/, '<p class="oc-section-header__desc">');
      rest = afterH2.substring(pMatch[0].length);
    }

    rest = rest.trim();

    // Handle tables
    rest = rest.replace(/<table class="ref-table">/g, '<div class="oc-expandable-table">\n            <table class="oc-table-ref">');
    rest = rest.replace(/<\/table>/g, '</table>\n          </div>');

    // Handle pre code blocks
    rest = rest.replace(/<pre><code>/g, '<div class="oc-code-block mt-1">\n          <pre class="code-preview">\n            <code>');
    rest = rest.replace(/<\/code><\/pre>/g, '</code>\n          </pre>\n        </div>');
    rest = rest.replace(/<pre[^>]*><code[^>]*>/g, '<div class="oc-code-block mt-1">\n          <pre class="code-preview">\n            <code>');

    // Handle preview wrapped
    rest = rest.replace(/<div class="preview">/g, '<div class="flex flex-column border border-solid border-stormblue-100 bg-shallowblue-mix-30 round-3 p-2 mb-2">\n          <h4 class="oc-preview__title">Demo</h4>\n          <div class="oc-preview flex-column gap-2 mb-2">');

    // Add oc-section-content title to h3 tags
    rest = rest.replace(/<h3[^>]*>(.*?)<\/h3>/g, '<h3 class="oc-section-content__title">$1</h3>');

    return `<section class="oc-docs-section"${attrs}>
        <div class="oc-section-header">
          <h2 class="oc-section-header__title">${h2Content}</h2>
          ${pContent}
        </div>
        <div class="oc-section-content">
          ${rest}
        </div>
      </section>`;
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Formatted ${fileName}`);
});
