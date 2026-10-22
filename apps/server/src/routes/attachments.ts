import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { assertTeamAccess, loadTeam } from "../middleware/team.js";
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

/** Issue/row attachments, linking, moving, streaming and downloads. */
const routes = new Hono<AppEnv>();

function parseMoveAttachment(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const targetIssueId = (body as Record<string, unknown>).targetIssueId;
  if (typeof targetIssueId !== "string" || !targetIssueId) return null;
  return { targetIssueId };
}

function parseLinkAttachment(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const fileId = (body as Record<string, unknown>).fileId;
  if (typeof fileId !== "string" || !fileId) return null;
  return { fileId };
}

routes.get("/issues/:issueId/attachments", requireAuth, loadTeam("issue"), async (c) => {
  const issue = c.var.issue;
  const issueId = issue.id;

  const attachments = await listIssueAttachments(db, issueId);
  return c.json({ attachments, limits: getAttachmentLimits() });
});

routes.post(
  "/issues/:issueId/attachments",
  requireAuth,
  requireWrite,
  loadTeam("issue"),
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

routes.get("/rows/:rowId/attachments", requireAuth, loadTeam("row"), async (c) => {
  const row = c.var.row;
  const rowId = row.id;

  const attachments = await listRowAttachments(db, rowId);
  return c.json({ attachments, limits: getAttachmentLimits() });
});

routes.post("/rows/:rowId/attachments", requireAuth, requireWrite, loadTeam("row"), async (c) => {
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
});

routes.delete(
  "/rows/:rowId/attachments/:id",
  requireAuth,
  requireWrite,
  loadTeam("row"),
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
  loadTeam("row"),
  async (c) => {
    const row = c.var.row;
    const rowId = row.id;
    const body = parseLinkAttachment(await c.req.json());
    if (!body) {
      return c.json({ error: "Invalid input" }, 400);
    }

    const fileTeamId = await getFileTeamId(db, body.fileId);
    if (!fileTeamId || fileTeamId !== row.teamId) {
      return c.json({ error: "File not found on this team" }, 404);
    }

    const attachment = await linkFileToRow(db, rowId, body.fileId);
    return c.json({ attachment }, 201);
  },
);

routes.post("/issues/:issueId/attachments/:id/move", requireAuth, requireWrite, async (c) => {
  const auth = c.var.auth;

  const issueId = c.req.param("issueId");
  const linkId = c.req.param("id");
  const body = parseMoveAttachment(await c.req.json());
  if (!body) {
    return c.json({ error: "Invalid input" }, 400);
  }

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

  const attachment = await moveIssueAttachment(db, linkId, issueId, body.targetIssueId);
  return c.json({ attachment });
});

routes.post(
  "/issues/:issueId/attachments/link",
  requireAuth,
  requireWrite,
  loadTeam("issue"),
  async (c) => {
    const issue = c.var.issue;
    const issueId = issue.id;
    const body = parseLinkAttachment(await c.req.json());
    if (!body) {
      return c.json({ error: "Invalid input" }, 400);
    }

    const fileTeamId = await getFileTeamId(db, body.fileId);
    if (!fileTeamId || fileTeamId !== issue.teamId) {
      return c.json({ error: "File not found on this team" }, 404);
    }

    const attachment = await linkFileToIssue(db, issueId, body.fileId);
    return c.json({ attachment }, 201);
  },
);

routes.post("/attachments/:id/stream-token", requireAuth, loadTeam("attachment"), async (c) => {
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
});

routes.get("/attachments/:id/stream", async (c) => {
  const linkId = c.req.param("id");
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Missing stream token" }, 401);

  let userId: string;
  try {
    const verified = await verifyStreamToken(token);
    if (verified.linkId !== linkId) {
      return c.json({ error: "Invalid stream token" }, 401);
    }
    userId = verified.userId;
  } catch {
    return c.json({ error: "Invalid or expired stream token" }, 401);
  }

  const row = await getAttachmentForDownload(db, linkId);
  if (!row) return c.json({ error: "Attachment not found" }, 404);
  if (!(await userHasTeamAccess(db, userId, row.teamId))) {
    return c.json({ error: "Team access denied" }, 403);
  }

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

routes.get("/attachments/:id/download", requireAuth, loadTeam("attachment"), async (c) => {
  const row = c.var.attachment;

  try {
    return await createFileRangeResponse(row.fullPath, {
      mimeType: row.mimeType,
      filename: row.filename,
      inline: false,
      rangeHeader: c.req.header("range"),
    });
  } catch {
    return c.json({ error: "File missing on server" }, 404);
  }
});

routes.delete(
  "/issues/:issueId/attachments/:id",
  requireAuth,
  requireWrite,
  loadTeam("issue"),
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
