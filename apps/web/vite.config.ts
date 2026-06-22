import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appVersion = JSON.parse(
  readFileSync(resolve(repoRoot, "package.json"), "utf8"),
).version as string;

export default defineConfig({
  plugins: [react()],
  define: {
    __TEAMFLOW_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
