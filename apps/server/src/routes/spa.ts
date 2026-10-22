import fs from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import { config } from "../config.js";
import type { AppEnv } from "../types.js";

/** Path prefixes owned by the API; everything else falls back to the web app's index.html. */
export const API_PATH_PREFIXES = [
  "/health",
  "/auth",
  "/teams",
  "/invites",
  "/projects",
  "/issues",
  "/attachments",
  "/uploads",
  "/statuses",
  "/rows",
  "/integrations",
  "/discord",
];

export function isApiPath(pathname: string) {
  return API_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Serve the built web app (SERVE_WEB=true, or production with a built apps/web/dist). Must be
 * mounted after every API route so the catch-all only answers non-API paths.
 */
export function mountSpa(app: Hono<AppEnv>) {
  const webDist = config.webDist;
  const serveWeb = config.serveWeb || (config.isProduction && fs.existsSync(webDist));
  if (!serveWeb) return;

  app.use("/assets/*", serveStatic({ root: webDist }));
  app.get("/", serveStatic({ root: webDist, path: "index.html" }));
  app.get("*", async (c, next) => {
    if (isApiPath(c.req.path)) {
      return next();
    }
    return serveStatic({ root: webDist, path: "index.html" })(c, next);
  });
}
