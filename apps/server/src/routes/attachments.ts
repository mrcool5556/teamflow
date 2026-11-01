import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { linkAttachmentSchema, moveAttachmentSchema } from "@teamflow/core";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { assertTeamAccess, loadTeam, requirePermission } from "../middleware/team.js";
import { userHasTeamAccess } from "../lib/issues.js";
import {
  deleteIssueAttachment,
  deleteRowAttachment,
  getAttachmentForDownload,
  getAttachmentLimits,
  getFileTeamId,
  linkFileToIssue,
  linkFileToRow,
  listIssueAttachments,
  listRowAttachments,
  moveIssueAttachment,
  saveIssueAttachment,
  saveRowAttachment,
} from "../lib/attachments.js";
import { createFileRangeResponse } from "../lib/fileStream.js";
import { signStreamToken, streamTokenExpiresAt, verifyStreamToken } from "../lib/streamTokens.js";
import { forbidden, notFound, unauthorized } from "../lib/errors.js";
import { userHasTeamPermission } from "../lib/permissions.js";

/** Issue/row attachments, linking, moving, streaming and downloads. */
const routes = new Hono<AppEnv>();

/**
 * Resolve an attachment from a short-lived stream token (`?token=`), for URLs the browser loads
 * itself (video element, download manager) and so cannot send a Bearer header. The token must
 * name this attachment, and its user must still have access to the attachment's team.
 */
async function attachmentFromToken(linkId: string, token: string | undefined) {
  if (!token) throw unauthorized("Missing file token");
  let verified: { userId: string; linkId: string };
  try {
    verified = await verifyStreamToken(token);
  } catch {
    throw unauthorized("Invalid or expired file token");
  }
  if (verified.linkId !== linkId) throw forbidden("File token is for another attachment");
  const row = await getAttachmentForDownload(db, linkId);
  if (!row) throw notFound("Attachment not found");
  if (!(await userHasTeamAccess(db, verified.userId, row.teamId))) {
    throw forbidden("Team access denied");
  }
  return row;
}

routes.get(
  "/issues/:issueId/attachments",
  requireAuth,
  validateParams,
  loadTeam("issue"),
  async (c) => {
    const issue = c.var.issue;
    const issueId = issue.id;

    const attachments = await listIssueAttachments(db, issueId);
    return c.json({ attachments, limits: getAttachmentLimits() });
  },
);

routes.post(
  "/issues/:issueId/attachments",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  requirePermission("board.edit"),
  async (c) => {
    const auth = c.var.auth;

    const issue = c.var.issue;
    const issueId = issue.id;

    const body = await c.req.parseBody();
    const raw = body.file;
    const file = Array.isArray(raw) ? raw[0] : raw;
    if (!(file instanceof File)) {
      return c.json({ error: "Missing file field" }, 400);
    }

    const attachment = await saveIssueAttachment(db, issueId, auth.userId, file);
    return c.json({ attachment }, 201);
  },
);

routes.get("/rows/:rowId/attachments", requireAuth, validateParams, loadTeam("row"), async (c) => {
  const row = c.var.row;
  const rowId = row.id;

  const attachments = await listRowAttachments(db, rowId);
  return c.json({ attachments, limits: getAttachmentLimits() });
});

routes.post(
  "/rows/:rowId/attachments",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("row"),
  requirePermission("board.edit"),
  async (c) => {
    const auth = c.var.auth;

    const row = c.var.row;
    const rowId = row.id;

    const body = await c.req.parseBody();
    const raw = body.file;
    const file = Array.isArray(raw) ? raw[0] : raw;
    if (!(file instanceof File)) {
      return c.json({ error: "Missing file field" }, 400);
    }

    const attachment = await saveRowAttachment(db, rowId, auth.userId, file);
    return c.json({ attachment }, 201);
  },
);

routes.delete(
  "/rows/:rowId/attachments/:id",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("row"),
  requirePermission("board.edit"),
  async (c) => {
    const row = c.var.row;
    const rowId = row.id;
    const attachmentId = c.req.param("id");

    const deleted = await deleteRowAttachment(db, rowId, attachmentId);
    if (!deleted) return c.json({ error: "Attachment not found" }, 404);

    return c.body(null, 204);
  },
);

routes.post(
  "/rows/:rowId/attachments/link",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("row"),
  requirePermission("board.edit"),
  async (c) => {
    const row = c.var.row;
    const rowId = row.id;
    const body = await parseBody(c, linkAttachmentSchema);

    const fileTeamId = await getFileTeamId(db, body.fileId);
    if (!fileTeamId || fileTeamId !== row.teamId) {
      return c.json({ error: "File not found on this team" }, 404);
    }

    const attachment = await linkFileToRow(db, rowId, body.fileId);
    return c.json({ attachment }, 201);
  },
);

routes.post(
  "/issues/:issueId/attachments/:id/move",
  requireAuth,
  requireWrite,
  validateParams,
  async (c) => {
    const auth = c.var.auth;

    const issueId = c.req.param("issueId");
    const linkId = c.req.param("id");
    const body = await parseBody(c, moveAttachmentSchema);

    const [sourceIssue] = await db
      .select()
      .from(schema.issues)
      .where(eq(schema.issues.id, issueId))
      .limit(1);
    const [targetIssue] = await db
      .select()
      .from(schema.issues)
      .where(eq(schema.issues.id, body.targetIssueId))
      .limit(1);

    if (!sourceIssue || !targetIssue) {
      return c.json({ error: "Issue not found" }, 404);
    }
    if (sourceIssue.teamId !== targetIssue.teamId) {
      return c.json({ error: "Issues must be on the same team" }, 400);
    }
    await assertTeamAccess(auth, sourceIssue.teamId);
    if (!(await userHasTeamPermission(db, auth.userId, sourceIssue.teamId, "board.edit"))) {
      throw forbidden("Permission denied");
    }

    const attachment = await moveIssueAttachment(db, linkId, issueId, body.targetIssueId);
    return c.json({ attachment });
  },
);

routes.post(
  "/issues/:issueId/attachments/link",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  requirePermission("board.edit"),
  async (c) => {
    const issue = c.var.issue;
    const issueId = issue.id;
    const body = await parseBody(c, linkAttachmentSchema);

    const fileTeamId = await getFileTeamId(db, body.fileId);
    if (!fileTeamId || fileTeamId !== issue.teamId) {
      return c.json({ error: "File not found on this team" }, 404);
    }

    const attachment = await linkFileToIssue(db, issueId, body.fileId);
    return c.json({ attachment }, 201);
  },
);

routes.post(
  "/attachments/:id/stream-token",
  requireAuth,
  validateParams,
  loadTeam("attachment"),
  async (c) => {
    const auth = c.var.auth;

    const linkId = c.req.param("id");
    const row = c.var.attachment;
    if (!row.public.canStream) {
      return c.json({ error: "This file cannot be streamed" }, 400);
    }
    const token = await signStreamToken(linkId, auth.userId);
    return c.json({
      token,
      expiresAt: streamTokenExpiresAt(),
      streamUrl: `/attachments/${linkId}/stream?token=${encodeURIComponent(token)}`,
    });
  },
);

routes.get("/attachments/:id/stream", validateParams, async (c) => {
  const row = await attachmentFromToken(c.req.param("id"), c.req.query("token"));

  try {
    return await createFileRangeResponse(row.fullPath, {
      mimeType: row.mimeType,
      filename: row.filename,
      inline: true,
      rangeHeader: c.req.header("range"),
    });
  } catch {
    return c.json({ error: "File missing on server" }, 404);
  }
});

/**
 * A short-lived token so the browser can download the file itself (its download manager shows
 * progress and writes to disk) via `GET /attachments/:id/download?token=`. Works for every file
 * type, unlike the stream token, which is only issued for streamable media.
 */
routes.post(
  "/attachments/:id/download-token",
  requireAuth,
  validateParams,
  loadTeam("attachment"),
  async (c) => {
    const linkId = c.req.param("id");
    const token = await signStreamToken(linkId, c.var.auth.userId);
    return c.json({
      token,
      expiresAt: streamTokenExpiresAt(),
      downloadUrl: `/attachments/${linkId}/download?token=${encodeURIComponent(token)}`,
    });
  },
);

function downloadResponse(
  row: { fullPath: string; mimeType: string; filename: string },
  rangeHeader: string | undefined,
) {
  return createFileRangeResponse(row.fullPath, {
    mimeType: row.mimeType,
    filename: row.filename,
    inline: false,
    rangeHeader,
  }).catch(() => {
    throw notFound("File missing on server");
  });
}

/** Bearer auth, or `?token=` from download-token / stream-token for browser-driven downloads. */
routes.get(
  "/attachments/:id/download",
  validateParams,
  async (c, next) => {
    const token = c.req.query("token");
    if (token === undefined) return next();
    const row = await attachmentFromToken(c.req.param("id"), token);
    return downloadResponse(row, c.req.header("range"));
  },
  requireAuth,
  loadTeam("attachment"),
  async (c) => downloadResponse(c.var.attachment, c.req.header("range")),
);

routes.delete(
  "/issues/:issueId/attachments/:id",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  requirePermission("board.edit"),
  async (c) => {
    const issue = c.var.issue;
    const issueId = issue.id;
    const attachmentId = c.req.param("id");

    const deleted = await deleteIssueAttachment(db, issueId, attachmentId);
    if (!deleted) return c.json({ error: "Attachment not found" }, 404);

    return c.body(null, 204);
  },
);

export { routes as attachmentsRoutes };
