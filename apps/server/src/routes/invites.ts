import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { createTeamInviteSchema } from "@teamflow/core";
import { db } from "../db.js";
import { optionalAuth, requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam, requirePermission } from "../middleware/team.js";
import {
  acceptTeamInvite,
  createTeamInvite,
  getInvitePreview,
  listTeamInvites,
  revokeTeamInvite,
} from "../lib/invites.js";

/** Team invites and invite acceptance. */
const routes = new Hono<AppEnv>();

routes.get(
  "/teams/:teamId/invites",
  requireAuth,
  loadTeam(),
  requirePermission("team.invites.manage"),
  async (c) => {
    const teamId = c.var.teamId;

    const invites = await listTeamInvites(db, teamId);
    return c.json({ invites });
  },
);

routes.post(
  "/teams/:teamId/invites",
  requireAuth,
  requireWrite,
  loadTeam(),
  requirePermission("team.invites.manage"),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;

    const body = createTeamInviteSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
    }

    const invite = await createTeamInvite(db, {
      teamId,
      createdByUserId: auth.userId,
      roleId: body.data.roleId,
      role: body.data.role,
      expiresInDays: body.data.expiresInDays,
      maxUses: body.data.maxUses,
    });
    return c.json({ invite }, 201);
  },
);

routes.delete(
  "/teams/:teamId/invites/:inviteId",
  requireAuth,
  requireWrite,
  loadTeam(),
  requirePermission("team.invites.manage"),
  async (c) => {
    const teamId = c.var.teamId;
    const inviteId = c.req.param("inviteId");

    const invite = await revokeTeamInvite(db, teamId, inviteId);
    if (!invite) return c.json({ error: "Invite not found" }, 404);

    return c.body(null, 204);
  },
);

routes.get("/invites/:token", optionalAuth, async (c) => {
  const token = c.req.param("token");
  const preview = await getInvitePreview(db, token, c.var.auth?.userId);
  if (!preview) return c.json({ error: "Invite not found" }, 404);

  return c.json({ preview });
});

routes.post("/invites/:token/accept", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const token = c.req.param("token");
  const outcome = await acceptTeamInvite(db, token, auth.userId);
  return c.json(outcome);
});

export { routes as invitesRoutes };
