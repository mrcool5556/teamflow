import { and, eq } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamAccess } from "./issues.js";
import { getTeamMemberRoleSlug, userHasTeamPermission } from "./permissions.js";
import { countTeamAdmins, countTeamOwners } from "./roles.js";
import { badRequest, forbidden, notFound } from "./errors.js";

async function getTeamMemberRowWithRole(db: Db, teamId: string, memberId: string) {
  const [member] = await db
    .select({
      member: schema.teamMembers,
      roleSlug: schema.teamRoles.slug,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.teamRoles, eq(schema.teamMembers.roleId, schema.teamRoles.id))
    .where(and(eq(schema.teamMembers.id, memberId), eq(schema.teamMembers.teamId, teamId)))
    .limit(1);
  return member ?? null;
}

async function getMembershipForUserWithRole(db: Db, teamId: string, userId: string) {
  const [member] = await db
    .select({
      member: schema.teamMembers,
      roleSlug: schema.teamRoles.slug,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.teamRoles, eq(schema.teamMembers.roleId, schema.teamRoles.id))
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)))
    .limit(1);
  return member ?? null;
}

async function assertCanRemoveMember(
  db: Db,
  teamId: string,
  targetMember: { member: typeof schema.teamMembers.$inferSelect; roleSlug: string },
  actorUserId: string,
) {
  if (!(await userHasTeamAccess(db, actorUserId, teamId))) {
    throw forbidden("Team access denied");
  }

  const isSelf = targetMember.member.userId === actorUserId;
  if (!isSelf && !(await userHasTeamPermission(db, actorUserId, teamId, "team.members.manage"))) {
    throw forbidden("Permission denied");
  }

  // team.members.manage alone cannot remove an Owner; only another Owner can.
  if (!isSelf && targetMember.roleSlug === "owner") {
    const actorSlug = await getTeamMemberRoleSlug(db, actorUserId, teamId);
    if (actorSlug !== "owner") {
      throw forbidden("Only an Owner can remove an Owner");
    }
  }

  if (targetMember.roleSlug === "admin") {
    const adminCount = await countTeamAdmins(db, teamId);
    if (adminCount <= 1) {
      throw forbidden("Cannot remove the last admin");
    }
  }

  if (targetMember.roleSlug === "owner") {
    const ownerCount = await countTeamOwners(db, teamId);
    if (ownerCount <= 1) {
      throw forbidden("Cannot remove the last owner");
    }
  }
}

export async function removeTeamMember(
  db: Db,
  teamId: string,
  memberId: string,
  actorUserId: string,
) {
  const member = await getTeamMemberRowWithRole(db, teamId, memberId);
  if (!member) {
    throw notFound("Member not found");
  }

  await assertCanRemoveMember(db, teamId, member, actorUserId);

  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.id, memberId));
}

export async function leaveTeam(db: Db, teamId: string, userId: string) {
  const member = await getMembershipForUserWithRole(db, teamId, userId);
  if (!member) {
    throw badRequest("Not a member of this team");
  }

  await assertCanRemoveMember(db, teamId, member, userId);

  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.id, member.member.id));
}
