import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  DEFAULT_STATUSES,
  generateEntityKey,
  type BoardRowPublic,
  type IssueStatusPublic,
} from "@teamflow/core";
import type { Db, DbExecutor } from "@teamflow/db";
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

/*
 * The helpers below are synchronous (.get / .all / .run) so they can run inside
 * db.transaction(), which better-sqlite3 requires to be synchronous. They accept the database or
 * a transaction handle; awaiting them from async code is harmless.
 */

export function uniqueRowKey(db: DbExecutor, teamId: string) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const key = generateEntityKey("row");
    const existing = db
      .select({ id: schema.boardRows.id })
      .from(schema.boardRows)
      .where(and(eq(schema.boardRows.teamId, teamId), eq(schema.boardRows.key, key)))
      .get();
    if (!existing) return key;
  }
  throw new Error("Failed to generate unique row key");
}

export function uniqueColumnKey(db: DbExecutor, teamId: string) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const key = generateEntityKey("col");
    const existing = db
      .select({ id: schema.issueStatuses.id })
      .from(schema.issueStatuses)
      .where(and(eq(schema.issueStatuses.teamId, teamId), eq(schema.issueStatuses.key, key)))
      .get();
    if (!existing) return key;
  }
  throw new Error("Failed to generate unique column key");
}

export function seedDefaultStatusesForRow(db: DbExecutor, teamId: string, rowId: string) {
  const existing = db
    .select({ id: schema.issueStatuses.id })
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.rowId, rowId))
    .get();

  if (existing) return;

  for (const status of DEFAULT_STATUSES) {
    db.insert(schema.issueStatuses)
      .values({
        teamId,
        rowId,
        key: uniqueColumnKey(db, teamId),
        name: status.name,
        type: status.type,
        position: status.position,
      })
      .run();
  }
}

export function createBoardRowWithKey(
  db: DbExecutor,
  teamId: string,
  name: string,
  position: number,
) {
  const id = crypto.randomUUID();
  db.insert(schema.boardRows)
    .values({ id, teamId, key: uniqueRowKey(db, teamId), name, position })
    .run();
  seedDefaultStatusesForRow(db, teamId, id);
  return id;
}

export function createDefaultBoardRow(db: DbExecutor, teamId: string, name = "Row 1") {
  return createBoardRowWithKey(db, teamId, name, 0);
}

/** The first row on the team board, creating "Row 1" (with default columns) when there is none. */
export function getDefaultRowId(db: DbExecutor, teamId: string) {
  const row = db
    .select({ id: schema.boardRows.id })
    .from(schema.boardRows)
    .where(eq(schema.boardRows.teamId, teamId))
    .orderBy(asc(schema.boardRows.position))
    .get();

  if (row) return row.id;
  return createDefaultBoardRow(db, teamId);
}

export function createStatusWithKey(
  db: DbExecutor,
  input: {
    teamId: string;
    rowId: string;
    name: string;
    type: string;
    position: number;
  },
) {
  const id = crypto.randomUUID();
  db.insert(schema.issueStatuses)
    .values({
      id,
      teamId: input.teamId,
      rowId: input.rowId,
      key: uniqueColumnKey(db, input.teamId),
      name: input.name,
      type: input.type,
      position: input.position,
    })
    .run();
  return id;
}

/** Rewrite positions 0..n-1 in the given order (call inside a transaction). */
export function writeRowPositions(db: DbExecutor, rowIds: string[]) {
  rowIds.forEach((id, index) => {
    db.update(schema.boardRows).set({ position: index }).where(eq(schema.boardRows.id, id)).run();
  });
}

/** Rewrite column positions 0..n-1 in the given order (call inside a transaction). */
export function writeStatusPositions(db: DbExecutor, statusIds: string[]) {
  statusIds.forEach((id, index) => {
    db.update(schema.issueStatuses)
      .set({ position: index })
      .where(eq(schema.issueStatuses.id, id))
      .run();
  });
}

export async function countRowIssues(db: Db, rowId: string) {
  const issues = await db
    .select({ id: schema.issues.id })
    .from(schema.issues)
    .where(and(eq(schema.issues.rowId, rowId), isNull(schema.issues.deletedAt)));
  return issues.length;
}

export async function countStatusIssues(db: Db, statusId: string) {
  const issues = await db
    .select({ id: schema.issues.id })
    .from(schema.issues)
    .where(and(eq(schema.issues.statusId, statusId), isNull(schema.issues.deletedAt)));
  return issues.length;
}

/** Hard-delete trashed issues still pointing at a column (blocks FK on column removal). */
export function purgeTrashedIssuesForStatus(db: DbExecutor, statusId: string) {
  db.delete(schema.issues)
    .where(and(eq(schema.issues.statusId, statusId), isNotNull(schema.issues.deletedAt)))
    .run();
}

/** Hard-delete trashed issues still pointing at a row or its columns (blocks FK on row removal). */
export function purgeTrashedIssuesForRow(db: DbExecutor, rowId: string) {
  const statusIds = db
    .select({ id: schema.issueStatuses.id })
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.rowId, rowId))
    .all()
    .map((status) => status.id);

  if (statusIds.length > 0) {
    db.delete(schema.issues)
      .where(and(inArray(schema.issues.statusId, statusIds), isNotNull(schema.issues.deletedAt)))
      .run();
  }

  db.delete(schema.issues)
    .where(and(eq(schema.issues.rowId, rowId), isNotNull(schema.issues.deletedAt)))
    .run();
}
