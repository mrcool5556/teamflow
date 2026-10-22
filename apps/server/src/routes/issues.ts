import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody, parseQuery } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { rowBelongsToTeam, projectBelongsToTeam, statusBelongsToTeam } from "../lib/ownership.js";
import { createIssueSchema, listIssuesSchema, updateIssueSchema } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { assertTeamAccess, loadTeam, requirePermission } from "../middleware/team.js";
import { getDefaultRowId } from "../lib/board.js";
import { filterValidTeamMemberIds, setIssueAssignees } from "../lib/assignees.js";
import { logActivity } from "../lib/auth.js";
import { getDoneStatusId, getTeamKey, listIssuesForUser, mapIssue } from "../lib/issues.js";
import { forbidden } from "../lib/errors.js";
import { userHasTeamPermission } from "../lib/permissions.js";

/** Issues: list, read, create, update, complete, trash, restore. */
const routes = new Hono<AppEnv>();

routes.get("/issues", requireAuth, async (c) => {
  const auth = c.var.auth;

  const filters = parseQuery(c, listIssuesSchema);

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

routes.get("/issues/:id", requireAuth, validateParams, loadTeam("issue"), async (c) => {
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

  const body = await parseBody(c, createIssueSchema);

  await assertTeamAccess(auth, body.teamId);
  if (!(await userHasTeamPermission(db, auth.userId, body.teamId, "board.edit"))) {
    throw forbidden("Permission denied");
  }

  if (auth.patTeamId && auth.patTeamId !== body.teamId) {
    return c.json({ error: "Token restricted to a different team" }, 403);
  }

  const [team] = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, body.teamId))
    .limit(1);

  if (!team) return c.json({ error: "Team not found" }, 404);

  // Every referenced entity must belong to the issue's team (no cross-team references).
  if (body.rowId && !(await rowBelongsToTeam(body.rowId, body.teamId))) {
    return c.json({ error: "Row does not belong to this team" }, 400);
  }
  if (body.projectId && !(await projectBelongsToTeam(body.projectId, body.teamId))) {
    return c.json({ error: "Project does not belong to this team" }, 400);
  }
  if (body.assigneeId) {
    const valid = await filterValidTeamMemberIds(db, body.teamId, [body.assigneeId]);
    if (valid.length === 0) {
      return c.json({ error: "Assignee is not a member of this team" }, 400);
    }
  }

  let statusId = body.statusId;
  const rowId = body.rowId ?? (await getDefaultRowId(db, body.teamId));

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
    const status = await statusBelongsToTeam(statusId, body.teamId);
    if (!status || status.rowId !== rowId) {
      return c.json({ error: "Status does not belong to this row" }, 400);
    }
  }

  if (!statusId) {
    return c.json({ error: "No columns configured for this row" }, 400);
  }

  const issueId = crypto.randomUUID();
  const now = new Date().toISOString();
  const cellStatusId = statusId;

  // Number allocation, insert and activity are one transaction; UNIQUE(team_id, number) backs it.
  const issue = db.transaction((tx) => {
    const counter = tx
      .update(schema.teams)
      .set({ issueCounter: sql`${schema.teams.issueCounter} + 1` })
      .where(eq(schema.teams.id, team.id))
      .returning({ issueCounter: schema.teams.issueCounter })
      .get();

    const boardSort = tx
      .select({ id: schema.issues.id })
      .from(schema.issues)
      .where(
        and(
          eq(schema.issues.teamId, body.teamId),
          eq(schema.issues.statusId, cellStatusId),
          eq(schema.issues.rowId, rowId),
        ),
      )
      .all().length;

    tx.insert(schema.issues)
      .values({
        id: issueId,
        teamId: body.teamId,
        projectId: body.projectId,
        rowId,
        number: counter!.issueCounter,
        title: body.title,
        description: body.description,
        statusId: cellStatusId,
        priority: body.priority,
        assigneeId: body.assigneeId,
        creatorId: auth.userId,
        dueDate: body.dueDate,
        boardSort,
        updatedAt: now,
      })
      .run();

    logActivity(tx, {
      issueId,
      userId: auth.userId,
      action: "issue.created",
      metadata: { title: body.title },
      source: auth.source,
    });

    return tx.select().from(schema.issues).where(eq(schema.issues.id, issueId)).get();
  });

  return c.json({ issue: await mapIssue(db, issue!, team.key) }, 201);
});

routes.patch(
  "/issues/:id",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  requirePermission("board.edit"),
  async (c) => {
    const auth = c.var.auth;

    const existing = c.var.issue;
    const id = existing.id;
    const body = await parseBody(c, updateIssueSchema);

    // Referenced entities must belong to the issue's team (no cross-team references).
    if (body.rowId && !(await rowBelongsToTeam(body.rowId, existing.teamId))) {
      return c.json({ error: "Row does not belong to this team" }, 400);
    }
    if (body.projectId && !(await projectBelongsToTeam(body.projectId, existing.teamId))) {
      return c.json({ error: "Project does not belong to this team" }, 400);
    }

    const updates: Partial<typeof schema.issues.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.projectId !== undefined) updates.projectId = body.projectId;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.assigneeIds !== undefined) {
      const validIds = await filterValidTeamMemberIds(db, existing.teamId, body.assigneeIds);
      await setIssueAssignees(db, id, validIds);
    } else if (body.assigneeId !== undefined) {
      const validIds =
        body.assigneeId === null
          ? []
          : await filterValidTeamMemberIds(db, existing.teamId, [body.assigneeId]);
      await setIssueAssignees(db, id, validIds);
    }
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
    if (body.rowId !== undefined) updates.rowId = body.rowId;

    const nextRowId = body.rowId ?? existing.rowId;
    if (body.statusId !== undefined) {
      const status = await statusBelongsToTeam(body.statusId, existing.teamId);
      if (!status) return c.json({ error: "Status not found" }, 404);
      if (nextRowId && status.rowId !== nextRowId) {
        return c.json({ error: "Status does not belong to this row" }, 400);
      }
      updates.statusId = body.statusId;
      if (status.type === "done") {
        updates.completedAt = new Date().toISOString();
      } else {
        updates.completedAt = null;
      }
    } else if (body.rowId !== undefined && body.rowId !== existing.rowId && body.rowId) {
      const [currentStatus] = await db
        .select()
        .from(schema.issueStatuses)
        .where(eq(schema.issueStatuses.id, existing.statusId))
        .limit(1);

      const targetStatuses = await db
        .select()
        .from(schema.issueStatuses)
        .where(eq(schema.issueStatuses.rowId, body.rowId));

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

    if (body.boardSort !== undefined) updates.boardSort = body.boardSort;
    if (body.timerActiveAt !== undefined) {
      updates.timerActiveAt = body.timerActiveAt;
    }
    if (body.timerElapsedSec !== undefined) {
      updates.timerElapsedSec = body.timerElapsedSec;
    }
    if (body.timerTargetSec !== undefined) {
      updates.timerTargetSec = body.timerTargetSec;
    }
    if (body.color !== undefined) {
      updates.color = body.color;
    }

    await db.update(schema.issues).set(updates).where(eq(schema.issues.id, id));

    const [issue] = await db.select().from(schema.issues).where(eq(schema.issues.id, id)).limit(1);

    const teamKey = await getTeamKey(db, issue!.teamId);

    await logActivity(db, {
      issueId: id,
      userId: auth.userId,
      action: "issue.updated",
      metadata: body,
      source: auth.source,
    });

    return c.json({ issue: await mapIssue(db, issue!, teamKey) });
  },
);

routes.post(
  "/issues/:id/complete",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  requirePermission("board.edit"),
  async (c) => {
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
  },
);

routes.delete(
  "/issues/:id",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  requirePermission("board.edit"),
  async (c) => {
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
  },
);

routes.post(
  "/issues/:id/restore",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  requirePermission("board.edit"),
  async (c) => {
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
  },
);

export { routes as issuesRoutes };
