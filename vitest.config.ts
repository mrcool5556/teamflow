import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

// Run tests against package sources so no build step is needed first.
const alias = {
  "@teamflow/core": src("core"),
  "@teamflow/db": src("db"),
  "@teamflow/api-client": src("api-client"),
};

// Workspace packages are symlinked into node_modules; inline them so the aliases apply.
const server = { deps: { inline: [/^@teamflow\//] } };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"],
          exclude: ["apps/web/**", "**/node_modules/**"],
          // Safe env defaults; the server validates its config at import time.
          setupFiles: ["./apps/server/tests/setupEnv.ts"],
          environment: "node",
          server,
        },
      },
      {
        esbuild: { jsx: "automatic" },
        resolve: { alias },
        define: { __TEAMFLOW_VERSION__: JSON.stringify("0.0.0-test") },
        test: {
          name: "web",
          include: ["apps/web/tests/**/*.test.{ts,tsx}"],
          setupFiles: ["./apps/web/tests/setup.ts"],
          environment: "jsdom",
          // Process CSS so tests can read stylesheets with `?raw` (tests/layers.test.ts).
          css: true,
          server,
        },
      },
    ],
  },
});
