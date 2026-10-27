// scripts/build-color-properties.mjs
// map: read source json -> compute oklab/oklch -> write public/data/color-properties.json
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

function srgbToLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
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
  if (h < 0) h += 360;
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

function toPropertyRecord(color) {
  return {
    hex: color.hex,
    rgb: `${color.rgb.r} ${color.rgb.g} ${color.rgb.b}`,
    hsl: `${color.hsl.h}deg ${color.hsl.s}% ${color.hsl.l}%`,
    oklch: formatOklch(color.rgb),
    oklab: formatOklab(color.rgb),
    name_en: color.name_en || '',
    name_nl: color.name_nl || ''
  };
}

function flattenData(sourceRoot) {
  const output = {};

  Object.values(sourceRoot).forEach((group) => {
    Object.entries(group).forEach(([name, color]) => {
      output[name.toLowerCase()] = toPropertyRecord(color);
    });
  });

  return output;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const omnia = await readJson(path.join(root, 'src/scss/json/omnia-colors.json'));
  const html = await readJson(path.join(root, 'src/scss/json/html-colors.json'));
  const ral = await readJson(path.join(root, 'src/scss/json/ral-colors.json'));

  const payload = {
    omniacolors: flattenData(omnia.omniacolors),
    htmlcolors: flattenData(html.htmlcolors),
    ralcolors: flattenData(ral.ralcolors)
  };

  const outputPath = path.join(root, 'public/data/color-properties.json');
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Generated ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
