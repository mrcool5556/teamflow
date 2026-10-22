import { Hono } from "hono";
import type { AppEnv } from "../types.js";
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

  const body = createTeamSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const [user] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, auth.userId))
    .limit(1);

  const team = await createTeamForUser(db, {
    userId: auth.userId,
    userName: user?.name ?? "User",
    name: body.data.name,
    key: body.data.key,
  });

  await createDefaultBoardRow(db, team.id);

  return c.json({ team }, 201);
});

routes.delete("/teams/:teamId", requireAuth, requireWrite, loadTeam(), async (c) => {
  const auth = c.var.auth;

  const teamId = c.var.teamId;

  await deleteTeam(db, teamId, auth.userId);
  return c.body(null, 204);
});

routes.get(
  "/teams/:teamId/export",
  requireAuth,
  loadTeam(),
  requirePermission("team.data.transfer"),
  async (c) => {
    const teamId = c.var.teamId;

    const query = teamBundleExportQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: query.error.issues[0]?.message ?? "Invalid query" }, 400);
    }

    const { filename, buffer } = await exportTeamBundle(
      db,
      teamId,
      query.data.includeFiles ?? false,
    );
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
  loadTeam(),
  requirePermission("team.data.transfer"),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;

    const optionsInput = teamBundleImportOptionsSchema.safeParse({
      force: c.req.query("force") === "true",
    });
    if (!optionsInput.success) {
      return c.json({ error: optionsInput.error.issues[0]?.message ?? "Invalid options" }, 400);
    }

    const body = await c.req.parseBody();
    const bundlePart = body.bundle;
    if (!bundlePart || typeof bundlePart === "string") {
      return c.json({ error: "Missing bundle zip file (field: bundle)" }, 400);
    }

    const buffer = Buffer.from(await bundlePart.arrayBuffer());

    const importResult = await importTeamBundle(db, teamId, auth.userId, buffer, optionsInput.data);
    return c.json({ result: importResult });
  },
);

routes.get("/teams/:teamId/permissions/me", requireAuth, loadTeam(), async (c) => {
  const auth = c.var.auth;

  const teamId = c.var.teamId;

  const permissions = await getTeamPermissionsForUser(db, auth.userId, teamId);
  if (!permissions) {
    return c.json({ error: "Team access denied" }, 403);
  }

  return c.json({ permissions });
});

routes.get("/teams/:teamId/resolve", requireAuth, loadTeam(), async (c) => {
  const teamId = c.var.teamId;

  const ref = c.req.query("ref") ?? "";
  const parsed = resolveRefSchema.safeParse({ ref });
  if (!parsed.success) {
    return c.json({ error: "Invalid ref query parameter" }, 400);
  }

  const match = await resolveTeamRefDetailed(db, teamId, parsed.data.ref);
  if (!match) {
    return c.json({ error: "Reference not found" }, 404);
  }

  return c.json(match);
});

export { routes as teamsRoutes };
