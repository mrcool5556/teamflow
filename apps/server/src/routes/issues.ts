import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { rowBelongsToTeam, projectBelongsToTeam, statusBelongsToTeam } from "../lib/ownership.js";
import { createIssueSchema, updateIssueSchema } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { assertTeamAccess, loadTeam } from "../middleware/team.js";
import { getDefaultRowId } from "../lib/board.js";
import { filterValidTeamMemberIds, setIssueAssignees } from "../lib/assignees.js";
import { logActivity } from "../lib/auth.js";
import { getDoneStatusId, getTeamKey, listIssuesForUser, mapIssue } from "../lib/issues.js";

/** Issues: list, read, create, update, complete, trash, restore. */
const routes = new Hono<AppEnv>();

routes.get("/issues", requireAuth, async (c) => {
  const auth = c.var.auth;

  const filters = {
    teamId: c.req.query("teamId"),
    projectId: c.req.query("projectId"),
    statusId: c.req.query("statusId"),
    assigneeId: c.req.query("assigneeId"),
    rowId: c.req.query("rowId"),
    search: c.req.query("search"),
  };

  if (auth.patTeamId && filters.teamId && filters.teamId !== auth.patTeamId) {
    return c.json({ error: "Token restricted to a different team" }, 403);
  }

  const effectiveTeamId = auth.patTeamId ?? filters.teamId;
  const issues = await listIssuesForUser(db, auth.userId, {
    ...filters,
    teamId: effectiveTeamId,
  });

  return c.json({ issues });
});

routes.get("/issues/:id", requireAuth, loadTeam("issue"), async (c) => {
  const issue = c.var.issue;
  const id = issue.id;

  const teamKey = await getTeamKey(db, issue.teamId);
  const comments = await db
    .select({
      id: schema.comments.id,
      issueId: schema.comments.issueId,
      authorId: schema.comments.authorId,
      body: schema.comments.body,
      createdAt: schema.comments.createdAt,
      authorName: schema.users.name,
    })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(eq(schema.comments.issueId, id));

  return c.json({
    issue: await mapIssue(db, issue, teamKey),
    comments: comments.map((row) => ({
      id: row.id,
      issueId: row.issueId,
      authorId: row.authorId,
      authorName: row.authorName,
      body: row.body,
      createdAt: row.createdAt,
    })),
  });
});

routes.post("/issues", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const body = createIssueSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  await assertTeamAccess(auth, body.data.teamId);

  if (auth.patTeamId && auth.patTeamId !== body.data.teamId) {
    return c.json({ error: "Token restricted to a different team" }, 403);
  }

  const [team] = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, body.data.teamId))
    .limit(1);

  if (!team) return c.json({ error: "Team not found" }, 404);

  const nextNumber = team.issueCounter + 1;
  await db
    .update(schema.teams)
    .set({ issueCounter: nextNumber })
    .where(eq(schema.teams.id, team.id));

  // Every referenced entity must belong to the issue's team (no cross-team references).
  if (body.data.rowId && !(await rowBelongsToTeam(body.data.rowId, body.data.teamId))) {
    return c.json({ error: "Row does not belong to this team" }, 400);
  }
  if (body.data.projectId && !(await projectBelongsToTeam(body.data.projectId, body.data.teamId))) {
    return c.json({ error: "Project does not belong to this team" }, 400);
  }
  if (body.data.assigneeId) {
    const valid = await filterValidTeamMemberIds(db, body.data.teamId, [body.data.assigneeId]);
    if (valid.length === 0) {
      return c.json({ error: "Assignee is not a member of this team" }, 400);
    }
  }

  let statusId = body.data.statusId;
  const rowId = body.data.rowId ?? (await getDefaultRowId(db, body.data.teamId));

  if (!statusId) {
    const statuses = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.rowId, rowId));
    statusId =
      statuses.find((s) => s.type === "backlog")?.id ??
      statuses.find((s) => s.type === "todo")?.id ??
      statuses[0]?.id;
  } else {
    const status = await statusBelongsToTeam(statusId, body.data.teamId);
    if (!status || status.rowId !== rowId) {
      return c.json({ error: "Status does not belong to this row" }, 400);
    }
  }

  if (!statusId) {
    return c.json({ error: "No columns configured for this row" }, 400);
  }

  const issueId = crypto.randomUUID();
  const now = new Date().toISOString();

  const cellIssues = await db
    .select()
    .from(schema.issues)
    .where(
      and(
        eq(schema.issues.teamId, body.data.teamId),
        eq(schema.issues.statusId, statusId),
        eq(schema.issues.rowId, rowId),
      ),
    );
  const boardSort = cellIssues.length;

  await db.insert(schema.issues).values({
    id: issueId,
    teamId: body.data.teamId,
    projectId: body.data.projectId,
    rowId,
    number: nextNumber,
    title: body.data.title,
    description: body.data.description,
    statusId,
    priority: body.data.priority,
    assigneeId: body.data.assigneeId,
    creatorId: auth.userId,
    dueDate: body.data.dueDate,
    boardSort,
    updatedAt: now,
  });

  const [issue] = await db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId))
    .limit(1);

  await logActivity(db, {
    issueId,
    userId: auth.userId,
    action: "issue.created",
    metadata: { title: body.data.title },
    source: auth.source,
  });

  return c.json({ issue: await mapIssue(db, issue!, team.key) }, 201);
});

routes.patch("/issues/:id", requireAuth, requireWrite, loadTeam("issue"), async (c) => {
  const auth = c.var.auth;

  const existing = c.var.issue;
  const id = existing.id;
  const body = updateIssueSchema.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
  }

  // Referenced entities must belong to the issue's team (no cross-team references).
  if (body.data.rowId && !(await rowBelongsToTeam(body.data.rowId, existing.teamId))) {
    return c.json({ error: "Row does not belong to this team" }, 400);
  }
  if (body.data.projectId && !(await projectBelongsToTeam(body.data.projectId, existing.teamId))) {
    return c.json({ error: "Project does not belong to this team" }, 400);
  }

  const updates: Partial<typeof schema.issues.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.data.title !== undefined) updates.title = body.data.title;
  if (body.data.description !== undefined) updates.description = body.data.description;
  if (body.data.projectId !== undefined) updates.projectId = body.data.projectId;
  if (body.data.priority !== undefined) updates.priority = body.data.priority;
  if (body.data.assigneeIds !== undefined) {
    const validIds = await filterValidTeamMemberIds(db, existing.teamId, body.data.assigneeIds);
    await setIssueAssignees(db, id, validIds);
  } else if (body.data.assigneeId !== undefined) {
    const validIds =
      body.data.assigneeId === null
        ? []
        : await filterValidTeamMemberIds(db, existing.teamId, [body.data.assigneeId]);
    await setIssueAssignees(db, id, validIds);
  }
  if (body.data.dueDate !== undefined) updates.dueDate = body.data.dueDate;
  if (body.data.rowId !== undefined) updates.rowId = body.data.rowId;

  const nextRowId = body.data.rowId ?? existing.rowId;
  if (body.data.statusId !== undefined) {
    const status = await statusBelongsToTeam(body.data.statusId, existing.teamId);
    if (!status) return c.json({ error: "Status not found" }, 404);
    if (nextRowId && status.rowId !== nextRowId) {
      return c.json({ error: "Status does not belong to this row" }, 400);
    }
    updates.statusId = body.data.statusId;
    if (status.type === "done") {
      updates.completedAt = new Date().toISOString();
    } else {
      updates.completedAt = null;
    }
  } else if (
    body.data.rowId !== undefined &&
    body.data.rowId !== existing.rowId &&
    body.data.rowId
  ) {
    const [currentStatus] = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.id, existing.statusId))
      .limit(1);

    const targetStatuses = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.rowId, body.data.rowId));

    const mapped =
      targetStatuses.find((s) => s.type === currentStatus?.type) ??
      targetStatuses.find((s) => s.position === currentStatus?.position) ??
      targetStatuses[0];

    if (!mapped) {
      return c.json({ error: "Target row has no columns configured" }, 400);
    }

    updates.statusId = mapped.id;
    if (mapped.type === "done") {
      updates.completedAt = new Date().toISOString();
    } else {
      updates.completedAt = null;
    }
  }

  if (body.data.boardSort !== undefined) updates.boardSort = body.data.boardSort;
  if (body.data.timerActiveAt !== undefined) {
    updates.timerActiveAt = body.data.timerActiveAt;
  }
  if (body.data.timerElapsedSec !== undefined) {
    updates.timerElapsedSec = body.data.timerElapsedSec;
  }
  if (body.data.timerTargetSec !== undefined) {
    updates.timerTargetSec = body.data.timerTargetSec;
  }
  if (body.data.color !== undefined) {
    updates.color = body.data.color;
  }

  await db.update(schema.issues).set(updates).where(eq(schema.issues.id, id));

  const [issue] = await db.select().from(schema.issues).where(eq(schema.issues.id, id)).limit(1);

  const teamKey = await getTeamKey(db, issue!.teamId);

  await logActivity(db, {
    issueId: id,
    userId: auth.userId,
    action: "issue.updated",
    metadata: body.data,
    source: auth.source,
  });

  return c.json({ issue: await mapIssue(db, issue!, teamKey) });
});

routes.post("/issues/:id/complete", requireAuth, requireWrite, loadTeam("issue"), async (c) => {
  const auth = c.var.auth;

  const existing = c.var.issue;
  const id = existing.id;

  const issueRowId = existing.rowId ?? (await getDefaultRowId(db, existing.teamId));
  const doneStatusId = await getDoneStatusId(db, issueRowId);
  if (!doneStatusId) {
    return c.json({ error: "Done status not configured" }, 400);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.issues)
    .set({
      statusId: doneStatusId,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.issues.id, id));

  const [issue] = await db.select().from(schema.issues).where(eq(schema.issues.id, id)).limit(1);

  const teamKey = await getTeamKey(db, issue!.teamId);

  await logActivity(db, {
    issueId: id,
    userId: auth.userId,
    action: "issue.completed",
    source: auth.source,
  });

  return c.json({ issue: await mapIssue(db, issue!, teamKey) });
});

routes.delete("/issues/:id", requireAuth, requireWrite, loadTeam("issue"), async (c) => {
  const auth = c.var.auth;

  const existing = c.var.issue;
  const id = existing.id;
  if (existing.deletedAt) return c.body(null, 204);

  const now = new Date().toISOString();
  await db
    .update(schema.issues)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(schema.issues.id, id));

  await logActivity(db, {
    userId: auth.userId,
    action: "issue.deleted",
    metadata: { issueId: id },
    source: auth.source,
  });

  return c.body(null, 204);
});

routes.post("/issues/:id/restore", requireAuth, requireWrite, loadTeam("issue"), async (c) => {
  const auth = c.var.auth;

  const existing = c.var.issue;
  const id = existing.id;
  if (!existing.deletedAt) {
    return c.json({ error: "Issue is not in trash" }, 400);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.issues)
    .set({ deletedAt: null, updatedAt: now })
    .where(eq(schema.issues.id, id));

  const [issue] = await db.select().from(schema.issues).where(eq(schema.issues.id, id)).limit(1);

  const teamKey = await getTeamKey(db, issue!.teamId);

  await logActivity(db, {
    issueId: id,
    userId: auth.userId,
    action: "issue.restored",
    source: auth.source,
  });

  return c.json({ issue: await mapIssue(db, issue!, teamKey) });
});

export { routes as issuesRoutes };
