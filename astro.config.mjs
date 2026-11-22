// @ts-check
import { defineConfig } from "astro/config";
import sassGlobImports from "vite-plugin-sass-glob-import";

/**
 * Creates a Sass glob import plugin compatible with Astro.
 *
 * Fixes two issues with sassGlobImports():
 *
 * 1. Astro may append query parameters to Sass file paths
 *    (e.g. style.scss?direct&lang.css), preventing the plugin
 *    from recognising them.
 *
 * 2. Globbed `@use` statements containing `as *` aren't handled
 *    correctly. Our component styles share the fiename
 *    `_style.scss`, so they need `as *` to avoid Sass namespace
 *    collisions.
 *
 * The wrapper temporarily removes `as *` from glob imports,
 * expands them using the original plugin, then restores
 * `as *` on the resulting _style.scss imports.
 *
 * @returns {ReturnType<typeof sassGlobImports>}
 *  The original plugin with an Astro-compatible transform.
 */
function fixSassGlobImports() {
  const plugin = sassGlobImports();
  const originalTransform = plugin.transform;

  // Match globbed _style.scss imports containing `as *`.
  const globbedStyleImports =
    /^([ \t]*)@use\s+["']([^"']*\*[^"']*_style\.scss)["']\s+as\s+\*\s*;/gm;

  // Match individual _style.scss imports without `as *`.
  const expandedStyleImports =
    /^([ \t]*)@use\s+["']([^"']*_style\.scss)["']\s*;/gm;

  return {
    ...plugin,

    transform(source, id) {
      // Only process Sass files and plugins with a transform hook.
      if ("function" !== typeof originalTransform) {
        return null;
      }

      // Remove Astro's query parameters from the file path.
      const filePath = id.split("?")[0];

      if (!/\.s[ac]ss$/i.test(filePath)) {
        return null;
      }

      // Temporarily remove `as *` so the plugin can expand
      // globbed _style.scss imports.
      const preparedSource =
        "string" === typeof source
          ? source.replace(globbedStyleImports, '$1@use "$2";')
          : source;

      // Run the original plugin with the cleaned file path.
      const result = originalTransform.call(this, preparedSource, filePath);

      // Return unchanged if the plugin didn't produce code.
      if (!result || typeof result.code !== "string") {
        return result;
      }

      // Restore `as *` on the expanded _style.scss imports.
      return {
        ...result,
        code: result.code.replace(expandedStyleImports, '$1@use "$2" as *;'),
      };
    },
  };
}

// https://astro.build/config
export default defineConfig({
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: ["./src/scss"],
        },
      },
    },
    plugins: [fixSassGlobImports()],
  },
});
