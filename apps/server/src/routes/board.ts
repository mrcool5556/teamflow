import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import {
  createBoardRowSchema,
  createStatusSchema,
  updateBoardRowSchema,
  updateStatusSchema,
} from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam } from "../middleware/team.js";
import {
  countRowIssues,
  countStatusIssues,
  createBoardRowWithKey,
  createDefaultBoardRow,
  createStatusWithKey,
  mapBoardRow,
  mapIssueStatus,
  purgeTrashedIssuesForRow,
  purgeTrashedIssuesForStatus,
} from "../lib/board.js";
import { filterValidTeamMemberIds, setBoardRowAssignees } from "../lib/assignees.js";

/** Board rows and columns (statuses). */
const routes = new Hono<AppEnv>();

routes.get("/teams/:teamId/statuses", requireAuth, validateParams, loadTeam(), async (c) => {
  const teamId = c.var.teamId;

  const statuses = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.teamId, teamId));

  statuses.sort((a, b) => {
    if (a.rowId !== b.rowId) return a.rowId.localeCompare(b.rowId);
    return a.position - b.position;
  });
  return c.json({ statuses: statuses.map(mapIssueStatus) });
});

routes.get("/rows/:rowId/statuses", requireAuth, validateParams, loadTeam("row"), async (c) => {
  const row = c.var.row;
  const rowId = row.id;

  const statuses = await db
    .select()
    .from(schema.issueStatuses)
    .where(eq(schema.issueStatuses.rowId, rowId));

  statuses.sort((a, b) => a.position - b.position);
  return c.json({ statuses: statuses.map(mapIssueStatus) });
});

routes.post(
  "/rows/:rowId/statuses",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("row"),
  async (c) => {
    const row = c.var.row;
    const rowId = row.id;

    const body = await parseBody(c, createStatusSchema);

    const existing = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.rowId, rowId));
    const position = existing.length;

    const id = await createStatusWithKey(db, {
      teamId: row.teamId,
      rowId,
      name: body.name,
      type: body.type,
      position,
    });

    const [status] = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.id, id))
      .limit(1);

    return c.json({ status: mapIssueStatus(status!) }, 201);
  },
);

routes.post("/teams/:teamId/statuses", validateParams, async (c) => {
  return c.json(
    {
      error:
        "Columns are per row. Use POST /rows/:rowId/statuses to add a column to a specific row.",
    },
    410,
  );
});

routes.patch(
  "/statuses/:statusId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("status"),
  async (c) => {
    const existing = c.var.status;
    const statusId = existing.id;

    const body = await parseBody(c, updateStatusSchema);

    if (body.name !== undefined) {
      await db
        .update(schema.issueStatuses)
        .set({ name: body.name })
        .where(eq(schema.issueStatuses.id, statusId));
    }

    if (body.color !== undefined) {
      await db
        .update(schema.issueStatuses)
        .set({ color: body.color })
        .where(eq(schema.issueStatuses.id, statusId));
    }

    if (body.position !== undefined) {
      const rowStatuses = await db
        .select()
        .from(schema.issueStatuses)
        .where(eq(schema.issueStatuses.rowId, existing.rowId));
      rowStatuses.sort((a, b) => a.position - b.position);

      const fromIndex = rowStatuses.findIndex((status) => status.id === statusId);
      if (fromIndex === -1) {
        return c.json({ error: "Status not found" }, 404);
      }

      const targetIndex = Math.min(body.position, rowStatuses.length - 1);
      const [moved] = rowStatuses.splice(fromIndex, 1);
      rowStatuses.splice(targetIndex, 0, moved!);

      for (let index = 0; index < rowStatuses.length; index += 1) {
        await db
          .update(schema.issueStatuses)
          .set({ position: index })
          .where(eq(schema.issueStatuses.id, rowStatuses[index]!.id));
      }
    }

    const [status] = await db
      .select()
      .from(schema.issueStatuses)
      .where(eq(schema.issueStatuses.id, statusId))
      .limit(1);

    return c.json({ status: mapIssueStatus(status!) });
  },
);

routes.delete(
  "/statuses/:statusId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("status"),
  async (c) => {
    const existing = c.var.status;
    const statusId = existing.id;

    const issueCount = await countStatusIssues(db, statusId);
    if (issueCount > 0) {
      return c.json({ error: "Column has issues — move or delete them first" }, 409);
    }

    await purgeTrashedIssuesForStatus(db, statusId);

    await db.delete(schema.issueStatuses).where(eq(schema.issueStatuses.id, statusId));

    return c.body(null, 204);
  },
);

routes.get("/teams/:teamId/rows", requireAuth, validateParams, loadTeam(), async (c) => {
  const teamId = c.var.teamId;

  let rows = await db.select().from(schema.boardRows).where(eq(schema.boardRows.teamId, teamId));

  if (rows.length === 0) {
    await createDefaultBoardRow(db, teamId);
    rows = await db.select().from(schema.boardRows).where(eq(schema.boardRows.teamId, teamId));
  }

  rows.sort((a, b) => a.position - b.position);
  return c.json({ rows: await Promise.all(rows.map((row) => mapBoardRow(db, row))) });
});

routes.post(
  "/teams/:teamId/rows",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  async (c) => {
    const teamId = c.var.teamId;

    const body = await parseBody(c, createBoardRowSchema);

    const existing = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.teamId, teamId));
    const position = existing.length;

    const id = await createBoardRowWithKey(db, teamId, body.name, position);

    const [row] = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.id, id))
      .limit(1);

    return c.json({ row: await mapBoardRow(db, row!) }, 201);
  },
);

routes.patch(
  "/rows/:rowId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("row"),
  async (c) => {
    const existing = c.var.row;
    const rowId = existing.id;

    const body = await parseBody(c, updateBoardRowSchema);

    if (
      body.name === undefined &&
      body.position === undefined &&
      body.assigneeId === undefined &&
      body.assigneeIds === undefined &&
      body.color === undefined
    ) {
      return c.json({ error: "No updates provided" }, 400);
    }

    if (body.name !== undefined) {
      await db
        .update(schema.boardRows)
        .set({ name: body.name })
        .where(eq(schema.boardRows.id, rowId));
    }

    if (body.assigneeIds !== undefined) {
      const validIds = await filterValidTeamMemberIds(db, existing.teamId, body.assigneeIds);
      await setBoardRowAssignees(db, rowId, validIds);
    } else if (body.assigneeId !== undefined) {
      const validIds =
        body.assigneeId === null
          ? []
          : await filterValidTeamMemberIds(db, existing.teamId, [body.assigneeId]);
      await setBoardRowAssignees(db, rowId, validIds);
    }

    if (body.color !== undefined) {
      await db
        .update(schema.boardRows)
        .set({ color: body.color })
        .where(eq(schema.boardRows.id, rowId));
    }

    if (body.position !== undefined) {
      const teamRows = await db
        .select()
        .from(schema.boardRows)
        .where(eq(schema.boardRows.teamId, existing.teamId));
      teamRows.sort((a, b) => a.position - b.position);

      const fromIndex = teamRows.findIndex((row) => row.id === rowId);
      if (fromIndex === -1) {
        return c.json({ error: "Row not found" }, 404);
      }

      const targetIndex = Math.min(body.position, teamRows.length - 1);
      const [moved] = teamRows.splice(fromIndex, 1);
      teamRows.splice(targetIndex, 0, moved);

      for (let index = 0; index < teamRows.length; index += 1) {
        await db
          .update(schema.boardRows)
          .set({ position: index })
          .where(eq(schema.boardRows.id, teamRows[index]!.id));
      }
    }

    const [row] = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.id, rowId))
      .limit(1);

    return c.json({ row: await mapBoardRow(db, row!) });
  },
);

routes.delete(
  "/rows/:rowId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("row"),
  async (c) => {
    const existing = c.var.row;
    const rowId = existing.id;

    const teamRows = await db
      .select()
      .from(schema.boardRows)
      .where(eq(schema.boardRows.teamId, existing.teamId));

    if (teamRows.length <= 1) {
      return c.json({ error: "Cannot delete the last row on the board" }, 409);
    }

    const issueCount = await countRowIssues(db, rowId);
    if (issueCount > 0) {
      return c.json({ error: "Row has issues — move or delete them first" }, 409);
    }

    await purgeTrashedIssuesForRow(db, rowId);

    await db.delete(schema.boardRows).where(eq(schema.boardRows.id, rowId));

    const remaining = teamRows
      .filter((row) => row.id !== rowId)
      .sort((a, b) => a.position - b.position);

    for (let index = 0; index < remaining.length; index += 1) {
      await db
        .update(schema.boardRows)
        .set({ position: index })
        .where(eq(schema.boardRows.id, remaining[index]!.id));
    }

    return c.body(null, 204);
  },
);

export { routes as boardRoutes };
