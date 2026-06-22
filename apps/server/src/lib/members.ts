import { and, eq } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamAccess } from "./issues.js";
import { userHasTeamPermission } from "./permissions.js";
import { countTeamAdmins } from "./roles.js";

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
    throw new Error("Team access denied");
  }

  const isSelf = targetMember.member.userId === actorUserId;
  if (!isSelf && !(await userHasTeamPermission(db, actorUserId, teamId, "team.members.manage"))) {
    throw new Error("Permission denied");
  }

  if (targetMember.roleSlug === "admin") {
    const adminCount = await countTeamAdmins(db, teamId);
    if (adminCount <= 1) {
      throw new Error("Cannot remove the last admin");
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
    throw new Error("Member not found");
  }

  await assertCanRemoveMember(db, teamId, member, actorUserId);

  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.id, memberId));
}

export async function leaveTeam(db: Db, teamId: string, userId: string) {
  const member = await getMembershipForUserWithRole(db, teamId, userId);
  if (!member) {
    throw new Error("Not a member of this team");
  }

  await assertCanRemoveMember(db, teamId, member, userId);

  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.id, member.member.id));
}
