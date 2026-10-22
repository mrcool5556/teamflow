import { and, eq, inArray } from "drizzle-orm";
import type { Db, DbExecutor } from "@teamflow/db";
import { schema } from "@teamflow/db";
import type { AssigneePublic } from "@teamflow/core";

export async function loadIssueAssignees(db: Db, issueId: string): Promise<AssigneePublic[]> {
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

export async function loadBoardRowAssignees(db: Db, rowId: string): Promise<AssigneePublic[]> {
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

/** Replace an issue's assignees (synchronous so it can run inside db.transaction). */
export function setIssueAssignees(db: DbExecutor, issueId: string, userIds: string[]) {
  const uniqueIds = [...new Set(userIds)];
  db.delete(schema.issueAssignees).where(eq(schema.issueAssignees.issueId, issueId)).run();

  for (const userId of uniqueIds) {
    db.insert(schema.issueAssignees).values({ issueId, userId }).run();
  }

  db.update(schema.issues)
    .set({ assigneeId: uniqueIds[0] ?? null })
    .where(eq(schema.issues.id, issueId))
    .run();
}

/** Replace a board row's assignees (synchronous so it can run inside db.transaction). */
export function setBoardRowAssignees(db: DbExecutor, rowId: string, userIds: string[]) {
  const uniqueIds = [...new Set(userIds)];
  db.delete(schema.boardRowAssignees).where(eq(schema.boardRowAssignees.rowId, rowId)).run();

  for (const userId of uniqueIds) {
    db.insert(schema.boardRowAssignees).values({ rowId, userId }).run();
  }

  db.update(schema.boardRows)
    .set({ assigneeId: uniqueIds[0] ?? null })
    .where(eq(schema.boardRows.id, rowId))
    .run();
}

export function filterValidTeamMemberIds(db: DbExecutor, teamId: string, userIds: string[]) {
  if (userIds.length === 0) return [];

  const members = db
    .select({ userId: schema.teamMembers.userId })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), inArray(schema.teamMembers.userId, userIds)))
    .all();

  const allowed = new Set(members.map((member) => member.userId));
  return userIds.filter((userId) => allowed.has(userId));
}
