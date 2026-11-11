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
import { createTeamWithOwner, deleteTeam, spaceForUserCreatedTeam } from "../lib/teams.js";
import { getServerAccess, hasServerPower } from "../lib/serverAccess.js";
import { resolveTeamRefDetailed } from "../lib/refs.js";
import { importTeamBundle, streamTeamBundle } from "../lib/teamBundle.js";
import { Readable } from "node:stream";
import { exportTokenExpiresAt, signExportToken, verifyExportToken } from "../lib/streamTokens.js";
import { getTeamPermissionsForUser, userHasTeamPermission } from "../lib/permissions.js";
import { forbidden, unauthorized } from "../lib/errors.js";

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
      spaceType: schema.teams.spaceType,
      storageCapBytes: schema.teams.storageCapBytes,
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

  // Admin spaces (no cap) for server admins who hold the Flows power.
  const isInstanceAdmin = hasServerPower(getServerAccess(db, auth.userId), "flows");
  const team = db.transaction((tx) =>
    createTeamWithOwner(tx, {
      userId: auth.userId,
      userName: user?.name ?? "User",
      name: body.name,
      key: body.key,
      // You own the Flow you make (you can delete it, and it counts as your free space).
      role: "owner",
      space: spaceForUserCreatedTeam(tx, { userId: auth.userId, isInstanceAdmin }),
    }),
  );

  return c.json({ team }, 201);
});

routes.delete(
  "/teams/:teamId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("team.delete"),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;

    await deleteTeam(db, teamId, auth.userId);
    return c.body(null, 204);
  },
);

async function bundleResponse(teamId: string, includeFiles: boolean) {
  const { filename, stream } = await streamTeamBundle(db, teamId, includeFiles);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * A short-lived token so the browser downloads the bundle itself via
 * `GET /teams/:teamId/export?token=` (its download manager shows progress at once).
 */
routes.post(
  "/teams/:teamId/export-token",
  requireAuth,
  validateParams,
  loadTeam(),
  requirePermission("team.data.transfer"),
  async (c) => {
    const teamId = c.var.teamId;
    const query = parseWith(teamBundleExportQuerySchema, c.req.query());
    const token = await signExportToken(teamId, c.var.auth.userId);
    const files = query.includeFiles ? "&includeFiles=true" : "";
    return c.json({
      token,
      expiresAt: exportTokenExpiresAt(),
      downloadUrl: `/teams/${teamId}/export?token=${encodeURIComponent(token)}${files}`,
    });
  },
);

/** Bearer auth, or `?token=` from export-token for browser-driven downloads. */
routes.get(
  "/teams/:teamId/export",
  validateParams,
  async (c, next) => {
    const token = c.req.query("token");
    if (token === undefined) return next();
    let verified: { userId: string; teamId: string };
    try {
      verified = await verifyExportToken(token);
    } catch {
      throw unauthorized("Invalid or expired export token");
    }
    const teamId = c.req.param("teamId");
    if (verified.teamId !== teamId) throw forbidden("Export token is for another team");
    if (!(await userHasTeamPermission(db, verified.userId, teamId, "team.data.transfer"))) {
      throw forbidden("Permission denied");
    }
    const query = parseWith(teamBundleExportQuerySchema, {
      includeFiles: c.req.query("includeFiles"),
    });
    return bundleResponse(teamId, query.includeFiles ?? false);
  },
  requireAuth,
  loadTeam(),
  requirePermission("team.data.transfer"),
  async (c) => {
    const query = parseWith(teamBundleExportQuerySchema, c.req.query());
    return bundleResponse(c.var.teamId, query.includeFiles ?? false);
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
