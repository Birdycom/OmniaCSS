// JavaScript
// File: public/js/colors.js
// Description: Sets text and behavior for the colors page (Omnia, HTML, RAL palettes)
// Copyright: 2021-2026 Birdycom
// Author: Serge Cools
// Version: 0.2.0
// Framework: OmniaCSS
// Purpose: colors page UI (background-color, color, colorname; rgb, rgba, hsl, hsla, #, name)

// get the list of all CSS classes in the CSS file
//import variables from '../../src/scss/variables/_variables_colors_html.scss';
//console.log(variables);
//function css_text(x) { return x.cssText; }
//let file = document.getElementById('css');
//let content = Array.prototype.map.call(file.sheet.cssRules, css_text).join('\n');

const colorSectionomnia = document.getElementById('omniacolors');
const colorSectionhtml = document.getElementById('htmlcolors');
const colorSectionral = document.getElementById('ralcolors');
const colorPaletteOmnia = document.getElementById('omniapalette');
const colorPaletteHtml = document.getElementById('htmlpalette');
const colorPaletteRal = document.getElementById('ralpalette');
let currentPalette = 'omnia';
let colorProperties = null;
const gradientSteps = Array.isArray(window.omniaPaletteSteps)
  ? window.omniaPaletteSteps
  : [2, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 'base'];
const paletteTitleSuffix = window.omniaPaletteLabel || '';

document.documentElement.style.setProperty('--oc-palette-count', String(gradientSteps.length));

setupPaletteTabs();
applyPaletteVisibility(currentPalette);

/* function to find the correct CSS class in the CSS file
* @return colorname
*/
loadColorProperties().then(() => {
  getColors('../src/scss/json/omnia-colors.json');
  getColors('../src/scss/json/html-colors.json');
  getColors('../src/scss/json/ral-colors.json');
});


function getCssVar(selector, style) {
  var element = document.querySelector(selector)
  //console.log(selector);
  // Exit if element doesn't exist
  if (!element) return 'false: element not found'

  // Exit if variable is not defined
  if (!getComputedStyle(element).getPropertyValue(style)) return 'false: variable not found'

  return getComputedStyle(element).getPropertyValue(style);
}

// remove duplicate items from a array
function uniqBy(a, key) {
  var seen = {};
  return a.filter(function (item) {
    var k = key(item);
    return seen.hasOwnProperty(k) ? false : (seen[k] = true);
  })
}

function srgbToLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toOklab(rgb) {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  };
}

function toOklch(oklab) {
  const c = Math.sqrt(oklab.a * oklab.a + oklab.b * oklab.b);
  let h = Math.atan2(oklab.b, oklab.a) * 180 / Math.PI;
  if (h < 0) {
    h += 360;
  }

  return { l: oklab.l, c, h };
}

function formatOklab(rgb) {
  const v = toOklab(rgb);
  return `${(v.l * 100).toFixed(2)}% ${v.a.toFixed(4)} ${v.b.toFixed(4)}`;
}

function formatOklch(rgb) {
  const v = toOklch(toOklab(rgb));
  return `${(v.l * 100).toFixed(2)}% ${v.c.toFixed(4)} ${v.h.toFixed(2)}deg`;
}

function getContrastClass(rgb) {
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.6 ? 'oc-text-on-light' : 'oc-text-on-dark';
}

function toClassToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadColorProperties() {
  const candidates = [
    '/data/color-properties.json'
  ];

  for (const path of candidates) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      colorProperties = await response.json();
      return;
    } catch (_error) {
      // Try next path candidate.
    }
  }

  console.warn('Could not load color-properties.json from known paths.');
}

function getColorProperties(typecolor, colorName, colorData) {
  const key = String(colorName).toLowerCase();
  const fromJson = colorProperties?.[typecolor]?.[key];
  if (fromJson) return fromJson;

  const safeHex = colorData?.hex || '';
  const safeRgb = colorData?.rgb || { r: 0, g: 0, b: 0 };
  const safeHsl = colorData?.hsl || { h: 0, s: 0, l: 0 };

  return {
    hex: safeHex,
    rgb: `${safeRgb.r} ${safeRgb.g} ${safeRgb.b}`,
    hsl: `${safeHsl.h}deg ${safeHsl.s}% ${safeHsl.l}%`,
    oklch: formatOklch(safeRgb),
    oklab: formatOklab(safeRgb),
    name_en: colorData?.name_en || '',
    name_nl: colorData?.name_nl || ''
  };
}

function toCardTooltip(typecolor, colorName, colorData) {
  const props = getColorProperties(typecolor, colorName, colorData);
  const lines = [
    `${colorName}`,
    `HEX: ${props.hex}`,
    `RGB: ${props.rgb}`,
    `HSL: ${props.hsl}`,
    `OKLCH: ${props.oklch}`,
    `OKLAB: ${props.oklab}`
  ];

  if (typecolor === 'ralcolors') {
    if (props.name_en) lines.push(`EN: ${String(props.name_en).replace(/_/g, ' ')}`);
    if (props.name_nl) lines.push(`NL: ${String(props.name_nl).replace(/_/g, ' ')}`);
  }

  return lines.join('\n');
}

function flattenColorEntries(data, maxEntries = null) {
  const entries = [];

  Object.entries(data).forEach((maincolor) => {
    Object.entries(maincolor[1]).forEach((color) => {
      entries.push({
        name: color[0],
        rgb: color[1].rgb
      });
    });
  });

  return maxEntries ? entries.slice(0, maxEntries) : entries;
}

function renderPalette(container, title, entries, paletteType, isLimited = false) {
  if (!container) return;

  const isBaseOnlyPalette = paletteType === 'ralcolors';
  const header = isBaseOnlyPalette
    ? '<div class="oc-step">base</div>'
    : gradientSteps.map((step) => `<div class="oc-step">${step}</div>`).join('');
  let rows = '';

  entries.forEach((entry) => {
    const colorToken = toClassToken(entry.name);
    const shades = isBaseOnlyPalette
      ? (() => {
          const shadeClass = `bg-${colorToken}`;
          const baseTooltip = ` title="${escapeAttr(toCardTooltip(paletteType, entry.name, { rgb: entry.rgb }))}" tabindex="0"`;
          return `<div class="oc-palette-swatch oc-palette-swatch--has-tooltip ${shadeClass}"${baseTooltip}></div>`;
        })()
      : gradientSteps
          .map((step) => {
            const suffix = step === 'base' ? '' : `-${step}`;
            const shadeClass = `bg-${colorToken}${suffix}`;
            const hasTooltip = step === 'base';
            // OmniaUI tooltip with a title (the color name) and the values of the rendered color, built on first
            // hover or focus (oc-swatch-tooltip.js). Only the base swatch is focusable: 408 tab stops would be too many.
            const label = hasTooltip ? entry.name : `${entry.name} ${step}`;
            const tip = ` data-shade="${escapeAttr(label)}"${hasTooltip ? ' tabindex="0"' : ''}`;
            const tooltipClass = hasTooltip ? ' oc-palette-swatch--has-tooltip' : '';
            return `<div class="oc-palette-swatch oc-tooltip${tooltipClass} ${shadeClass}"${tip}></div>`;
          })
          .join('');

    rows += `
      <div class="oc-palette-row${isBaseOnlyPalette ? ' oc-palette-row--base' : ''}">
        <div class="oc-palette-name">${entry.name}</div>
        ${shades}
      </div>
    `;
  });

  container.innerHTML = `
    <div class="oc-palette-block">
      <h4>${title}${isLimited ? ' (preview)' : ''}</h4>
      <div class="oc-palette-scale${isBaseOnlyPalette ? ' oc-palette-scale--base' : ''}">
        <div></div>
        ${header}
      </div>
      ${rows}
    </div>
  `;
  // Swatches get their tooltip on first hover or focus (public/js/oc-swatch-tooltip.js).
  if (!isBaseOnlyPalette) window.ocSwatchTooltip?.attach(container);
}

function formatGroupTitle(label) {
  return String(label).replace(/_/g, ' ');
}

function renderRalGroups(container, ralGroups) {
  if (!container) return;

  let output = '<div class="oc-palette-block"><h4>RAL groups (base colors)</h4>';

  Object.entries(ralGroups).forEach(([groupName, colors]) => {
    output += `
      <section class="ocd-swatch-group">
        <h3 class="ocd-swatch-group-title">${formatGroupTitle(groupName)}</h3>
        <div class="oc-color-grid">
          <article class="ocd-swatch ocd-ral-group-card">
            <div class="ocd-swatch-meta">
              <strong>${formatGroupTitle(groupName)}</strong>
              <div>Colors in this group: ${Object.keys(colors).length}</div>
            </div>
          </article>
    `;

    Object.entries(colors).forEach(([ralNumber, colorData]) => {
      const tooltip = escapeAttr(toCardTooltip('ralcolors', ralNumber, colorData));
      const niceName = String(colorData.name_en || '').replace(/_/g, ' ');
      const colorProps = getColorProperties('ralcolors', ralNumber, colorData);

      output += `
        <article class="ocd-swatch" title="${tooltip}" tabindex="0">
          <div class="ocd-swatch-color" style="background: ${colorProps.hex};"></div>
          <div class="ocd-swatch-meta">
            <strong>${ralNumber.toUpperCase()}</strong>
            <div>${niceName}</div>
            <p>HEX: ${colorProps.hex}</p>
            <p>OKLCH: ${colorProps.oklch}</p>
          </div>
        </article>
      `;
    });

    output += `
        </div>
      </section>
    `;
  });

  output += '</div>';
  container.innerHTML = output;
}

function setupPaletteTabs() {
  const tabs = document.querySelectorAll('[data-palette]');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextPalette = tab.getAttribute('data-palette') || 'omnia';
      applyPaletteVisibility(nextPalette);
    });
  });
}

function applyPaletteVisibility(palette) {
  currentPalette = palette;

  const tabs = document.querySelectorAll('[data-palette]');
  tabs.forEach((tab) => {
    const tabPalette = tab.getAttribute('data-palette');
    tab.classList.toggle('is-active', tabPalette === palette);
  });

  const colorPanels = document.querySelectorAll('[data-palette-panel]');
  colorPanels.forEach((panel) => {
    const panelPalette = panel.getAttribute('data-palette-panel');
    panel.classList.toggle('oc-hidden', panelPalette !== palette);
  });

  const paletteSections = document.querySelectorAll('[data-palette-section]');
  paletteSections.forEach((section) => {
    const sectionPalette = section.getAttribute('data-palette-section');
    section.classList.toggle('oc-hidden', sectionPalette !== palette);
  });
}

async function getColors(jsonFile) {

  const pathCandidates = [jsonFile];
  if (jsonFile.startsWith('../src/scss/json/')) {
    pathCandidates.push(jsonFile.replace('../src/scss/json/', '../public/data/'));
    pathCandidates.push(jsonFile.replace('../src/scss/json/', '../data/'));
    pathCandidates.push(jsonFile.replace('../src/scss/json/', '/public/data/'));
    pathCandidates.push(jsonFile.replace('../src/scss/json/', '/data/'));
  }

  let data = null;
  for (const path of pathCandidates) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      data = await response.json();
      break;
    } catch (_error) {
      // Try next path candidate.
    }
  }

  if (!data) {
    console.warn(`Could not load JSON data for ${jsonFile}`);
    return;
  }

  switch (Object.keys(data)[0]) {

    case 'htmlcolors':

      renderPalette(colorPaletteHtml, `HTML palette${paletteTitleSuffix ? ` - ${paletteTitleSuffix}` : ''}`, flattenColorEntries(data.htmlcolors), 'htmlcolors');

      break;
    case 'ralcolors':

      renderRalGroups(colorPaletteRal, data.ralcolors);

      break;
    default:

      renderPalette(colorPaletteOmnia, `Omnia palette${paletteTitleSuffix ? ` - ${paletteTitleSuffix}` : ''}`, flattenColorEntries(data.omniacolors), 'omniacolors');

      break;

  }



}

function createColors(data, typecolor) {

  let coloroutput = "";
  let mainColorGroup = 0;

  Object.entries(data).map(function (maincolor) { // make the sub groups

    mainColorGroup = Object.entries(data).length;

    coloroutput += `
    
    <div class="oc-color-group mb-1">
    <h2>${(maincolor[0].replace('_', ' ')).replace('_', ' ')}</h2>
    <div class="oc-color-grid">
      `;

    Object.entries(maincolor[1]).map(function (color) { // make the colors
      const textClass = getContrastClass(color[1].rgb);
      const tooltipText = escapeAttr(toCardTooltip(typecolor, color[0], color[1]));

      coloroutput += `
   
       <div class="bg-${color[0].toLowerCase()} oc-color-card p-0.5 ${textClass}" title="${tooltipText}" tabindex="0">

        <h4 data-name="${color[0].toLowerCase()}-name"> ${color[0]}</h4>`
      if (typecolor == 'ralcolors') {
        coloroutput += `<h4 data-name="${color[0].toLowerCase()
          }-name"> ${color[1].name_en.replace('_', ' ').replace('_', ' ')
          }</h4>`
      }
      coloroutput += `
        <p class="txt-0.8">Hover/focus for HEX, RGB, HSL, OKLCH, OKLAB</p>

       </div>
       `
    }).join('');

    coloroutput += `</div></div>`

    return coloroutput;

  }).join('');

  switch (typecolor) {
    case 'htmlcolors':

      colorSectionhtml.innerHTML = `<h2>HTML COLORS</h2><p class="txt-0.8">Tooltip models: HEX, RGB, HSL, OKLCH, OKLAB</p>` + coloroutput;
      applyPaletteVisibility(currentPalette);
      break;

    case 'ralcolors':

      colorSectionral.innerHTML = `<h2>RAL COLORS</h2><p class="txt-0.8">Tooltip models: HEX, RGB, HSL, OKLCH, OKLAB</p>` + coloroutput;
      applyPaletteVisibility(currentPalette);
      break;

    default:

      colorSectionomnia.innerHTML = `<h2>OMNIA COLORS</h2><p class="txt-0.8">Tooltip models: HEX, RGB, HSL, OKLCH, OKLAB</p>` + coloroutput;
      applyPaletteVisibility(currentPalette);
      break;
  }
}