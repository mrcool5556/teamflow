import { and, eq, sql } from "drizzle-orm";
import {
  DEFAULT_SYSTEM_ROLE_TEMPLATES,
  type CreateTeamRoleInput,
  type SystemRoleSlug,
  type TeamPermission,
  type TeamRolePublic,
  type UpdateTeamRoleInput,
  TEAM_PERMISSIONS,
  isTeamPermission,
} from "@teamflow/core";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamPermission } from "./permissions.js";

export function parseRolePermissions(raw: string): TeamPermission[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is TeamPermission => isTeamPermission(String(value)));
  } catch {
    return [];
  }
}

export function serializeRolePermissions(permissions: TeamPermission[]) {
  const unique = [...new Set(permissions)];
  return JSON.stringify(unique);
}

function slugifyRoleName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "role";
}

async function uniqueCustomSlug(db: Db, teamId: string, name: string) {
  const reserved = new Set(DEFAULT_SYSTEM_ROLE_TEMPLATES.map((role) => role.slug));
  let slug = slugifyRoleName(name);
  if (reserved.has(slug as SystemRoleSlug)) {
    slug = `${slug}_custom`;
  }

  let candidate = slug;
  let suffix = 2;
  while (true) {
    const [existing] = await db
      .select({ id: schema.teamRoles.id })
      .from(schema.teamRoles)
      .where(and(eq(schema.teamRoles.teamId, teamId), eq(schema.teamRoles.slug, candidate)))
      .limit(1);
    if (!existing) return candidate;
    candidate = `${slug}_${suffix}`;
    suffix += 1;
  }
}

async function countRoleMembers(db: Db, teamId: string, roleId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.roleId, roleId)));
  return Number(row?.count ?? 0);
}

export async function mapTeamRolePublic(
  db: Db,
  row: typeof schema.teamRoles.$inferSelect,
): Promise<TeamRolePublic> {
  const memberCount = await countRoleMembers(db, row.teamId, row.id);
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    slug: row.slug,
    permissions: parseRolePermissions(row.permissions),
    isSystem: row.isSystem === 1,
    position: row.position,
    memberCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function seedDefaultTeamRoles(db: Db, teamId: string) {
  const existing = await db
    .select({ id: schema.teamRoles.id })
    .from(schema.teamRoles)
    .where(eq(schema.teamRoles.teamId, teamId))
    .limit(1);

  if (existing.length > 0) {
    return listTeamRoles(db, teamId);
  }

  const now = new Date().toISOString();
  for (const template of DEFAULT_SYSTEM_ROLE_TEMPLATES) {
    await db.insert(schema.teamRoles).values({
      teamId,
      name: template.name,
      slug: template.slug,
      permissions: serializeRolePermissions([...template.permissions]),
      isSystem: 1,
      position: template.position,
      updatedAt: now,
    });
  }

  return listTeamRoles(db, teamId);
}

export async function listTeamRoles(db: Db, teamId: string) {
  const rows = await db
    .select()
    .from(schema.teamRoles)
    .where(eq(schema.teamRoles.teamId, teamId))
    .orderBy(schema.teamRoles.position, schema.teamRoles.name);

  return Promise.all(rows.map((row) => mapTeamRolePublic(db, row)));
}

export async function getTeamRole(db: Db, teamId: string, roleId: string) {
  const [row] = await db
    .select()
    .from(schema.teamRoles)
    .where(and(eq(schema.teamRoles.teamId, teamId), eq(schema.teamRoles.id, roleId)))
    .limit(1);

  return row ? mapTeamRolePublic(db, row) : null;
}

export async function getTeamRoleBySlug(db: Db, teamId: string, slug: string) {
  const [row] = await db
    .select()
    .from(schema.teamRoles)
    .where(and(eq(schema.teamRoles.teamId, teamId), eq(schema.teamRoles.slug, slug)))
    .limit(1);

  return row ? mapTeamRolePublic(db, row) : null;
}

export async function resolveInviteRoleId(
  db: Db,
  teamId: string,
  input: { roleId?: string; role?: string },
) {
  if (input.roleId) {
    const role = await getTeamRole(db, teamId, input.roleId);
    if (!role) throw new Error("Role not found");
    return role;
  }

  const slug = (input.role ?? "member") as SystemRoleSlug;
  const role = await getTeamRoleBySlug(db, teamId, slug);
  if (!role) throw new Error("Role not found");
  return role;
}

export async function createTeamRole(
  db: Db,
  teamId: string,
  actorUserId: string,
  input: CreateTeamRoleInput,
) {
  if (!(await userHasTeamPermission(db, actorUserId, teamId, "team.roles.manage"))) {
    throw new Error("Permission denied");
  }

  const slug = await uniqueCustomSlug(db, teamId, input.name);
  const [maxPosition] = await db
    .select({ value: sql<number>`coalesce(max(${schema.teamRoles.position}), -1)` })
    .from(schema.teamRoles)
    .where(eq(schema.teamRoles.teamId, teamId));

  const now = new Date().toISOString();
  const roleId = crypto.randomUUID();
  await db.insert(schema.teamRoles).values({
    id: roleId,
    teamId,
    name: input.name.trim(),
    slug,
    permissions: serializeRolePermissions(input.permissions),
    isSystem: 0,
    position: Number(maxPosition?.value ?? -1) + 1,
    updatedAt: now,
  });

  const created = await getTeamRole(db, teamId, roleId);
  if (!created) throw new Error("Failed to create role");
  return created;
}

function validateRolePermissions(role: typeof schema.teamRoles.$inferSelect, permissions: TeamPermission[]) {
  if (role.slug === "admin" && !permissions.includes("team.delete")) {
    throw new Error("The Admin role must keep team.delete permission");
  }
  if (role.slug === "admin" && !permissions.includes("team.roles.manage")) {
    throw new Error("The Admin role must keep team.roles.manage permission");
  }
}

export async function updateTeamRole(
  db: Db,
  teamId: string,
  roleId: string,
  actorUserId: string,
  input: UpdateTeamRoleInput,
) {
  if (!(await userHasTeamPermission(db, actorUserId, teamId, "team.roles.manage"))) {
    throw new Error("Permission denied");
  }

  const [role] = await db
    .select()
    .from(schema.teamRoles)
    .where(and(eq(schema.teamRoles.teamId, teamId), eq(schema.teamRoles.id, roleId)))
    .limit(1);

  if (!role) throw new Error("Role not found");

  const nextPermissions =
    input.permissions !== undefined ? input.permissions : parseRolePermissions(role.permissions);
  validateRolePermissions(role, nextPermissions);

  await db
    .update(schema.teamRoles)
    .set({
      name: input.name?.trim() ?? role.name,
      permissions:
        input.permissions !== undefined
          ? serializeRolePermissions(input.permissions)
          : role.permissions,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.teamRoles.id, roleId));

  const updated = await getTeamRole(db, teamId, roleId);
  if (!updated) throw new Error("Role not found");
  return updated;
}

export async function deleteTeamRole(
  db: Db,
  teamId: string,
  roleId: string,
  actorUserId: string,
) {
  if (!(await userHasTeamPermission(db, actorUserId, teamId, "team.roles.manage"))) {
    throw new Error("Permission denied");
  }

  const [role] = await db
    .select()
    .from(schema.teamRoles)
    .where(and(eq(schema.teamRoles.teamId, teamId), eq(schema.teamRoles.id, roleId)))
    .limit(1);

  if (!role) throw new Error("Role not found");
  if (role.isSystem === 1) throw new Error("System roles cannot be deleted");

  const memberCount = await countRoleMembers(db, teamId, roleId);
  if (memberCount > 0) {
    throw new Error("Move members to another role before deleting this role");
  }

  await db.delete(schema.teamRoles).where(eq(schema.teamRoles.id, roleId));
}

export async function countTeamAdmins(db: Db, teamId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teamMembers)
    .innerJoin(schema.teamRoles, eq(schema.teamMembers.roleId, schema.teamRoles.id))
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamRoles.slug, "admin")));
  return Number(row?.count ?? 0);
}

export async function updateTeamMemberRole(
  db: Db,
  teamId: string,
  memberId: string,
  roleId: string,
  actorUserId: string,
) {
  if (!(await userHasTeamPermission(db, actorUserId, teamId, "team.members.manage"))) {
    throw new Error("Permission denied");
  }

  const [member] = await db
    .select({
      member: schema.teamMembers,
      roleSlug: schema.teamRoles.slug,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.teamRoles, eq(schema.teamMembers.roleId, schema.teamRoles.id))
    .where(and(eq(schema.teamMembers.id, memberId), eq(schema.teamMembers.teamId, teamId)))
    .limit(1);

  if (!member) throw new Error("Member not found");

  const nextRole = await getTeamRole(db, teamId, roleId);
  if (!nextRole) throw new Error("Role not found");

  if (member.roleSlug === "admin" && nextRole.slug !== "admin") {
    const adminCount = await countTeamAdmins(db, teamId);
    if (adminCount <= 1) {
      throw new Error("Cannot remove the last admin");
    }
  }

  await db
    .update(schema.teamMembers)
    .set({
      roleId: nextRole.id,
      role: nextRole.slug as SystemRoleSlug,
    })
    .where(eq(schema.teamMembers.id, memberId));

  return nextRole;
}

export function allTeamPermissions(): TeamPermission[] {
  return [...TEAM_PERMISSIONS];
}
