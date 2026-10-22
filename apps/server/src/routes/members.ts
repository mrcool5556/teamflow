import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { updateTeamMemberRoleSchema } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam, requirePermission } from "../middleware/team.js";
import { leaveTeam, removeTeamMember } from "../lib/members.js";
import { updateTeamMemberRole } from "../lib/roles.js";

/** Team membership: list, change role, remove, leave. */
const routes = new Hono<AppEnv>();

routes.get(
  "/teams/:teamId/members",
  requireAuth,
  loadTeam(),
  requirePermission("team.members.view"),
  async (c) => {
    const teamId = c.var.teamId;

    const members = await db
      .select({
        id: schema.teamMembers.id,
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        roleId: schema.teamRoles.id,
        roleName: schema.teamRoles.name,
        roleSlug: schema.teamRoles.slug,
        role: schema.teamRoles.slug,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
      .innerJoin(schema.teamRoles, eq(schema.teamMembers.roleId, schema.teamRoles.id))
      .where(eq(schema.teamMembers.teamId, teamId));

    return c.json({ members });
  },
);

routes.patch(
  "/teams/:teamId/members/:memberId",
  requireAuth,
  requireWrite,
  loadTeam(),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;
    const memberId = c.req.param("memberId");
    const body = updateTeamMemberRoleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
    }

    const role = await updateTeamMemberRole(db, teamId, memberId, body.data.roleId, auth.userId);
    return c.json({ role });
  },
);

routes.delete(
  "/teams/:teamId/members/:memberId",
  requireAuth,
  requireWrite,
  loadTeam(),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;
    const memberId = c.req.param("memberId");

    if (memberId === "me") {
      await leaveTeam(db, teamId, auth.userId);
    } else {
      await removeTeamMember(db, teamId, memberId, auth.userId);
    }
    return c.body(null, 204);
  },
);

export { routes as membersRoutes };
