// scripts/lib/bcd-support.mjs
// Shared MDN browser-compat-data helpers: used by scripts/build-browser-support.mjs and by the docs build
// (apps/docs/src/lib/compat.mjs) to summarise support per browser for any BCD key.

import bcd from '@mdn/browser-compat-data' with { type: 'json' };

export { bcd };

// Columns of the support table: desktop first, then mobile.
export const BROWSERS = [
  { id: 'chrome', name: 'Chrome', group: 'desktop', logo: 'chrome' },
  { id: 'edge', name: 'Edge', group: 'desktop', logo: 'edge' },
  { id: 'firefox', name: 'Firefox', group: 'desktop', logo: 'firefox' },
  { id: 'safari', name: 'Safari', group: 'desktop', logo: 'safari' },
  { id: 'opera', name: 'Opera', group: 'desktop', logo: 'opera' },
  { id: 'chrome_android', name: 'Chrome Android', group: 'mobile', logo: 'chrome' },
  { id: 'firefox_android', name: 'Firefox Android', group: 'mobile', logo: 'firefox' },
  { id: 'safari_ios', name: 'Safari iOS', group: 'mobile', logo: 'safari' },
  { id: 'samsunginternet_android', name: 'Samsung Internet', group: 'mobile', logo: 'samsung' },
  { id: 'opera_android', name: 'Opera Android', group: 'mobile', logo: 'opera' },
];

const stripHtml = (s) => String(s).replace(/<[^>]+>/g, '');

export function lookup(key) {
  let node = bcd;
  for (const part of key.split('.')) {
    node = node?.[part];
    if (!node) return null;
  }
  return node.__compat ? node : null;
}

/** Reduce the BCD support statement(s) of one browser to a single state for the table. */
export function summarize(statements) {
  const list = (Array.isArray(statements) ? statements : [statements]).filter(Boolean);
  const live = list.filter((s) => !s.version_removed);
  const notes = (s) => [].concat(s.notes || []).map(stripHtml);
  const isFull = (s) => s.version_added && !s.flags && !s.prefix && !s.alternative_name && !s.partial_implementation;

  const full = live.find((s) => isFull(s) && s.version_added !== 'preview');
  if (full) {
    const partialBefore = live.find((s) => s !== full && s.version_added && s.version_added !== 'preview' && !s.flags);
    return { state: 'yes', version: full.version_added, notes: notes(full), ...(partialBefore ? { earlier: partialBefore.prefix ? `${partialBefore.prefix} since ${partialBefore.version_added}` : `partial since ${partialBefore.version_added}` } : {}) };
  }
  const partial = live.find((s) => s.version_added && s.version_added !== 'preview' && !s.flags);
  if (partial) {
    const why = partial.prefix ? `with ${partial.prefix} prefix` : partial.alternative_name ? `as ${partial.alternative_name}` : 'partial implementation';
    return { state: 'partial', version: partial.version_added, notes: [why, ...notes(partial)] };
  }
  const preview = live.find((s) => s.version_added === 'preview');
  if (preview) return { state: 'preview', version: 'preview', notes: notes(preview) };
  const flag = live.find((s) => s.version_added && s.flags);
  if (flag) {
    const f = [].concat(flag.flags)[0];
    return { state: 'flag', version: flag.version_added, notes: [`behind flag ${f?.name ?? ''}`.trim(), ...notes(flag)] };
  }
  return { state: 'no', version: null, notes: list.flatMap(notes) };
}

// Keys whose last part is not a readable CSS name (unit groups instead of functions).
const LABELS = {
  'css.types.length.viewport_percentage_units_dynamic': 'dvh / dvw (dynamic viewport units)',
  'css.types.length.viewport_percentage_units_small': 'svh / svw (small viewport units)',
  'css.types.length.viewport_percentage_units_large': 'lvh / lvw (large viewport units)',
};

export function featureLabel(key) {
  if (LABELS[key]) return LABELS[key];
  const parts = key.split('.');
  const [, kind] = parts;
  const tail = parts.slice(2);
  if (kind === 'properties') return tail.length > 1 ? `${tail[0]}: ${tail.slice(1).join(' ').replace(/_/g, '-')}` : tail[0];
  if (kind === 'at-rules') return `@${tail.join(' ')}`;
  // Types and selectors: MDN's own name ("<code>lh</code> unit", "<code>:user-valid</code>", "Relative Oklch colors").
  if (kind === 'types' || kind === 'selectors') {
    const desc = lookup(key)?.__compat?.description;
    if (desc) return desc.replace(/<\/?code>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  if (kind === 'selectors') return `::${tail.join(' ')}`.replace(/^::(hover|focus|active|has|is|where)$/, ':$1');
  if (kind === 'types') return `${tail[tail.length - 1]}()`;
  return tail.join(' ') || key;
}

/** Table entry for one BCD key (null when the key does not exist). */
export function featureEntry(key) {
  const node = lookup(key);
  if (!node) return null;
  const c = node.__compat;
  return {
    label: featureLabel(key),
    mdn: c.mdn_url ?? null,
    status: { experimental: !!c.status?.experimental, deprecated: !!c.status?.deprecated, standard: !!c.status?.standard_track },
    support: Object.fromEntries(BROWSERS.map((b) => [b.id, summarize(c.support[b.id])])),
  };
}
