// File: packages/migrate/src/preflight.mjs
// Base reset that replaces the CSS reset of a utility framework, so migrated markup renders the same.
// Uses Omnia palette tokens only. Emitted inside `@layer base`.
// Author: Serge Cools | Framework: OmniaCSS

/** @param {{ borderColor?: string }} [o] */
export function preflight(o = {}) {
  const border = o.borderColor || "currentColor";
  return `*, ::before, ::after, ::backdrop, ::file-selector-button {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0 solid;
}
html, :host {
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  tab-size: 4;
  font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji");
  -webkit-tap-highlight-color: transparent;
}
*, ::before, ::after, ::backdrop, ::file-selector-button { border-color: ${border}; }
hr { height: 0; color: inherit; border-top-width: 1px; }
abbr:where([title]) { text-decoration: underline dotted; }
h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit; }
a { color: inherit; -webkit-text-decoration: inherit; text-decoration: inherit; }
b, strong { font-weight: bolder; }
code, kbd, samp, pre { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace); font-size: 1em; }
small { font-size: 80%; }
sub, sup { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; }
sub { bottom: -0.25em; }
sup { top: -0.5em; }
table { text-indent: 0; border-color: inherit; border-collapse: collapse; }
:-moz-focusring { outline: auto; }
progress { vertical-align: baseline; }
summary { display: list-item; }
ol, ul, menu { list-style: none; }
img, svg, video, canvas, audio, iframe, embed, object { display: block; vertical-align: middle; }
img, video { max-width: 100%; height: auto; }
button, input, select, optgroup, textarea, ::file-selector-button { font: inherit; font-feature-settings: inherit; font-variation-settings: inherit; letter-spacing: inherit; color: inherit; border-radius: 0; background-color: transparent; opacity: 1; }
:where(select:is([multiple], [size])) optgroup { font-weight: bolder; }
::file-selector-button { margin-inline-end: 4px; }
::placeholder { opacity: 1; color: color-mix(in oklab, currentColor 50%, transparent); }
textarea { resize: vertical; }
::-webkit-search-decoration { -webkit-appearance: none; }
::-webkit-date-and-time-value { min-height: 1lh; text-align: inherit; }
:-moz-ui-invalid { box-shadow: none; }
button, input:where([type="button"], [type="reset"], [type="submit"]), ::file-selector-button { appearance: button; }
[hidden]:where(:not([hidden="until-found"])) { display: none !important; }
button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }
`;
}
