import { and, eq } from "drizzle-orm";
import {
  COLUMN_REF_PATTERN,
  ROW_REF_PATTERN,
  parseIssueRef,
  type ResolvedRef,
} from "@teamflow/core";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import { getTeamKey, mapIssue } from "./issues.js";
import { mapBoardRow, mapIssueStatus } from "./board.js";

export async function resolveTeamRef(
  db: Db,
  teamId: string,
  rawRef: string,
): Promise<ResolvedRef | null> {
  const ref = rawRef.trim();
  if (!ref) return null;

  const issueMatch = parseIssueRef(ref);
  if (issueMatch) {
    const teamKey = await getTeamKey(db, teamId);
    if (issueMatch.teamKey !== teamKey.toUpperCase()) return null;

    const [issue] = await db
      .select()
      .from(schema.issues)
      .where(
        and(eq(schema.issues.teamId, teamId), eq(schema.issues.number, issueMatch.number)),
      )
      .limit(1);

    if (!issue) return null;

    return {
      type: "issue",
      ref: `${teamKey}-${issue.number}`,
      issueId: issue.id,
      identifier: `${teamKey}-${issue.number}`,
    };
  }

  if (ROW_REF_PATTERN.test(ref)) {
    const [row] = await db
      .select()
      .from(schema.boardRows)
      .where(and(eq(schema.boardRows.teamId, teamId), eq(schema.boardRows.key, ref)))
      .limit(1);

    if (!row) return null;

    return {
      type: "row",
      ref: row.key,
      rowId: row.id,
      rowKey: row.key,
      rowName: row.name,
    };
  }

  if (COLUMN_REF_PATTERN.test(ref)) {
    const [status] = await db
      .select()
      .from(schema.issueStatuses)
      .where(
        and(eq(schema.issueStatuses.teamId, teamId), eq(schema.issueStatuses.key, ref)),
      )
      .limit(1);

    if (!status) return null;

    const [row] = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.id, status.rowId))
      .limit(1);

    if (!row) return null;

    return {
      type: "column",
      ref: status.key,
      statusId: status.id,
      columnKey: status.key,
      columnName: status.name,
      rowId: row.id,
      rowKey: row.key,
      rowName: row.name,
    };
  }

  return null;
}

export async function resolveTeamRefDetailed(
  db: Db,
  teamId: string,
  rawRef: string,
) {
  const resolved = await resolveTeamRef(db, teamId, rawRef);
  if (!resolved) return null;

  if (resolved.type === "issue") {
    const [issue] = await db
      .select()
      .from(schema.issues)
      .where(eq(schema.issues.id, resolved.issueId))
      .limit(1);
    if (!issue) return null;
    const teamKey = await getTeamKey(db, teamId);
    return {
      resolved,
      issue: await mapIssue(db, issue, teamKey),
    };
  }

  if (resolved.type === "row") {
    const [row] = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.id, resolved.rowId))
      .limit(1);
    if (!row) return null;
    return {
      resolved,
      row: await mapBoardRow(db, row),
    };
  }

  const [status] = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.id, resolved.statusId))
    .limit(1);
  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, resolved.rowId))
    .limit(1);
  if (!status || !row) return null;

  return {
    resolved,
    status: mapIssueStatus(status),
    row: await mapBoardRow(db, row),
  };
}
