import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { TeamPermission } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { db } from "../db.js";
import type { AuthContext } from "../lib/auth.js";
import { getAttachmentForDownload } from "../lib/attachments.js";
import { getUploadSession } from "../lib/chunkedUpload.js";
import { forbidden, notFound } from "../lib/errors.js";
import { userHasTeamAccess } from "../lib/issues.js";
import { userHasTeamPermission } from "../lib/permissions.js";
import type { AppEnv } from "../types.js";

export type BoardRowRow = typeof schema.boardRows.$inferSelect;
export type IssueRow = typeof schema.issues.$inferSelect;
export type IssueStatusRow = typeof schema.issueStatuses.$inferSelect;
export type UploadSessionRow = NonNullable<Awaited<ReturnType<typeof getUploadSession>>>;
export type AttachmentRow = NonNullable<Awaited<ReturnType<typeof getAttachmentForDownload>>>;

/**
 * Set by loadTeam(source). `teamId` is always set; the entity variable matching the source is
 * set too (loadTeam("row") sets `row`, and so on). The others are absent at runtime.
 */
export type TeamVariables = {
  teamId: string;
  row: BoardRowRow;
  issue: IssueRow;
  status: IssueStatusRow;
  uploadSession: UploadSessionRow;
  attachment: AttachmentRow;
};

/** A team-scoped PAT may only touch the team it was issued for. */
export function patTeamMismatch(auth: AuthContext, teamId: string) {
  return Boolean(auth.patTeamId) && auth.patTeamId !== teamId;
}

/**
 * The single access check for every route that resolves a team (directly or via a row, issue,
 * column, file or upload session): membership plus PAT team scope.
 */
export async function canAccessTeam(auth: AuthContext, teamId: string) {
  if (patTeamMismatch(auth, teamId)) return false;
  return userHasTeamAccess(db, auth.userId, teamId);
}

/** canAccessTeam that throws the standard 403 instead of returning false. */
export async function assertTeamAccess(auth: AuthContext, teamId: string) {
  if (!(await canAccessTeam(auth, teamId))) {
    throw forbidden("Team access denied");
  }
}

export type TeamSource = "team" | "row" | "issue" | "status" | "upload" | "attachment";

async function resolveSource(
  source: TeamSource,
  param: (name: string) => string,
): Promise<{ teamId: string; set: Partial<TeamVariables> }> {
  switch (source) {
    case "team": {
      return { teamId: param("teamId"), set: {} };
    }
    case "row": {
      const [row] = await db
        .select()
        .from(schema.boardRows)
        .where(eq(schema.boardRows.id, param("rowId")))
        .limit(1);
      if (!row) throw notFound("Row not found");
      return { teamId: row.teamId, set: { row } };
    }
    case "issue": {
      const id = param("issueId") ?? param("id");
      const [issue] = await db
        .select()
        .from(schema.issues)
        .where(eq(schema.issues.id, id))
        .limit(1);
      if (!issue) throw notFound("Issue not found");
      return { teamId: issue.teamId, set: { issue } };
    }
    case "status": {
      const [status] = await db
        .select()
        .from(schema.issueStatuses)
        .where(eq(schema.issueStatuses.id, param("statusId")))
        .limit(1);
      if (!status) throw notFound("Status not found");
      return { teamId: status.teamId, set: { status } };
    }
    case "upload": {
      const session = await getUploadSession(db, param("sessionId"));
      if (!session) throw notFound("Upload session not found");
      let teamId: string | undefined;
      if (session.issueId) {
        const [issue] = await db
          .select({ teamId: schema.issues.teamId })
          .from(schema.issues)
          .where(eq(schema.issues.id, session.issueId))
          .limit(1);
        teamId = issue?.teamId;
      } else if (session.rowId) {
        const [row] = await db
          .select({ teamId: schema.boardRows.teamId })
          .from(schema.boardRows)
          .where(eq(schema.boardRows.id, session.rowId))
          .limit(1);
        teamId = row?.teamId;
      }
      // An orphaned session (target deleted) is not reachable by anyone.
      if (!teamId) throw forbidden("Team access denied");
      return { teamId, set: { uploadSession: session } };
    }
    case "attachment": {
      const attachment = await getAttachmentForDownload(db, param("id"));
      if (!attachment) throw notFound("Attachment not found");
      return { teamId: attachment.teamId, set: { attachment } };
    }
  }
}

/**
 * Resolve the owning team from the route (`:teamId`, or the entity named by `source`), check
 * membership + PAT scope once, and expose `c.var.teamId` plus the loaded entity. Must follow
 * requireAuth.
 */
export function loadTeam(source: TeamSource = "team") {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { teamId, set } = await resolveSource(source, (name) => c.req.param(name) as string);
    await assertTeamAccess(c.var.auth, teamId);
    c.set("teamId", teamId);
    for (const [key, value] of Object.entries(set)) {
      c.set(key as keyof TeamVariables, value as never);
    }
    await next();
  });
}

/**
 * Require a team permission on c.var.teamId (so it must follow loadTeam). An array means any
 * one of the listed permissions is enough.
 */
export function requirePermission(permission: TeamPermission | TeamPermission[]) {
  const wanted = Array.isArray(permission) ? permission : [permission];
  return createMiddleware<AppEnv>(async (c, next) => {
    const { auth, teamId } = c.var;
    for (const candidate of wanted) {
      if (await userHasTeamPermission(db, auth.userId, teamId, candidate)) {
        await next();
        return;
      }
    }
    throw forbidden("Permission denied");
  });
}
