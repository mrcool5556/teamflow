import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Run tests against package sources so no build step is needed first.
    alias: {
      "@teamflow/core": src("core"),
      "@teamflow/db": src("db"),
      "@teamflow/api-client": src("api-client"),
    },
  },
  test: {
    include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"],
    environment: "node",
    server: {
      // Workspace packages are symlinked into node_modules; inline them so the aliases apply.
      deps: { inline: [/^@teamflow\//] },
    },
  },
});
