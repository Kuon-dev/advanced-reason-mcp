/**
 * @description This module configures and runs esbuild to bundle, compile, and minify the application code.
 * It handles native module exclusions and sets up the proper build environment for both CommonJS and ESM compatibility.
 *
 * @usage
 * Run this script using Node.js:
 * ```
 * node builder.mjs
 * ```
 *
 * @customization
 * To customize the build process:
 * 1. Modify the `buildOptions` object to change esbuild configuration.
 * 2. Add or remove plugins in the `plugins` array.
 * 3. Adjust the `external` array to exclude or include modules in the bundle.
 * 4. Change the `format` option to 'cjs' if you need CommonJS output instead of ESM.
 *
 * @see {@link https://esbuild.github.io/api/|esbuild API documentation}
 */

import { build } from "esbuild";
import process from "process";
/**
 * Runs the esbuild bundling process with type checking
 *
 * @async
 * @function
 * @returns {Promise<void>}
 * @throws {Error} If the build process fails
 */
async function runBuild() {
  const startTime = performance.now();
  try {
    /**
     * @type {import('esbuild').BuildOptions}
     */
    const buildOptions = {
      entryPoints: ["./src/index.ts"],
      outdir: "dist",
      bundle: true,
      splitting: true,
      format: "esm",
      platform: "node",
      minify: true,
      // Additional options for better TypeScript handling
      sourcemap: true, // Useful for debugging
      banner: {
        js: `
          import { createRequire } from 'module';
          import { fileURLToPath } from 'url';
          import { dirname } from 'path';
          
          const require = createRequire(import.meta.url);
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
        `,
      },
      logLevel: "info",
      // Ensure proper handling of TypeScript features
      target: "node21", // or your target Node.js version
    };

    const result = await build(buildOptions);
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`Build completed successfully in ${duration}s:`, result);
  } catch (error) {
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.error(`Build failed after ${duration}s:`, error);
    process.exit(1);
  }
}

/**
 * Main build function that coordinates type checking and building
 *
 * @async
 * @function
 */
async function main() {
  const startTime = performance.now();
  try {
    await Promise.all([runBuild()]);

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ All tasks completed successfully in ${duration}s`);
  } catch (error) {
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ Process failed after ${duration}s`);
    console.error(error);
    process.exit(1);
  }
}

// Run the build process
main();
