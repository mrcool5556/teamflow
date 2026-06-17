import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import type { AssigneePublic } from "@teamflow/core";

export async function loadIssueAssignees(
  db: Db,
  issueId: string,
): Promise<AssigneePublic[]> {
  const rows = await db
    .select({
      userId: schema.issueAssignees.userId,
      name: schema.users.name,
    })
    .from(schema.issueAssignees)
    .innerJoin(schema.users, eq(schema.issueAssignees.userId, schema.users.id))
    .where(eq(schema.issueAssignees.issueId, issueId));

  return rows.map((row) => ({ userId: row.userId, name: row.name }));
}

export async function loadBoardRowAssignees(
  db: Db,
  rowId: string,
): Promise<AssigneePublic[]> {
  const rows = await db
    .select({
      userId: schema.boardRowAssignees.userId,
      name: schema.users.name,
    })
    .from(schema.boardRowAssignees)
    .innerJoin(schema.users, eq(schema.boardRowAssignees.userId, schema.users.id))
    .where(eq(schema.boardRowAssignees.rowId, rowId));

  return rows.map((row) => ({ userId: row.userId, name: row.name }));
}

export async function setIssueAssignees(db: Db, issueId: string, userIds: string[]) {
  const uniqueIds = [...new Set(userIds)];
  await db.delete(schema.issueAssignees).where(eq(schema.issueAssignees.issueId, issueId));

  for (const userId of uniqueIds) {
    await db.insert(schema.issueAssignees).values({ issueId, userId });
  }

  await db
    .update(schema.issues)
    .set({ assigneeId: uniqueIds[0] ?? null })
    .where(eq(schema.issues.id, issueId));
}

export async function setBoardRowAssignees(db: Db, rowId: string, userIds: string[]) {
  const uniqueIds = [...new Set(userIds)];
  await db
    .delete(schema.boardRowAssignees)
    .where(eq(schema.boardRowAssignees.rowId, rowId));

  for (const userId of uniqueIds) {
    await db.insert(schema.boardRowAssignees).values({ rowId, userId });
  }

  await db
    .update(schema.boardRows)
    .set({ assigneeId: uniqueIds[0] ?? null })
    .where(eq(schema.boardRows.id, rowId));
}

export async function filterValidTeamMemberIds(
  db: Db,
  teamId: string,
  userIds: string[],
) {
  if (userIds.length === 0) return [];

  const members = await db
    .select({ userId: schema.teamMembers.userId })
    .from(schema.teamMembers)
    .where(
      and(eq(schema.teamMembers.teamId, teamId), inArray(schema.teamMembers.userId, userIds)),
    );

  const allowed = new Set(members.map((member) => member.userId));
  return userIds.filter((userId) => allowed.has(userId));
}
