import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { maxBytesForAttachmentFile } from "@teamflow/core";
import { schema, type Db } from "@teamflow/db";
import { eq } from "drizzle-orm";
import {
  AttachmentError,
  assembleChunksToFile,
  createStoredFileFromPath,
  getAttachmentLimits,
  getUploadTempDir,
} from "./attachments.js";

const SESSION_TTL_MS = 48 * 60 * 60 * 1000;

export type UploadSessionPublic = {
  sessionId: string;
  issueId: string;
  filename: string;
  mimeType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  status: string;
  expiresAt: string;
};

function sessionDir(sessionId: string) {
  return path.join(getUploadTempDir(), sessionId);
}

function computeTotalChunks(totalBytes: number, chunkSize: number) {
  return Math.ceil(totalBytes / chunkSize);
}

export async function purgeExpiredUploadSessions(db: Db) {
  const now = new Date().toISOString();
  const expired = await db
    .select({ id: schema.uploadSessions.id, tempDir: schema.uploadSessions.tempDir })
    .from(schema.uploadSessions)
    .where(eq(schema.uploadSessions.status, "pending"));

  for (const row of expired) {
    const [session] = await db
      .select()
      .from(schema.uploadSessions)
      .where(eq(schema.uploadSessions.id, row.id))
      .limit(1);
    if (!session || session.expiresAt >= now) continue;
    await abortUploadSession(db, session.id);
  }
}

export async function createUploadSession(
  db: Db,
  issueId: string,
  uploaderId: string,
  input: { filename: string; mimeType: string; totalBytes: number },
) {
  const limits = getAttachmentLimits();
  const mimeType = input.mimeType || "application/octet-stream";
  const maxBytes = maxBytesForAttachmentFile(input.filename, mimeType, limits);

  if (input.totalBytes <= 0) {
    throw new AttachmentError("Empty file", 400);
  }
  if (input.totalBytes > maxBytes) {
    throw new AttachmentError(
      `File exceeds limit for ${input.filename}`,
      413,
    );
  }

  const chunkSize = limits.chunkBytes;
  const totalChunks = computeTotalChunks(input.totalBytes, chunkSize);
  const sessionId = randomUUID();
  const temp = sessionDir(sessionId);
  await fs.mkdir(temp, { recursive: true });

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.insert(schema.uploadSessions).values({
    id: sessionId,
    issueId,
    uploaderId,
    filename: input.filename,
    mimeType,
    totalBytes: input.totalBytes,
    chunkSize,
    totalChunks,
    status: "pending",
    tempDir: temp,
    expiresAt,
  });

  return toSessionPublic({
    id: sessionId,
    issueId,
    filename: input.filename,
    mimeType,
    totalBytes: input.totalBytes,
    chunkSize,
    totalChunks,
    status: "pending",
    expiresAt,
    receivedChunks: [],
  });
}

function toSessionPublic(row: {
  id: string;
  issueId: string;
  filename: string;
  mimeType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  status: string;
  expiresAt: string;
  receivedChunks: number[];
}): UploadSessionPublic {
  return {
    sessionId: row.id,
    issueId: row.issueId,
    filename: row.filename,
    mimeType: row.mimeType,
    totalBytes: row.totalBytes,
    chunkSize: row.chunkSize,
    totalChunks: row.totalChunks,
    receivedChunks: row.receivedChunks,
    status: row.status,
    expiresAt: row.expiresAt,
  };
}

async function listReceivedChunks(db: Db, sessionId: string) {
  const rows = await db
    .select({ chunkIndex: schema.uploadChunks.chunkIndex })
    .from(schema.uploadChunks)
    .where(eq(schema.uploadChunks.sessionId, sessionId));
  return rows.map((row) => row.chunkIndex).sort((a, b) => a - b);
}

export async function getUploadSession(db: Db, sessionId: string) {
  const [session] = await db
    .select()
    .from(schema.uploadSessions)
    .where(eq(schema.uploadSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  const receivedChunks = await listReceivedChunks(db, sessionId);
  return toSessionPublic({ ...session, id: session.id, receivedChunks });
}

export async function saveUploadChunk(
  db: Db,
  sessionId: string,
  chunkIndex: number,
  data: Buffer,
) {
  const [session] = await db
    .select()
    .from(schema.uploadSessions)
    .where(eq(schema.uploadSessions.id, sessionId))
    .limit(1);

  if (!session) throw new AttachmentError("Upload session not found", 404);
  if (session.status !== "pending") {
    throw new AttachmentError("Upload session is not active", 400);
  }
  if (session.expiresAt < new Date().toISOString()) {
    throw new AttachmentError("Upload session expired", 410);
  }
  if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    throw new AttachmentError("Invalid chunk index", 400);
  }

  const expectedSize =
    chunkIndex === session.totalChunks - 1
      ? session.totalBytes - chunkIndex * session.chunkSize
      : session.chunkSize;

  if (data.length !== expectedSize) {
    throw new AttachmentError(
      `Chunk ${chunkIndex} must be ${expectedSize} bytes (got ${data.length})`,
      400,
    );
  }

  const chunkPath = path.join(session.tempDir, String(chunkIndex));
  await fs.writeFile(chunkPath, data);

  await db
    .insert(schema.uploadChunks)
    .values({
      sessionId,
      chunkIndex,
      sizeBytes: data.length,
    })
    .onConflictDoUpdate({
      target: [schema.uploadChunks.sessionId, schema.uploadChunks.chunkIndex],
      set: { sizeBytes: data.length },
    });

  return getUploadSession(db, sessionId);
}

export async function completeUploadSession(
  db: Db,
  sessionId: string,
  uploaderId: string,
) {
  const session = await getUploadSession(db, sessionId);
  if (!session) throw new AttachmentError("Upload session not found", 404);
  if (session.receivedChunks.length !== session.totalChunks) {
    throw new AttachmentError("Not all chunks uploaded", 400);
  }

  const [row] = await db
    .select()
    .from(schema.uploadSessions)
    .where(eq(schema.uploadSessions.id, sessionId))
    .limit(1);

  if (!row || row.uploaderId !== uploaderId) {
    throw new AttachmentError("Upload session not found", 404);
  }

  const assembledPath = path.join(row.tempDir, "assembled");
  await assembleChunksToFile(row.tempDir, row.totalChunks, assembledPath);

  const attachment = await createStoredFileFromPath(
    db,
    uploaderId,
    row.filename,
    row.mimeType,
    row.totalBytes,
    assembledPath,
    row.issueId,
  );

  await db
    .update(schema.uploadSessions)
    .set({ status: "complete" })
    .where(eq(schema.uploadSessions.id, sessionId));

  await fs.rm(row.tempDir, { recursive: true, force: true }).catch(() => {});
  await db.delete(schema.uploadChunks).where(eq(schema.uploadChunks.sessionId, sessionId));
  await db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, sessionId));

  return attachment;
}

export async function abortUploadSession(db: Db, sessionId: string) {
  const [row] = await db
    .select()
    .from(schema.uploadSessions)
    .where(eq(schema.uploadSessions.id, sessionId))
    .limit(1);

  if (!row) return false;

  await fs.rm(row.tempDir, { recursive: true, force: true }).catch(() => {});
  await db.delete(schema.uploadChunks).where(eq(schema.uploadChunks.sessionId, sessionId));
  await db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, sessionId));
  return true;
}
