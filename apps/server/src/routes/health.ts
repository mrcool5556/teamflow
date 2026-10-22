import { Hono } from "hono";
import type { AppEnv } from "../types.js";

/** Liveness probe. */
const routes = new Hono<AppEnv>();

routes.get("/health", (c) => c.json({ ok: true }));

export { routes as healthRoutes };
