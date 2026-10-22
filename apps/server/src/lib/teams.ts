import { eq, sql } from "drizzle-orm";
import type { Db, DbExecutor } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamPermission } from "./permissions.js";
import { findTeamRoleBySlug, seedDefaultTeamRoles } from "./roles.js";
import { createDefaultBoardRow } from "./board.js";
import { forbidden, internalError, notFound } from "./errors.js";

export function personalWorkspaceSlug(userId: string) {
  return `ws-${userId.slice(0, 8)}`;
}

export function getOrCreatePersonalWorkspace(db: DbExecutor, userId: string, userName = "User") {
  const slug = personalWorkspaceSlug(userId);
  const existing = db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, slug))
    .get();

  if (existing) {
    return existing.id;
  }

  const workspaceId = crypto.randomUUID();
  db.insert(schema.workspaces)
    .values({ id: workspaceId, name: `${userName}'s Workspace`, slug })
    .run();

  return workspaceId;
}

/**
 * Create a team with its system roles, the given member as `role`, and a default board row.
 * Synchronous: callers run it inside db.transaction so a failure leaves nothing behind.
 */
export function createTeamWithOwner(
  db: DbExecutor,
  input: { userId: string; userName: string; name: string; key: string; role: "owner" | "admin" },
) {
  const workspaceId = getOrCreatePersonalWorkspace(db, input.userId, input.userName);

  const teamId = crypto.randomUUID();
  db.insert(schema.teams)
    .values({ id: teamId, workspaceId, name: input.name, key: input.key })
    .run();

  seedDefaultTeamRoles(db, teamId);
  const role = findTeamRoleBySlug(db, teamId, input.role);
  if (!role) {
    throw internalError("Failed to seed team roles");
  }

  db.insert(schema.teamMembers)
    .values({ teamId, userId: input.userId, roleId: role.id, role: role.slug })
    .run();

  createDefaultBoardRow(db, teamId);

  return db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).get()!;
}

export async function countUserTeams(db: Db, userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, userId));
  return Number(row?.count ?? 0);
}

export async function deleteTeam(db: Db, teamId: string, actorUserId: string) {
  if (!(await userHasTeamPermission(db, actorUserId, teamId, "team.delete"))) {
    throw forbidden("Permission denied");
  }

  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);

  if (!team) {
    throw notFound("Team not found");
  }

  await db.delete(schema.teams).where(eq(schema.teams.id, teamId));

  return team;
}
