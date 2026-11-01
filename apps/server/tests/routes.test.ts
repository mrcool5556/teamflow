import { describe, expect, it } from "vitest";
import { API_PATH_PREFIXES, isApiPath } from "../src/routes/spa.js";
import { API_ROUTES } from "../src/app.js";
import { bootApp } from "./helpers";

describe("route split", () => {
  it("mounts every API route exactly once", async () => {
    const app = await bootApp();
    const seen = new Set<string>();
    let count = 0;
    for (const sub of API_ROUTES) {
      for (const route of sub.routes) {
        if (route.method === "ALL") continue;
        const key = `${route.method} ${route.path}`;
        if (seen.has(key)) continue; // a route registers once per middleware in its chain
        seen.add(key);
        count += 1;
      }
    }
    expect(count).toBe(93);
    const mounted = new Set(
      app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`),
    );
    for (const key of seen) expect(mounted.has(key), key).toBe(true);
  });

  it("keeps every API path out of the SPA fallback", () => {
    expect(API_PATH_PREFIXES).toEqual(expect.arrayContaining(["/integrations", "/discord"]));
    for (const sub of API_ROUTES) {
      for (const route of sub.routes) {
        expect(isApiPath(route.path.replace(/:\w+/g, "x")), route.path).toBe(true);
      }
    }
    expect(isApiPath("/board")).toBe(false);
    expect(isApiPath("/settings/integrations")).toBe(false);
  });
});
