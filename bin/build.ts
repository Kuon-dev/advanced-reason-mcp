import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

async function buildApp() {
  try {
    // Ensure build directory exists
    await mkdir("build", { recursive: true });

    const result = await Bun.build({
      entrypoints: ["./src/index.ts"],
      outdir: "build",
      target: "bun",
      format: "esm",
      sourcemap: "linked",
      minify: {
        identifiers: true,
        syntax: true,
        whitespace: true,
      },
      external: [
        // Native/Binary dependencies
        "pg",
        // Core dependencies
        "@elysiajs/cors",
        "@elysiajs/swagger",
        "elysia",
        "elysia-rate-limit",
        "pino",
        "pino-pretty",
      ],
      naming: {
        entry: "[name].js",
        chunk: "[name]-[hash].js",
        asset: "[name]-[hash][ext]",
      },
    });

    if (!result.success) {
      console.error("Build failed", result.logs);
      process.exit(1);
    }

    // Copy package.json for dependencies
    const pkg = {
      type: "module",
      dependencies: {
        "@elysiajs/cors": "^1.1.1",
        "@elysiajs/swagger": "^1.1.5",
        elysia: "^1.1.23",
        "elysia-rate-limit": "^4.1.0",
        pg: "^8.13.1",
        pino: "^8.21.0",
      },
    };

    await writeFile(
      join("build", "package.json"),
      JSON.stringify(pkg, null, 2),
    );

    console.log("Build completed successfully!");
    console.log(result.logs);
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

buildApp();
