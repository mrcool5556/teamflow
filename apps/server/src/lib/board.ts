import { and, asc, eq } from "drizzle-orm";
import {
  DEFAULT_STATUSES,
  generateEntityKey,
  type BoardRowPublic,
  type IssueStatusPublic,
} from "@teamflow/core";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { loadBoardRowAssignees } from "./assignees.js";

export function mapIssueStatus(
  status: typeof schema.issueStatuses.$inferSelect,
): IssueStatusPublic {
  return {
    id: status.id,
    teamId: status.teamId,
    rowId: status.rowId,
    key: status.key,
    name: status.name,
    type: status.type,
    position: status.position,
    color: status.color,
  };
}

export async function mapBoardRow(
  db: Db,
  row: typeof schema.boardRows.$inferSelect,
): Promise<BoardRowPublic> {
  let assigneeName: string | null = null;
  const assignees = await loadBoardRowAssignees(db, row.id);
  if (assignees[0]) {
    assigneeName = assignees[0].name;
  } else if (row.assigneeId) {
    const [assignee] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, row.assigneeId))
      .limit(1);
    assigneeName = assignee?.name ?? null;
  }

  return {
    id: row.id,
    teamId: row.teamId,
    key: row.key,
    name: row.name,
    position: row.position,
    assigneeId: row.assigneeId,
    assigneeName,
    assignees,
    color: row.color,
  };
}

export async function uniqueRowKey(db: Db, teamId: string) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const key = generateEntityKey("row");
    const [existing] = await db
      .select({ id: schema.boardRows.id })
      .from(schema.boardRows)
      .where(and(eq(schema.boardRows.teamId, teamId), eq(schema.boardRows.key, key)))
      .limit(1);
    if (!existing) return key;
  }
  throw new Error("Failed to generate unique row key");
}

export async function uniqueColumnKey(db: Db, teamId: string) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const key = generateEntityKey("col");
    const [existing] = await db
      .select({ id: schema.issueStatuses.id })
      .from(schema.issueStatuses)
      .where(
        and(eq(schema.issueStatuses.teamId, teamId), eq(schema.issueStatuses.key, key)),
      )
      .limit(1);
    if (!existing) return key;
  }
  throw new Error("Failed to generate unique column key");
}

export async function seedDefaultStatusesForRow(
  db: Db,
  teamId: string,
  rowId: string,
) {
  const existing = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.rowId, rowId))
    .limit(1);

  if (existing.length > 0) return;

  for (const status of DEFAULT_STATUSES) {
    await db.insert(schema.issueStatuses).values({
      teamId,
      rowId,
      key: await uniqueColumnKey(db, teamId),
      name: status.name,
      type: status.type,
      position: status.position,
    });
  }
}

export async function getDefaultRowId(db: Db, teamId: string) {
  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.teamId, teamId))
    .orderBy(asc(schema.boardRows.position))
    .limit(1);

  if (row) return row.id;

  const id = crypto.randomUUID();
  await db.insert(schema.boardRows).values({
    id,
    teamId,
    key: await uniqueRowKey(db, teamId),
    name: "Row 1",
    position: 0,
  });
  await seedDefaultStatusesForRow(db, teamId, id);
  return id;
}

export async function createDefaultBoardRow(db: Db, teamId: string, name = "Row 1") {
  const id = crypto.randomUUID();
  await db.insert(schema.boardRows).values({
    id,
    teamId,
    key: await uniqueRowKey(db, teamId),
    name,
    position: 0,
  });
  await seedDefaultStatusesForRow(db, teamId, id);
  return id;
}

export async function createBoardRowWithKey(
  db: Db,
  teamId: string,
  name: string,
  position: number,
) {
  const id = crypto.randomUUID();
  await db.insert(schema.boardRows).values({
    id,
    teamId,
    key: await uniqueRowKey(db, teamId),
    name,
    position,
  });
  await seedDefaultStatusesForRow(db, teamId, id);
  return id;
}

export async function createStatusWithKey(
  db: Db,
  input: {
    teamId: string;
    rowId: string;
    name: string;
    type: string;
    position: number;
  },
) {
  const id = crypto.randomUUID();
  await db.insert(schema.issueStatuses).values({
    id,
    teamId: input.teamId,
    rowId: input.rowId,
    key: await uniqueColumnKey(db, input.teamId),
    name: input.name,
    type: input.type,
    position: input.position,
  });
  return id;
}

export async function countRowIssues(db: Db, rowId: string) {
  const issues = await db
    .select({ id: schema.issues.id })
    .from(schema.issues)
    .where(eq(schema.issues.rowId, rowId));
  return issues.length;
}

export async function countStatusIssues(db: Db, statusId: string) {
  const issues = await db
    .select({ id: schema.issues.id })
    .from(schema.issues)
    .where(eq(schema.issues.statusId, statusId));
  return issues.length;
}
