// public/js/oc-swatch-tooltip.js
// Color values (HEX, RGB, HSL, OKLCH, OKLAB) in the OmniaUI tooltip of palette swatches: a .oc-tooltip__content
// with the color name as .oc-tooltip__title (larger, capital first letter) and the values under it.
// Used by the color playground (pages/colors.html, js/colors.js) and docs/colors/palettes.html.
// Map: rendered background -> sRGB via a 1x1 canvas -> lines -> .oc-tooltip__content inside the swatch
// A swatch with data-shade="Red 20" (and class oc-tooltip) gets its content on first hover or focus.
// Classic script (no module): every <script src> gets a cache-busting hash, an import inside a module would not.

(function () {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  const toLinear = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));

  function oklabOf({ r, g, b }) {
    const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return {
      l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    };
  }

  function hslOf({ r, g, b }) {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return `0deg 0% ${Math.round(l * 100)}%`;
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    return `${Math.round((h * 60 + 360) % 360)}deg ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }

  /** The values of the color a swatch shows, one per line. */
  function values(swatch) {
    const css = getComputedStyle(swatch).backgroundColor;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    const rgb = { r, g, b };
    const hex = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();

    // Omnia colors are defined in OKLCH: show that exact value (and OKLAB from it, a = C·cos h, b = C·sin h)
    // instead of one rounded through sRGB. HEX/RGB/HSL are the sRGB-mapped color.
    const lab = oklabOf(rgb);
    let oklch = `${(lab.l * 100).toFixed(2)}% ${Math.hypot(lab.a, lab.b).toFixed(4)} ${((Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360).toFixed(2)}deg`;
    let oklab = `${(lab.l * 100).toFixed(2)}% ${lab.a.toFixed(4)} ${lab.b.toFixed(4)}`;
    const exact = css.match(/^oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)/);
    if (exact) {
      const l = exact[2] ? Number(exact[1]) : Number(exact[1]) * 100;
      const c = Number(exact[3]);
      const h = Number(exact[4]);
      oklch = `${l.toFixed(2)}% ${c.toFixed(4)} ${h.toFixed(2)}deg`;
      oklab = `${l.toFixed(2)}% ${(c * Math.cos(h * Math.PI / 180)).toFixed(4)} ${(c * Math.sin(h * Math.PI / 180)).toFixed(4)}`;
    }

    const lines = [`HEX: ${hex}`, `RGB: ${r} ${g} ${b}`, `HSL: ${hslOf(rgb)}`, `OKLCH: ${oklch}`, `OKLAB: ${oklab}`];
    if (a < 255) lines.push(`Alpha: ${Math.round(a / 2.55)}%`);
    return lines.join('\n');
  }

  function fill(swatch) {
    if (swatch.querySelector('.oc-tooltip__content')) return;
    const content = document.createElement('span');
    content.className = 'oc-tooltip__content';
    content.setAttribute('role', 'tooltip');
    const title = document.createElement('span');
    title.className = 'oc-tooltip__title';
    title.textContent = swatch.dataset.shade;
    content.append(title, values(swatch));
    swatch.append(content);
  }

  /** Give every [data-shade] swatch inside `container` its tooltip content on first hover or focus. */
  function attach(container) {
    if (!container || container.dataset.swatchTooltips) return;
    container.dataset.swatchTooltips = 'on';
    const onEvent = (event) => {
      const swatch = event.target.closest?.('[data-shade]');
      if (swatch) fill(swatch);
    };
    container.addEventListener('pointerover', onEvent);
    container.addEventListener('focusin', onEvent);
  }

  window.ocSwatchTooltip = { values, attach };
})();
