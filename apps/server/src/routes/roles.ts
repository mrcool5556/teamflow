import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { createTeamRoleSchema, updateTeamRoleSchema } from "@teamflow/core";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam, requirePermission } from "../middleware/team.js";
import { createTeamRole, deleteTeamRole, listTeamRoles, updateTeamRole } from "../lib/roles.js";

/** Team roles and their permissions. */
const routes = new Hono<AppEnv>();

routes.get(
  "/teams/:teamId/roles",
  requireAuth,
  loadTeam(),
  // Anyone who can assign roles or invite needs the role list too.
  requirePermission(["team.roles.view", "team.members.manage", "team.invites.manage"]),
  async (c) => {
    const teamId = c.var.teamId;

    const roles = await listTeamRoles(db, teamId);
    return c.json({ roles });
  },
);

routes.post("/teams/:teamId/roles", requireAuth, requireWrite, loadTeam(), async (c) => {
  const auth = c.var.auth;

  const teamId = c.var.teamId;

  const body = createTeamRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const role = await createTeamRole(db, teamId, auth.userId, body.data);
  return c.json({ role }, 201);
});

routes.patch("/teams/:teamId/roles/:roleId", requireAuth, requireWrite, loadTeam(), async (c) => {
  const auth = c.var.auth;

  const teamId = c.var.teamId;
  const roleId = c.req.param("roleId");

  const body = updateTeamRoleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  const role = await updateTeamRole(db, teamId, roleId, auth.userId, body.data);
  return c.json({ role });
});

routes.delete("/teams/:teamId/roles/:roleId", requireAuth, requireWrite, loadTeam(), async (c) => {
  const auth = c.var.auth;

  const teamId = c.var.teamId;
  const roleId = c.req.param("roleId");

  await deleteTeamRole(db, teamId, roleId, auth.userId);
  return c.body(null, 204);
});

export { routes as rolesRoutes };
