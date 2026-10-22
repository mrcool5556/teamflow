import { Hono } from "hono";
import type { AppEnv } from "../types.js";
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

function parseCreateUploadSession(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.filename !== "string" || !record.filename.trim()) return null;
  if (typeof record.totalBytes !== "number" || record.totalBytes <= 0) return null;
  return {
    filename: record.filename.trim(),
    mimeType:
      typeof record.mimeType === "string" && record.mimeType
        ? record.mimeType
        : "application/octet-stream",
    totalBytes: Math.floor(record.totalBytes),
  };
}

routes.post("/issues/:issueId/uploads", requireAuth, requireWrite, loadTeam("issue"), async (c) => {
  const auth = c.var.auth;

  const issue = c.var.issue;
  const issueId = issue.id;
  const body = parseCreateUploadSession(await c.req.json());
  if (!body) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const session = await createUploadSession(db, { issueId }, auth.userId, {
    filename: body.filename,
    mimeType: body.mimeType,
    totalBytes: body.totalBytes,
  });
  return c.json({ session }, 201);
});

routes.get("/uploads/:sessionId", requireAuth, loadTeam("upload"), async (c) => {
  const session = c.var.uploadSession;

  return c.json({ session });
});

routes.put(
  "/uploads/:sessionId/chunks/:index",
  requireAuth,
  requireWrite,
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
  loadTeam("upload"),
  async (c) => {
    const auth = c.var.auth;

    const existing = c.var.uploadSession;
    const sessionId = existing.sessionId;

    const attachment = await completeUploadSession(db, sessionId, auth.userId);
    return c.json({ attachment }, 201);
  },
);

routes.delete("/uploads/:sessionId", requireAuth, requireWrite, loadTeam("upload"), async (c) => {
  const existing = c.var.uploadSession;
  const sessionId = existing.sessionId;

  await abortUploadSession(db, sessionId);
  return c.body(null, 204);
});

routes.post("/rows/:rowId/uploads", requireAuth, requireWrite, loadTeam("row"), async (c) => {
  const auth = c.var.auth;

  const row = c.var.row;
  const rowId = row.id;
  const body = parseCreateUploadSession(await c.req.json());
  if (!body) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const session = await createUploadSession(db, { rowId }, auth.userId, {
    filename: body.filename,
    mimeType: body.mimeType,
    totalBytes: body.totalBytes,
  });
  return c.json({ session }, 201);
});

export { routes as uploadsRoutes };
