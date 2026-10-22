import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { collectRoutes, generateApiDocs } from "../../../scripts/gen-api-docs.mjs";
import { API_ROUTES } from "../src/app.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

type DocRoute = { method: string; path: string };

describe("docs/API.md", () => {
  it("is regenerated after every route change (run pnpm docs:api)", () => {
    const { current, next } = generateApiDocs(root);
    expect(current).toBe(next);
  });

  it("lists exactly the mounted routes", () => {
    const documented = new Set(
      (collectRoutes(root) as { routes: DocRoute[] }[])
        .flatMap((section) => section.routes)
        .map((route) => `${route.method} ${route.path}`),
    );
    const mounted = new Set<string>();
    for (const sub of API_ROUTES) {
      for (const route of sub.routes) {
        if (route.method !== "ALL") mounted.add(`${route.method} ${route.path}`);
      }
    }
    expect([...documented].sort()).toEqual([...mounted].sort());
  });
});
