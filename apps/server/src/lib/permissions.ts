import { and, eq } from "drizzle-orm";
import type { TeamPermission, TeamPermissionsPublic } from "@teamflow/core";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { parseRolePermissions } from "./roles.js";

export async function getTeamMemberWithRole(db: Db, userId: string, teamId: string) {
  const [row] = await db
    .select({
      member: schema.teamMembers,
      role: schema.teamRoles,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.teamRoles, eq(schema.teamMembers.roleId, schema.teamRoles.id))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.teamId, teamId)))
    .limit(1);

  return row ?? null;
}

export async function getTeamPermissionsForUser(
  db: Db,
  userId: string,
  teamId: string,
): Promise<TeamPermissionsPublic | null> {
  const row = await getTeamMemberWithRole(db, userId, teamId);
  if (!row) return null;

  return {
    roleId: row.role.id,
    roleName: row.role.name,
    roleSlug: row.role.slug,
    permissions: parseRolePermissions(row.role.permissions),
  };
}

export async function userHasTeamPermission(
  db: Db,
  userId: string,
  teamId: string,
  permission: TeamPermission,
): Promise<boolean> {
  const snapshot = await getTeamPermissionsForUser(db, userId, teamId);
  return snapshot?.permissions.includes(permission) ?? false;
}

export async function getTeamMemberRoleSlug(db: Db, userId: string, teamId: string) {
  const row = await getTeamMemberWithRole(db, userId, teamId);
  return row?.role.slug ?? null;
}

export async function userIsTeamAdmin(db: Db, userId: string, teamId: string) {
  const slug = await getTeamMemberRoleSlug(db, userId, teamId);
  return slug === "admin";
}
