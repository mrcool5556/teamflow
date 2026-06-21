import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { userHasTeamAccess } from "./issues.js";
import { userIsTeamAdmin } from "./invites.js";

export async function countTeamAdmins(db: Db, teamId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.role, "admin")));
  return Number(row?.count ?? 0);
}

async function getTeamMemberRow(db: Db, teamId: string, memberId: string) {
  const [member] = await db
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.id, memberId), eq(schema.teamMembers.teamId, teamId)))
    .limit(1);
  return member ?? null;
}

async function getMembershipForUser(db: Db, teamId: string, userId: string) {
  const [member] = await db
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)))
    .limit(1);
  return member ?? null;
}

async function assertCanRemoveMember(
  db: Db,
  teamId: string,
  targetMember: typeof schema.teamMembers.$inferSelect,
  actorUserId: string,
) {
  if (!(await userHasTeamAccess(db, actorUserId, teamId))) {
    throw new Error("Team access denied");
  }

  const isSelf = targetMember.userId === actorUserId;
  if (!isSelf && !(await userIsTeamAdmin(db, actorUserId, teamId))) {
    throw new Error("Admin access required");
  }

  if (targetMember.role === "admin") {
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
  const member = await getTeamMemberRow(db, teamId, memberId);
  if (!member) {
    throw new Error("Member not found");
  }

  await assertCanRemoveMember(db, teamId, member, actorUserId);

  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.id, memberId));
}

export async function leaveTeam(db: Db, teamId: string, userId: string) {
  const member = await getMembershipForUser(db, teamId, userId);
  if (!member) {
    throw new Error("Not a member of this team");
  }

  await assertCanRemoveMember(db, teamId, member, userId);

  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.id, member.id));
}
