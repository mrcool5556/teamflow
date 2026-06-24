import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { IssueAttachmentPublic } from "@teamflow/core";
import { findRepoRoot, schema, type Db } from "@teamflow/db";
import { eq } from "drizzle-orm";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

export class AttachmentError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AttachmentError";
    this.status = status;
  }
}

export function getUploadDir() {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(findRepoRoot(), configured);
  }
  return path.join(findRepoRoot(), "data", "uploads");
}

export function getMaxAttachmentBytes() {
  const raw = process.env.ATTACHMENT_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

function sanitizeFilename(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, "_");
  return base.slice(0, 200) || "file";
}

export function mapAttachmentPublic(row: {
  id: string;
  issueId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string;
  uploaderName: string;
  createdAt: string;
}): IssueAttachmentPublic {
  return {
    id: row.id,
    issueId: row.issueId,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploaderId: row.uploaderId,
    uploaderName: row.uploaderName,
    createdAt: row.createdAt,
    downloadUrl: `/attachments/${row.id}/download`,
  };
}

export async function listIssueAttachments(db: Db, issueId: string) {
  const rows = await db
    .select({
      id: schema.issueAttachments.id,
      issueId: schema.issueAttachments.issueId,
      filename: schema.issueAttachments.filename,
      mimeType: schema.issueAttachments.mimeType,
      sizeBytes: schema.issueAttachments.sizeBytes,
      uploaderId: schema.issueAttachments.uploaderId,
      createdAt: schema.issueAttachments.createdAt,
      uploaderName: schema.users.name,
    })
    .from(schema.issueAttachments)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.issueAttachments.uploaderId),
    )
    .where(eq(schema.issueAttachments.issueId, issueId));

  return rows.map(mapAttachmentPublic);
}

type UploadFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export async function saveIssueAttachment(
  db: Db,
  issueId: string,
  uploaderId: string,
  file: UploadFile,
) {
  const maxBytes = getMaxAttachmentBytes();
  if (file.size <= 0) {
    throw new AttachmentError("Empty file", 400);
  }
  if (file.size > maxBytes) {
    throw new AttachmentError(`File exceeds ${maxBytes} byte limit`, 413);
  }

  const id = randomUUID();
  const filename = sanitizeFilename(file.name);
  const mimeType = file.type || "application/octet-stream";
  const issueDir = path.join(getUploadDir(), issueId);
  await fs.mkdir(issueDir, { recursive: true });

  const storageName = `${id}_${filename}`;
  const storagePath = path.join(issueDir, storageName);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length > maxBytes) {
    throw new AttachmentError(`File exceeds ${maxBytes} byte limit`, 413);
  }

  await fs.writeFile(storagePath, buffer);

  const now = new Date().toISOString();
  const relativePath = path.join(issueId, storageName);

  try {
    await db.insert(schema.issueAttachments).values({
      id,
      issueId,
      uploaderId,
      filename,
      mimeType,
      sizeBytes: buffer.length,
      storagePath: relativePath,
      createdAt: now,
    });
  } catch (error) {
    await fs.unlink(storagePath).catch(() => {});
    throw error;
  }

  const [uploader] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, uploaderId))
    .limit(1);

  return mapAttachmentPublic({
    id,
    issueId,
    filename,
    mimeType,
    sizeBytes: buffer.length,
    uploaderId,
    uploaderName: uploader!.name,
    createdAt: now,
  });
}

export async function getAttachmentForDownload(db: Db, attachmentId: string) {
  const [row] = await db
    .select({
      attachment: schema.issueAttachments,
      teamId: schema.issues.teamId,
    })
    .from(schema.issueAttachments)
    .innerJoin(schema.issues, eq(schema.issues.id, schema.issueAttachments.issueId))
    .where(eq(schema.issueAttachments.id, attachmentId))
    .limit(1);

  if (!row) return null;

  const fullPath = path.join(getUploadDir(), row.attachment.storagePath);
  return { ...row, fullPath };
}

export async function deleteIssueAttachment(
  db: Db,
  issueId: string,
  attachmentId: string,
) {
  const [row] = await db
    .select()
    .from(schema.issueAttachments)
    .where(eq(schema.issueAttachments.id, attachmentId))
    .limit(1);

  if (!row || row.issueId !== issueId) return null;

  await db
    .delete(schema.issueAttachments)
    .where(eq(schema.issueAttachments.id, attachmentId));

  const fullPath = path.join(getUploadDir(), row.storagePath);
  await fs.unlink(fullPath).catch(() => {});

  return row;
}
