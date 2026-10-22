import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { renameTeamFileSchema } from "@teamflow/core";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam } from "../middleware/team.js";
import {
  listTeamFiles,
  renameTeamFile,
  restoreTeamFile,
  softDeleteTeamFile,
} from "../lib/attachments.js";

/** Team file library: list, rename, trash, restore. */
const routes = new Hono<AppEnv>();

routes.get("/teams/:teamId/files", requireAuth, loadTeam(), async (c) => {
  const teamId = c.var.teamId;

  const trash = c.req.query("trash") === "1";
  const files = await listTeamFiles(db, teamId, { trash });
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  return c.json({ files, totalBytes, fileCount: files.length, trash });
});

routes.patch("/teams/:teamId/files/:fileId", requireAuth, requireWrite, loadTeam(), async (c) => {
  const teamId = c.var.teamId;
  const fileId = c.req.param("fileId");

  const body = renameTeamFileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const renamed = await renameTeamFile(db, teamId, fileId, body.data.filename);
  return c.json(renamed);
});

routes.delete("/teams/:teamId/files/:fileId", requireAuth, requireWrite, loadTeam(), async (c) => {
  const teamId = c.var.teamId;
  const fileId = c.req.param("fileId");

  const deleted = await softDeleteTeamFile(db, teamId, fileId);
  return c.json(deleted);
});

routes.post(
  "/teams/:teamId/files/:fileId/restore",
  requireAuth,
  requireWrite,
  loadTeam(),
  async (c) => {
    const teamId = c.var.teamId;
    const fileId = c.req.param("fileId");

    const restored = await restoreTeamFile(db, teamId, fileId);
    return c.json(restored);
  },
);

export { routes as filesRoutes };
