import { and, eq } from "drizzle-orm";
import type { Db } from "@teamflow/db";
import { schema } from "@teamflow/db";
import type { IssuePublic, ListIssuesInput } from "@teamflow/core";
import { loadIssueAssignees } from "./assignees.js";

export async function mapIssue(
  db: Db,
  issue: typeof schema.issues.$inferSelect,
  teamKey: string,
): Promise<IssuePublic> {
  const [status] = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.id, issue.statusId))
    .limit(1);

  const [creator] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, issue.creatorId))
    .limit(1);

  let assigneeName: string | null = null;
  const assignees = await loadIssueAssignees(db, issue.id);
  if (assignees[0]) {
    assigneeName = assignees[0].name;
  } else if (issue.assigneeId) {
    const [assignee] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, issue.assigneeId))
      .limit(1);
    assigneeName = assignee?.name ?? null;
  }

  return {
    id: issue.id,
    identifier: `${teamKey}-${issue.number}`,
    teamId: issue.teamId,
    projectId: issue.projectId,
    rowId: issue.rowId,
    number: issue.number,
    title: issue.title,
    description: issue.description,
    statusId: issue.statusId,
    statusName: status?.name ?? "Unknown",
    priority: issue.priority as IssuePublic["priority"],
    assigneeId: issue.assigneeId,
    assigneeName,
    assignees,
    creatorId: issue.creatorId,
    creatorName: creator?.name ?? "Unknown",
    dueDate: issue.dueDate,
    boardSort: issue.boardSort ?? 0,
    timerActiveAt: issue.timerActiveAt,
    timerElapsedSec: issue.timerElapsedSec ?? 0,
    timerTargetSec: issue.timerTargetSec,
    completedAt: issue.completedAt,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    color: issue.color,
  };
}

export async function listIssuesForUser(
  db: Db,
  userId: string,
  filters: ListIssuesInput,
) {
  const memberships = await db
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, userId));

  const teamIds = memberships.map((m) => m.teamId);
  if (teamIds.length === 0) {
    return [];
  }

  let rows = await db.select().from(schema.issues);

  rows = rows.filter((issue) => {
    if (issue.deletedAt) return false;
    if (!teamIds.includes(issue.teamId)) return false;
    if (filters.teamId && issue.teamId !== filters.teamId) return false;
    if (filters.projectId && issue.projectId !== filters.projectId) return false;
    if (filters.statusId && issue.statusId !== filters.statusId) return false;
    if (filters.assigneeId && issue.assigneeId !== filters.assigneeId) return false;
    if (filters.rowId && issue.rowId !== filters.rowId) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${issue.title} ${issue.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  rows.sort((a, b) => {
    const rowA = a.rowId ?? "";
    const rowB = b.rowId ?? "";
    if (rowA !== rowB) return rowA.localeCompare(rowB);
    if (a.statusId !== b.statusId) return a.statusId.localeCompare(b.statusId);
    const sortDiff = (a.boardSort ?? 0) - (b.boardSort ?? 0);
    if (sortDiff !== 0) return sortDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const teamKeys = new Map<string, string>();
  for (const teamId of new Set(rows.map((r) => r.teamId))) {
    const [team] = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (team) teamKeys.set(teamId, team.key);
  }

  return Promise.all(
    rows.map((issue) => mapIssue(db, issue, teamKeys.get(issue.teamId) ?? "ISS")),
  );
}

export async function userHasTeamAccess(db: Db, userId: string, teamId: string) {
  const [member] = await db
    .select()
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.userId, userId),
        eq(schema.teamMembers.teamId, teamId),
      ),
    )
    .limit(1);
  return Boolean(member);
}

export async function getTeamKey(db: Db, teamId: string) {
  const [team] = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);
  return team?.key ?? "ISS";
}

export async function getDoneStatusId(db: Db, rowId: string) {
  const statuses = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.rowId, rowId));

  return (
    statuses.find((s) => s.type === "done")?.id ??
    statuses.find((s) => s.name === "Done")?.id
  );
}
