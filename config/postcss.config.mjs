import postcss from "postcss";
import postcssImport from "postcss-import";
import postcssPresetEnv from "postcss-preset-env";
import cssnanoPlugin from "cssnano";
import autoprefixer from "autoprefixer";

/** Remove duplicate @supports (color: oklab(...)) block added by preset-env's oklab-function plugin.
 *  We only use oklch and emit one @supports (color: oklch(...)) in _colors_tokens.scss. */
function removeOklabSupports() {
  return {
    postcssPlugin: "remove-oklab-supports",
    OnceExit(root) {
      root.walkAtRules("supports", (atRule) => {
        const params = atRule.params || "";
        if (/color:\s*oklab\s*\(/i.test(params)) {
          atRule.remove();
        }
      });
    },
  };
}
removeOklabSupports.postcss = true;

/** Remove fallback added by preset-env for var(--spacing): keep only calc(var(--spacing) * n), drop calc(1rem * n). */
function removeSpacingVarFallback() {
  return {
    postcssPlugin: "remove-spacing-var-fallback",
    OnceExit(root) {
      root.walkRules((rule) => {
        const decls = rule.nodes.filter((n) => n.type === "decl");
        decls.forEach((decl) => {
          const val = decl.value || "";
          const matchRem = val.match(/^calc\(\s*1rem\s*\*\s*(\d+)\s*\)$/i);
          if (!matchRem) return;
          const n = matchRem[1];
          const hasVar = decls.some(
            (d) => d !== decl && d.prop === decl.prop && d.value === `calc(var(--spacing) * ${n})`
          );
          if (hasVar) decl.remove();
        });
      });
    },
  };
}
removeSpacingVarFallback.postcss = true;

/** Prepend @import url("oc-colors.css") to omnia_main so the main bundle loads color tokens from the separate file. */
function prependOcColorsImport() {
  return {
    postcssPlugin: "prepend-oc-colors-import",
    Once(root, { result }) {
      const file = result.opts.from || root.source?.input?.file || "";
      if (!file.includes("omnia_main.css")) return;
      const atRule = postcss.atRule({ name: "import", params: 'url("oc-colors.css")' });
      root.prepend(atRule);
    },
  };
}
prependOcColorsImport.postcss = true;

export default (cfg = {}) => {
  const dev = cfg.env === "development";

  return {
    plugins: [
      postcssImport(),
      postcssPresetEnv({
        stage: 3,
        // No static fallbacks next to var(): every supported browser has custom properties, the fallbacks were
        // placeholders (transparent, 0) and postcss-custom-properties 15.0.4+ stops on our nested gradient/shadow vars.
        features: { "custom-properties": false },
      }),
      removeOklabSupports(),
      removeSpacingVarFallback(),
      autoprefixer(),
      dev
        ? null
        : cssnanoPlugin({
            preset: "default",
          }),
      // Run last so the added @import is not resolved by postcss-import (browser loads it at runtime).
      prependOcColorsImport(),
    ].filter(Boolean),
  };
};
