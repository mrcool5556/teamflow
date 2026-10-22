import { eq } from "drizzle-orm";
import { schema } from "@teamflow/db";
import { db } from "../db.js";

/** Resolve an id against its table and confirm it belongs to `teamId`. Null when it does not. */
export async function rowBelongsToTeam(rowId: string, teamId: string) {
  const [row] = await db
    .select()
    .from(schema.boardRows)
    .where(eq(schema.boardRows.id, rowId))
    .limit(1);
  return row && row.teamId === teamId ? row : null;
}

export async function projectBelongsToTeam(projectId: string, teamId: string) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  return project && project.teamId === teamId ? project : null;
}

export async function statusBelongsToTeam(statusId: string, teamId: string) {
  const [status] = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.id, statusId))
    .limit(1);
  return status && status.teamId === teamId ? status : null;
}
