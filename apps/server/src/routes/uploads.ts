import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { createUploadSessionSchema } from "@teamflow/core";
import { db } from "../db.js";
import { requireAuth, requireWrite } from "../middleware/auth.js";
import { loadTeam } from "../middleware/team.js";
import {
  abortUploadSession,
  completeUploadSession,
  createUploadSession,
  saveUploadChunk,
} from "../lib/chunkedUpload.js";

/** Chunked upload sessions for issue and row attachments. */
const routes = new Hono<AppEnv>();

routes.post(
  "/issues/:issueId/uploads",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("issue"),
  async (c) => {
    const auth = c.var.auth;

    const issue = c.var.issue;
    const issueId = issue.id;
    const body = await parseBody(c, createUploadSessionSchema);

    const session = await createUploadSession(db, { issueId }, auth.userId, {
      filename: body.filename,
      mimeType: body.mimeType,
      totalBytes: body.totalBytes,
    });
    return c.json({ session }, 201);
  },
);

routes.get("/uploads/:sessionId", requireAuth, validateParams, loadTeam("upload"), async (c) => {
  const session = c.var.uploadSession;

  return c.json({ session });
});

routes.put(
  "/uploads/:sessionId/chunks/:index",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("upload"),
  async (c) => {
    const auth = c.var.auth;

    const existing = c.var.uploadSession;
    const sessionId = existing.sessionId;
    const chunkIndex = Number.parseInt(c.req.param("index"), 10);
    if (Number.isNaN(chunkIndex)) {
      return c.json({ error: "Invalid chunk index" }, 400);
    }

    const buffer = Buffer.from(await c.req.arrayBuffer());
    const session = await saveUploadChunk(db, sessionId, chunkIndex, buffer, auth.userId);
    return c.json({ session });
  },
);

routes.post(
  "/uploads/:sessionId/complete",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("upload"),
  async (c) => {
    const auth = c.var.auth;

    const existing = c.var.uploadSession;
    const sessionId = existing.sessionId;

    const attachment = await completeUploadSession(db, sessionId, auth.userId);
    return c.json({ attachment }, 201);
  },
);

routes.delete(
  "/uploads/:sessionId",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("upload"),
  async (c) => {
    const existing = c.var.uploadSession;
    const sessionId = existing.sessionId;

    await abortUploadSession(db, sessionId);
    return c.body(null, 204);
  },
);

routes.post(
  "/rows/:rowId/uploads",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam("row"),
  async (c) => {
    const auth = c.var.auth;

    const row = c.var.row;
    const rowId = row.id;
    const body = await parseBody(c, createUploadSessionSchema);

    const session = await createUploadSession(db, { rowId }, auth.userId, {
      filename: body.filename,
      mimeType: body.mimeType,
      totalBytes: body.totalBytes,
    });
    return c.json({ session }, 201);
  },
);

export { routes as uploadsRoutes };
