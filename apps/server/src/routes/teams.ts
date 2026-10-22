import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody, parseWith } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import {
  createTeamSchema,
  resolveRefSchema,
  teamBundleExportQuerySchema,
  teamBundleImportOptionsSchema,
} from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam, requirePermission } from "../middleware/team.js";
import { createDefaultBoardRow } from "../lib/board.js";
import { createTeamForUser, deleteTeam } from "../lib/teams.js";
import { resolveTeamRefDetailed } from "../lib/refs.js";
import { exportTeamBundle, importTeamBundle } from "../lib/teamBundle.js";
import { getTeamPermissionsForUser } from "../lib/permissions.js";

/** Team list/create/delete, bundle export/import, permissions and ref resolution. */
const routes = new Hono<AppEnv>();

routes.get("/teams", requireAuth, async (c) => {
  const auth = c.var.auth;

  const rows = await db
    .select({
      id: schema.teams.id,
      workspaceId: schema.teams.workspaceId,
      name: schema.teams.name,
      key: schema.teams.key,
      createdAt: schema.teams.createdAt,
    })
    .from(schema.teams)
    .innerJoin(schema.teamMembers, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(eq(schema.teamMembers.userId, auth.userId));

  return c.json({ teams: rows });
});

routes.post("/teams", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const body = await parseBody(c, createTeamSchema);

  const [user] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, auth.userId))
    .limit(1);

  const team = await createTeamForUser(db, {
    userId: auth.userId,
    userName: user?.name ?? "User",
    name: body.name,
    key: body.key,
  });

  await createDefaultBoardRow(db, team.id);

  return c.json({ team }, 201);
});

routes.delete(
  "/teams/:teamId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;

    await deleteTeam(db, teamId, auth.userId);
    return c.body(null, 204);
  },
);

routes.get(
  "/teams/:teamId/export",
  requireAuth,
  validateParams,
  loadTeam(),
  requirePermission("team.data.transfer"),
  async (c) => {
    const teamId = c.var.teamId;

    const query = parseWith(teamBundleExportQuerySchema, c.req.query());

    const { filename, buffer } = await exportTeamBundle(db, teamId, query.includeFiles ?? false);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  },
);

routes.post(
  "/teams/:teamId/import",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("team.data.transfer"),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;

    const optionsInput = parseWith(teamBundleImportOptionsSchema, {
      force: c.req.query("force") === "true",
    });

    const body = await c.req.parseBody();
    const bundlePart = body.bundle;
    if (!bundlePart || typeof bundlePart === "string") {
      return c.json({ error: "Missing bundle zip file (field: bundle)" }, 400);
    }

    const buffer = Buffer.from(await bundlePart.arrayBuffer());

    const importResult = await importTeamBundle(db, teamId, auth.userId, buffer, optionsInput);
    return c.json({ result: importResult });
  },
);

routes.get("/teams/:teamId/permissions/me", requireAuth, validateParams, loadTeam(), async (c) => {
  const auth = c.var.auth;

  const teamId = c.var.teamId;

  const permissions = await getTeamPermissionsForUser(db, auth.userId, teamId);
  if (!permissions) {
    return c.json({ error: "Team access denied" }, 403);
  }

  return c.json({ permissions });
});

routes.get("/teams/:teamId/resolve", requireAuth, validateParams, loadTeam(), async (c) => {
  const teamId = c.var.teamId;

  const ref = c.req.query("ref") ?? "";
  const parsed = parseWith(resolveRefSchema, { ref }, { message: "Invalid ref query parameter" });

  const match = await resolveTeamRefDetailed(db, teamId, parsed.ref);
  if (!match) {
    return c.json({ error: "Reference not found" }, 404);
  }

  return c.json(match);
});

export { routes as teamsRoutes };
