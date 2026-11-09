import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { getAppVersion } from "../lib/appVersion.js";

/**
 * Liveness probe. `version` lets the updater and the "Back in a moment" screen see that the new
 * release is the one answering.
 */
const routes = new Hono<AppEnv>();

routes.get("/health", (c) => c.json({ ok: true, version: getAppVersion().version }));

export { routes as healthRoutes };
