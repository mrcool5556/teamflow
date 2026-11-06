import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody, parseQuery } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { listTeamFilesQuerySchema, renameTeamFileSchema } from "@teamflow/core";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam, requirePermission } from "../middleware/team.js";
import {
  listTeamFiles,
  renameTeamFile,
  restoreTeamFile,
  softDeleteTeamFile,
} from "../lib/attachments.js";
import { getSpaceStorage } from "../lib/spaceStorage.js";

/** Team file library: list, rename, trash, restore. */
const routes = new Hono<AppEnv>();

routes.get("/teams/:teamId/files", requireAuth, validateParams, loadTeam(), async (c) => {
  const teamId = c.var.teamId;

  const trash = parseQuery(c, listTeamFilesQuerySchema).trash === "1";
  const files = await listTeamFiles(db, teamId, { trash });
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  return c.json({ files, totalBytes, fileCount: files.length, trash });
});

/** The space's upload allowance and what uses it (the Files drawer meter). Any member. */
routes.get("/teams/:teamId/storage", requireAuth, validateParams, loadTeam(), async (c) => {
  return c.json({ storage: await getSpaceStorage(db, c.var.teamId) });
});

routes.patch(
  "/teams/:teamId/files/:fileId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("board.edit"),
  async (c) => {
    const teamId = c.var.teamId;
    const fileId = c.req.param("fileId");

    const body = await parseBody(c, renameTeamFileSchema);

    const renamed = await renameTeamFile(db, teamId, fileId, body.filename);
    return c.json(renamed);
  },
);

routes.delete(
  "/teams/:teamId/files/:fileId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("board.edit"),
  async (c) => {
    const teamId = c.var.teamId;
    const fileId = c.req.param("fileId");

    const deleted = await softDeleteTeamFile(db, teamId, fileId);
    return c.json(deleted);
  },
);

routes.post(
  "/teams/:teamId/files/:fileId/restore",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("board.edit"),
  async (c) => {
    const teamId = c.var.teamId;
    const fileId = c.req.param("fileId");

    const restored = await restoreTeamFile(db, teamId, fileId);
    return c.json(restored);
  },
);

export { routes as filesRoutes };
