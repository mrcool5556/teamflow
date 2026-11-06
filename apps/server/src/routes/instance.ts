import { Hono } from "hono";
import { z } from "zod";
import { createSpaceSchema, updateSpaceSchema, updateSpaceSettingsSchema } from "@teamflow/core";
import type { AppEnv } from "../types.js";
import { db } from "../db.js";
import { parseBody, parseQuery } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { requireAuth, requireInstanceAdmin, requireWrite } from "../middleware/auth.js";
import {
  cancelSpaceUploads,
  checkPublicUrl,
  createSpace,
  emptySpaceTrash,
  getInstanceOverview,
  getSpaceDetail,
  listInstanceUsers,
  listSpaces,
  updateSpace,
} from "../lib/instanceAdmin.js";
import { getSpaceSettings, updateSpaceSettings } from "../lib/spaceSettings.js";

/** Instance admin page (web /admin): server status, spaces, caps and space settings. */
const routes = new Hono<AppEnv>();

const listInstanceUsersQuerySchema = z.object({ q: z.string().max(120).optional() });

routes.get("/instance/overview", requireAuth, requireInstanceAdmin, async (c) => {
  return c.json({ overview: await getInstanceOverview(db) });
});

/** Fetch PUBLIC_URL/health from the server (proxy, DNS, TLS); up to 5 seconds. */
routes.get("/instance/checks/public-url", requireAuth, requireInstanceAdmin, async (c) => {
  return c.json({ check: await checkPublicUrl() });
});

routes.get("/instance/settings", requireAuth, requireInstanceAdmin, async (c) =>
  c.json({ settings: getSpaceSettings(db) }),
);

routes.patch("/instance/settings", requireAuth, requireWrite, requireInstanceAdmin, async (c) => {
  const body = await parseBody(c, updateSpaceSettingsSchema);
  return c.json({ settings: updateSpaceSettings(db, body) });
});

/** Users for the owner picker, with how many free spaces each holds. */
routes.get("/instance/users", requireAuth, requireInstanceAdmin, async (c) => {
  const query = parseQuery(c, listInstanceUsersQuerySchema);
  return c.json({ users: listInstanceUsers(db, query.q) });
});

routes.get("/instance/spaces", requireAuth, requireInstanceAdmin, async (c) =>
  c.json({ spaces: listSpaces(db) }),
);

routes.post("/instance/spaces", requireAuth, requireWrite, requireInstanceAdmin, async (c) => {
  const body = await parseBody(c, createSpaceSchema);
  return c.json({ space: createSpace(db, c.var.auth.userId, body) }, 201);
});

routes.get(
  "/instance/spaces/:teamId",
  requireAuth,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    return c.json({ space: getSpaceDetail(db, c.req.param("teamId")) });
  },
);

/** Change type or cap; lowering a cap deletes nothing, it only blocks new uploads. */
routes.patch(
  "/instance/spaces/:teamId",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    const body = await parseBody(c, updateSpaceSchema);
    return c.json({ space: updateSpace(db, c.var.auth.userId, c.req.param("teamId"), body) });
  },
);

routes.post(
  "/instance/spaces/:teamId/empty-trash",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    const teamId = c.req.param("teamId");
    const result = await emptySpaceTrash(db, c.var.auth.userId, teamId);
    return c.json({ ...result, space: getSpaceDetail(db, teamId) });
  },
);

routes.post(
  "/instance/spaces/:teamId/cancel-uploads",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    const teamId = c.req.param("teamId");
    const result = await cancelSpaceUploads(db, c.var.auth.userId, teamId);
    return c.json({ ...result, space: getSpaceDetail(db, teamId) });
  },
);

export { routes as instanceRoutes };
