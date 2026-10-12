/**
 * Preserve the existing UI while using the maintained Tailwind 4 compiler.
 * These narrowly matched rules were compared against the generated Tailwind 3
 * CSS and actual browser styles. This plugin does not load the former toolchain.
 */
module.exports = function legacyUtilityCompatibility() {
  return {
    postcssPlugin: "fakturaprosto-legacy-utility-compatibility",
    OnceExit(root) {
      let hasLegacyGradient = false;
      let hasModernGradient = false;
      root.walkRules(rule => {
        if (rule.selector.includes("bg-gradient-to-")) hasLegacyGradient = true;
        if (rule.selector.includes("bg-linear-")) hasModernGradient = true;
        const reverse = rule.nodes?.find(node => node.type === "decl" && node.prop === "--tw-space-y-reverse");
        if (reverse && rule.selector.includes(":not(:last-child)")) {
          const selector = rule.selector.replace(/:where\((.+?)\s*>\s*:not\(:last-child\)\)/g, "$1 > :not([hidden]) ~ :not([hidden])");
          if (selector !== rule.selector) {
            rule.selector = selector;
            rule.walkDecls(declaration => {
              const mapping = { "margin-block-start": "margin-bottom", "margin-block-end": "margin-top" };
              if (mapping[declaration.prop]) declaration.prop = mapping[declaration.prop];
            });
          }
        }

        if (rule.selector.includes("outline-none")) {
          const style = rule.nodes?.find(node => node.type === "decl" && node.prop === "outline-style" && node.value === "none");
          if (style) {
            rule.walkDecls("--tw-outline-style", declaration => { declaration.value = "solid"; });
            style.prop = "outline";
            style.value = "2px solid transparent";
            rule.append({ prop: "outline-offset", value: "2px" });
          }
        }

        if (rule.selector.includes("bg-gradient-to-")) {
          rule.walkDecls("--tw-gradient-position", declaration => {
            declaration.value = declaration.value.replace(/ in oklab$/, "");
          });
        }
      });
      // Typed v4 gradient colors round the former HSL tokens before interpolation.
      // Actual browser comparison showed a 1/255 color drift; plain custom
      // properties restore the exact former pixels for the existing gradients.
      // Keep the v4 registrations if explicitly modern gradient utilities appear.
      if (hasLegacyGradient && !hasModernGradient) {
        root.walkAtRules("property", registration => {
          if (/^--tw-gradient-(from|via|to)$/.test(registration.params)) registration.remove();
        });
      }
      // The v4 production optimizer combines these important individual resets
      // into `transform`, which does not reset a separate utility `translate`.
      // Restore only this application's established global reduced-motion rule.
      root.walkAtRules("media", media => {
        if (!/^\(prefers-reduced-motion:\s*reduce\)$/.test(media.params)) return;
        media.walkRules(rule => {
          const selectors = rule.selector.replace(/\s/g, "").split(",");
          if (!selectors.includes("*") || !selectors.some(selector => /^::?before$/.test(selector)) || !selectors.some(selector => /^::?after$/.test(selector))) return;
          const duration = rule.nodes?.find(node => node.type === "decl" && node.prop === "animation-duration" && node.important && /^(?:0?\.001ms)$/.test(node.value));
          const transform = rule.nodes?.find(node => node.type === "decl" && node.prop === "transform" && node.important);
          if (!duration || !transform) return;
          transform.value = "none";
          for (const prop of ["translate", "rotate", "scale"]) {
            const reset = rule.nodes.find(node => node.type === "decl" && node.prop === prop);
            if (reset) { reset.value = "none"; reset.important = true; }
            else rule.append({ prop, value: "none", important: true });
          }
        });
      });
    },
  };
};
module.exports.postcss = true;
