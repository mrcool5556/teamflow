import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Db, DbExecutor } from "@teamflow/db";
import { schema } from "@teamflow/db";
import type { AssigneePublic, IssuePublic, ListIssuesInput } from "@teamflow/core";

type IssueRow = typeof schema.issues.$inferSelect;

/**
 * Map issues to their public shape with a fixed number of queries regardless of how many issues
 * there are: statuses, users (creator + legacy assignee), multi-assignees and team keys are each
 * loaded once with IN (...).
 */
export async function mapIssues(
  db: Db,
  issues: IssueRow[],
  teamKeys?: Map<string, string>,
): Promise<IssuePublic[]> {
  if (issues.length === 0) return [];

  const unique = <T>(values: (T | null | undefined)[]) =>
    [...new Set(values.filter((v): v is T => v != null))] as T[];

  const statusIds = unique(issues.map((issue) => issue.statusId));
  const issueIds = issues.map((issue) => issue.id);

  const [statuses, assigneeRows] = await Promise.all([
    db
      .select({ id: schema.issueStatuses.id, name: schema.issueStatuses.name })
      .from(schema.issueStatuses)
      .where(inArray(schema.issueStatuses.id, statusIds)),
    db
      .select({
        issueId: schema.issueAssignees.issueId,
        userId: schema.issueAssignees.userId,
        name: schema.users.name,
      })
      .from(schema.issueAssignees)
      .innerJoin(schema.users, eq(schema.issueAssignees.userId, schema.users.id))
      .where(inArray(schema.issueAssignees.issueId, issueIds)),
  ]);

  const userIds = unique([
    ...issues.map((issue) => issue.creatorId),
    ...issues.map((issue) => issue.assigneeId),
  ]);
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));

  let keys = teamKeys;
  if (!keys) {
    const teams = await db
      .select({ id: schema.teams.id, key: schema.teams.key })
      .from(schema.teams)
      .where(inArray(schema.teams.id, unique(issues.map((issue) => issue.teamId))));
    keys = new Map(teams.map((team) => [team.id, team.key]));
  }

  const statusName = new Map(statuses.map((status) => [status.id, status.name]));
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const assigneesByIssue = new Map<string, AssigneePublic[]>();
  for (const row of assigneeRows) {
    const list = assigneesByIssue.get(row.issueId) ?? [];
    list.push({ userId: row.userId, name: row.name });
    assigneesByIssue.set(row.issueId, list);
  }

  return issues.map((issue) => {
    const assignees = assigneesByIssue.get(issue.id) ?? [];
    const assigneeName =
      assignees[0]?.name ?? (issue.assigneeId ? (userName.get(issue.assigneeId) ?? null) : null);
    return {
      id: issue.id,
      identifier: `${keys!.get(issue.teamId) ?? "ISS"}-${issue.number}`,
      teamId: issue.teamId,
      projectId: issue.projectId,
      rowId: issue.rowId,
      number: issue.number,
      title: issue.title,
      description: issue.description,
      statusId: issue.statusId,
      statusName: statusName.get(issue.statusId) ?? "Unknown",
      priority: issue.priority as IssuePublic["priority"],
      assigneeId: issue.assigneeId,
      assigneeName,
      assignees,
      creatorId: issue.creatorId,
      creatorName: userName.get(issue.creatorId) ?? "Unknown",
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
  });
}

export async function mapIssue(db: Db, issue: IssueRow, teamKey: string): Promise<IssuePublic> {
  const [mapped] = await mapIssues(db, [issue], new Map([[issue.teamId, teamKey]]));
  return mapped!;
}

/**
 * Issues visible to `userId`, filtered in SQL: only teams the user belongs to (a subquery on
 * team_members), not trashed, plus the optional filters. Board ordering is applied in JS so it
 * matches the web client's comparator exactly.
 */
export async function listIssuesForUser(db: Db, userId: string, filters: ListIssuesInput) {
  const memberTeams = db
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.userId, userId));

  const conditions: SQL[] = [
    inArray(schema.issues.teamId, memberTeams),
    isNull(schema.issues.deletedAt),
  ];
  if (filters.teamId) conditions.push(eq(schema.issues.teamId, filters.teamId));
  if (filters.projectId) conditions.push(eq(schema.issues.projectId, filters.projectId));
  if (filters.statusId) conditions.push(eq(schema.issues.statusId, filters.statusId));
  if (filters.assigneeId) conditions.push(eq(schema.issues.assigneeId, filters.assigneeId));
  if (filters.rowId) conditions.push(eq(schema.issues.rowId, filters.rowId));
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    conditions.push(
      sql`instr(lower(${schema.issues.title} || ' ' || coalesce(${schema.issues.description}, '')), ${needle}) > 0`,
    );
  }

  const rows = await db
    .select()
    .from(schema.issues)
    .where(and(...conditions));

  rows.sort((a, b) => {
    const rowA = a.rowId ?? "";
    const rowB = b.rowId ?? "";
    if (rowA !== rowB) return rowA.localeCompare(rowB);
    if (a.statusId !== b.statusId) return a.statusId.localeCompare(b.statusId);
    const sortDiff = (a.boardSort ?? 0) - (b.boardSort ?? 0);
    if (sortDiff !== 0) return sortDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return mapIssues(db, rows);
}

export function userHasTeamAccess(db: DbExecutor, userId: string, teamId: string) {
  const member = db
    .select({ id: schema.teamMembers.id })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.teamId, teamId)))
    .get();
  return Boolean(member);
}

export async function getTeamKey(db: Db, teamId: string) {
  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1);
  return team?.key ?? "ISS";
}

export async function getDoneStatusId(db: Db, rowId: string) {
  const statuses = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.rowId, rowId));

  return statuses.find((s) => s.type === "done")?.id ?? statuses.find((s) => s.name === "Done")?.id;
}
