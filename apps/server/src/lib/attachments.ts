import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { finished } from "node:stream/promises";
import { pipeline } from "node:stream/promises";
import {
  attachmentFileKind,
  DEFAULT_ATTACHMENT_LIMITS,
  isStreamableAttachmentFile,
  maxBytesForAttachmentFile,
  type AttachmentLimitsPublic,
  type IssueAttachmentPublic,
} from "@teamflow/core";
import { findRepoRoot, schema, type Db } from "@teamflow/db";
import { eq, sql, and } from "drizzle-orm";

const MB = 1024 * 1024;

export class AttachmentError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AttachmentError";
    this.status = status;
  }
}

function parseEnvBytes(key: string, fallback: number) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAttachmentLimits(): AttachmentLimitsPublic {
  return {
    imageBytes: parseEnvBytes(
      "ATTACHMENT_MAX_IMAGE_BYTES",
      DEFAULT_ATTACHMENT_LIMITS.imageBytes,
    ),
    videoBytes: parseEnvBytes(
      "ATTACHMENT_MAX_VIDEO_BYTES",
      DEFAULT_ATTACHMENT_LIMITS.videoBytes,
    ),
    zipBytes: parseEnvBytes(
      "ATTACHMENT_MAX_ZIP_BYTES",
      DEFAULT_ATTACHMENT_LIMITS.zipBytes,
    ),
    defaultBytes: parseEnvBytes(
      "ATTACHMENT_MAX_BYTES",
      DEFAULT_ATTACHMENT_LIMITS.defaultBytes,
    ),
    chunkBytes: parseEnvBytes(
      "UPLOAD_CHUNK_BYTES",
      DEFAULT_ATTACHMENT_LIMITS.chunkBytes,
    ),
    chunkThresholdBytes: parseEnvBytes(
      "UPLOAD_CHUNK_THRESHOLD_BYTES",
      DEFAULT_ATTACHMENT_LIMITS.chunkThresholdBytes,
    ),
  };
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

export function getUploadTempDir() {
  return path.join(getUploadDir(), ".tmp");
}

function sanitizeFilename(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, "_");
  return base.slice(0, 200) || "file";
}

function limitErrorMessage(filename: string, mimeType: string, maxBytes: number) {
  const kind = attachmentFileKind(filename, mimeType);
  const label =
    kind === "zip"
      ? "ZIP files"
      : kind === "video"
        ? "videos"
        : kind === "image"
          ? "images"
          : "this file type";
  const mb = Math.round(maxBytes / MB);
  return `${label} are limited to ${mb} MB (${filename})`;
}

export function mapAttachmentPublic(row: {
  linkId: string;
  issueId?: string | null;
  rowId?: string | null;
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string;
  uploaderName: string;
  createdAt: string;
}): IssueAttachmentPublic {
  const kind = attachmentFileKind(row.filename, row.mimeType);
  return {
    id: row.linkId,
    issueId: row.issueId ?? null,
    rowId: row.rowId ?? null,
    fileId: row.fileId,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    kind,
    uploaderId: row.uploaderId,
    uploaderName: row.uploaderName,
    createdAt: row.createdAt,
    downloadUrl: `/attachments/${row.linkId}/download`,
    canStream: isStreamableAttachmentFile(row.filename, row.mimeType),
  };
}

async function attachmentRowsForIssue(db: Db, issueId: string) {
  return db
    .select({
      linkId: schema.issueFileLinks.id,
      issueId: schema.issueFileLinks.issueId,
      fileId: schema.storedFiles.id,
      filename: schema.storedFiles.filename,
      mimeType: schema.storedFiles.mimeType,
      sizeBytes: schema.storedFiles.sizeBytes,
      uploaderId: schema.storedFiles.uploaderId,
      createdAt: schema.issueFileLinks.createdAt,
      uploaderName: schema.users.name,
      storagePath: schema.storedFiles.storagePath,
    })
    .from(schema.issueFileLinks)
    .innerJoin(
      schema.storedFiles,
      eq(schema.storedFiles.id, schema.issueFileLinks.fileId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.storedFiles.uploaderId))
    .where(eq(schema.issueFileLinks.issueId, issueId));
}

export async function listIssueAttachments(db: Db, issueId: string) {
  const rows = await attachmentRowsForIssue(db, issueId);
  return rows.map((row) => mapAttachmentPublic(row));
}

export async function getAttachmentLinkContext(db: Db, linkId: string) {
  const [issueRow] = await db
    .select({
      linkId: schema.issueFileLinks.id,
      issueId: schema.issueFileLinks.issueId,
      fileId: schema.storedFiles.id,
      filename: schema.storedFiles.filename,
      mimeType: schema.storedFiles.mimeType,
      sizeBytes: schema.storedFiles.sizeBytes,
      uploaderId: schema.storedFiles.uploaderId,
      createdAt: schema.issueFileLinks.createdAt,
      uploaderName: schema.users.name,
      storagePath: schema.storedFiles.storagePath,
      teamId: schema.issues.teamId,
    })
    .from(schema.issueFileLinks)
    .innerJoin(
      schema.storedFiles,
      eq(schema.storedFiles.id, schema.issueFileLinks.fileId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.storedFiles.uploaderId))
    .innerJoin(schema.issues, eq(schema.issues.id, schema.issueFileLinks.issueId))
    .where(eq(schema.issueFileLinks.id, linkId))
    .limit(1);

  if (issueRow) {
    return {
      ...issueRow,
      fullPath: path.join(getUploadDir(), issueRow.storagePath),
      public: mapAttachmentPublic({ ...issueRow, rowId: null }),
    };
  }

  const [rowLink] = await db
    .select({
      linkId: schema.rowFileLinks.id,
      rowId: schema.rowFileLinks.rowId,
      fileId: schema.storedFiles.id,
      filename: schema.storedFiles.filename,
      mimeType: schema.storedFiles.mimeType,
      sizeBytes: schema.storedFiles.sizeBytes,
      uploaderId: schema.storedFiles.uploaderId,
      createdAt: schema.rowFileLinks.createdAt,
      uploaderName: schema.users.name,
      storagePath: schema.storedFiles.storagePath,
      teamId: schema.boardRows.teamId,
    })
    .from(schema.rowFileLinks)
    .innerJoin(
      schema.storedFiles,
      eq(schema.storedFiles.id, schema.rowFileLinks.fileId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.storedFiles.uploaderId))
    .innerJoin(schema.boardRows, eq(schema.boardRows.id, schema.rowFileLinks.rowId))
    .where(eq(schema.rowFileLinks.id, linkId))
    .limit(1);

  if (!rowLink) return null;

  return {
    ...rowLink,
    issueId: null,
    fullPath: path.join(getUploadDir(), rowLink.storagePath),
    public: mapAttachmentPublic({ ...rowLink, issueId: null }),
  };
}

export async function getAttachmentForDownload(db: Db, linkId: string) {
  const row = await getAttachmentLinkContext(db, linkId);
  if (!row) return null;
  return row;
}

async function deleteStoredFileIfOrphaned(db: Db, fileId: string) {
  const [issueCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.issueFileLinks)
    .where(eq(schema.issueFileLinks.fileId, fileId));
  const [rowCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.rowFileLinks)
    .where(eq(schema.rowFileLinks.fileId, fileId));

  const remaining =
    Number(issueCountRow?.count ?? 0) + Number(rowCountRow?.count ?? 0);
  if (remaining > 0) return;

  const [file] = await db
    .select()
    .from(schema.storedFiles)
    .where(eq(schema.storedFiles.id, fileId))
    .limit(1);

  if (!file) return;

  await db.delete(schema.storedFiles).where(eq(schema.storedFiles.id, fileId));
  const fullPath = path.join(getUploadDir(), file.storagePath);
  await fs.unlink(fullPath).catch(() => {});
}

export async function deleteIssueAttachment(
  db: Db,
  issueId: string,
  linkId: string,
) {
  const [link] = await db
    .select()
    .from(schema.issueFileLinks)
    .where(eq(schema.issueFileLinks.id, linkId))
    .limit(1);

  if (!link || link.issueId !== issueId) return null;

  const fileId = link.fileId;
  await db.delete(schema.issueFileLinks).where(eq(schema.issueFileLinks.id, linkId));
  await deleteStoredFileIfOrphaned(db, fileId);
  return link;
}

export async function moveIssueAttachment(
  db: Db,
  linkId: string,
  sourceIssueId: string,
  targetIssueId: string,
) {
  const [link] = await db
    .select()
    .from(schema.issueFileLinks)
    .where(eq(schema.issueFileLinks.id, linkId))
    .limit(1);

  if (!link || link.issueId !== sourceIssueId) {
    throw new AttachmentError("Attachment not found", 404);
  }

  await db
    .update(schema.issueFileLinks)
    .set({ issueId: targetIssueId })
    .where(eq(schema.issueFileLinks.id, linkId));

  const ctx = await getAttachmentLinkContext(db, linkId);
  if (!ctx) throw new AttachmentError("Attachment not found", 404);
  return ctx.public;
}

export async function linkFileToIssue(
  db: Db,
  issueId: string,
  fileId: string,
) {
  const [existing] = await db
    .select({
      linkId: schema.issueFileLinks.id,
      issueId: schema.issueFileLinks.issueId,
      fileId: schema.storedFiles.id,
      filename: schema.storedFiles.filename,
      mimeType: schema.storedFiles.mimeType,
      sizeBytes: schema.storedFiles.sizeBytes,
      uploaderId: schema.storedFiles.uploaderId,
      createdAt: schema.issueFileLinks.createdAt,
      uploaderName: schema.users.name,
    })
    .from(schema.issueFileLinks)
    .innerJoin(
      schema.storedFiles,
      eq(schema.storedFiles.id, schema.issueFileLinks.fileId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.storedFiles.uploaderId))
    .where(
      and(
        eq(schema.issueFileLinks.issueId, issueId),
        eq(schema.issueFileLinks.fileId, fileId),
      ),
    )
    .limit(1);

  if (existing) {
    return mapAttachmentPublic({ ...existing, rowId: null });
  }

  const [file] = await db
    .select()
    .from(schema.storedFiles)
    .where(eq(schema.storedFiles.id, fileId))
    .limit(1);

  if (!file) throw new AttachmentError("File not found", 404);

  const linkId = randomUUID();
  const now = new Date().toISOString();
  await db.insert(schema.issueFileLinks).values({
    id: linkId,
    issueId,
    fileId,
    createdAt: now,
  });

  const [uploader] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, file.uploaderId))
    .limit(1);

  return mapAttachmentPublic({
    linkId,
    issueId,
    rowId: null,
    fileId,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    uploaderId: file.uploaderId,
    uploaderName: uploader!.name,
    createdAt: now,
  });
}

export async function createStoredFileFromPath(
  db: Db,
  uploaderId: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  absolutePath: string,
  target: { issueId: string } | { rowId: string },
) {
  const fileId = randomUUID();
  const linkId = randomUUID();
  const safeName = sanitizeFilename(filename);
  const relativeDir =
    "issueId" in target ? target.issueId : path.join("rows", target.rowId);
  const storageName = `${fileId}_${safeName}`;
  const relativePath = path.join(relativeDir, storageName);
  const finalDir = path.join(getUploadDir(), relativeDir);
  await fs.mkdir(finalDir, { recursive: true });
  const finalPath = path.join(getUploadDir(), relativePath);
  await fs.rename(absolutePath, finalPath);

  const now = new Date().toISOString();
  await db.insert(schema.storedFiles).values({
    id: fileId,
    uploaderId,
    filename: safeName,
    mimeType,
    sizeBytes,
    storagePath: relativePath,
    createdAt: now,
  });

  if ("issueId" in target) {
    await db.insert(schema.issueFileLinks).values({
      id: linkId,
      issueId: target.issueId,
      fileId,
      createdAt: now,
    });
  } else {
    await db.insert(schema.rowFileLinks).values({
      id: linkId,
      rowId: target.rowId,
      fileId,
      createdAt: now,
    });
  }

  const [uploader] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, uploaderId))
    .limit(1);

  return mapAttachmentPublic({
    linkId,
    issueId: "issueId" in target ? target.issueId : null,
    rowId: "rowId" in target ? target.rowId : null,
    fileId,
    filename: safeName,
    mimeType,
    sizeBytes,
    uploaderId,
    uploaderName: uploader!.name,
    createdAt: now,
  });
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
  const limits = getAttachmentLimits();
  const mimeType = file.type || "application/octet-stream";
  const maxBytes = maxBytesForAttachmentFile(file.name, mimeType, limits);

  if (file.size <= 0) throw new AttachmentError("Empty file", 400);
  if (file.size > maxBytes) {
    throw new AttachmentError(limitErrorMessage(file.name, mimeType, maxBytes), 413);
  }

  const fileId = randomUUID();
  const linkId = randomUUID();
  const filename = sanitizeFilename(file.name);
  const issueDir = path.join(getUploadDir(), issueId);
  await fs.mkdir(issueDir, { recursive: true });

  const storageName = `${fileId}_${filename}`;
  const storagePath = path.join(issueDir, storageName);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length > maxBytes) {
    throw new AttachmentError(limitErrorMessage(filename, mimeType, maxBytes), 413);
  }

  await fs.writeFile(storagePath, buffer);

  const now = new Date().toISOString();
  const relativePath = path.join(issueId, storageName);

  await db.insert(schema.storedFiles).values({
    id: fileId,
    uploaderId,
    filename,
    mimeType,
    sizeBytes: buffer.length,
    storagePath: relativePath,
    createdAt: now,
  });
  await db.insert(schema.issueFileLinks).values({
    id: linkId,
    issueId,
    fileId,
    createdAt: now,
  });

  const [uploader] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, uploaderId))
    .limit(1);

  return mapAttachmentPublic({
    linkId,
    issueId,
    rowId: null,
    fileId,
    filename,
    mimeType,
    sizeBytes: buffer.length,
    uploaderId,
    uploaderName: uploader!.name,
    createdAt: now,
  });
}

export async function listRowAttachments(db: Db, rowId: string) {
  const rows = await db
    .select({
      linkId: schema.rowFileLinks.id,
      rowId: schema.rowFileLinks.rowId,
      fileId: schema.storedFiles.id,
      filename: schema.storedFiles.filename,
      mimeType: schema.storedFiles.mimeType,
      sizeBytes: schema.storedFiles.sizeBytes,
      uploaderId: schema.storedFiles.uploaderId,
      createdAt: schema.rowFileLinks.createdAt,
      uploaderName: schema.users.name,
    })
    .from(schema.rowFileLinks)
    .innerJoin(
      schema.storedFiles,
      eq(schema.storedFiles.id, schema.rowFileLinks.fileId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.storedFiles.uploaderId))
    .where(eq(schema.rowFileLinks.rowId, rowId));

  return rows.map((row) =>
    mapAttachmentPublic({ ...row, issueId: null }),
  );
}

export async function saveRowAttachment(
  db: Db,
  rowId: string,
  uploaderId: string,
  file: UploadFile,
) {
  const limits = getAttachmentLimits();
  const mimeType = file.type || "application/octet-stream";
  const maxBytes = maxBytesForAttachmentFile(file.name, mimeType, limits);

  if (file.size <= 0) throw new AttachmentError("Empty file", 400);
  if (file.size > maxBytes) {
    throw new AttachmentError(limitErrorMessage(file.name, mimeType, maxBytes), 413);
  }

  const fileId = randomUUID();
  const linkId = randomUUID();
  const filename = sanitizeFilename(file.name);
  const relativeDir = path.join("rows", rowId);
  const rowDir = path.join(getUploadDir(), relativeDir);
  await fs.mkdir(rowDir, { recursive: true });

  const storageName = `${fileId}_${filename}`;
  const storagePath = path.join(rowDir, storageName);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length > maxBytes) {
    throw new AttachmentError(limitErrorMessage(filename, mimeType, maxBytes), 413);
  }

  await fs.writeFile(storagePath, buffer);

  const now = new Date().toISOString();
  const relativePath = path.join(relativeDir, storageName);

  await db.insert(schema.storedFiles).values({
    id: fileId,
    uploaderId,
    filename,
    mimeType,
    sizeBytes: buffer.length,
    storagePath: relativePath,
    createdAt: now,
  });
  await db.insert(schema.rowFileLinks).values({
    id: linkId,
    rowId,
    fileId,
    createdAt: now,
  });

  const [uploader] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, uploaderId))
    .limit(1);

  return mapAttachmentPublic({
    linkId,
    issueId: null,
    rowId,
    fileId,
    filename,
    mimeType,
    sizeBytes: buffer.length,
    uploaderId,
    uploaderName: uploader!.name,
    createdAt: now,
  });
}

export async function deleteRowAttachment(db: Db, rowId: string, linkId: string) {
  const [link] = await db
    .select()
    .from(schema.rowFileLinks)
    .where(eq(schema.rowFileLinks.id, linkId))
    .limit(1);

  if (!link || link.rowId !== rowId) return null;

  const fileId = link.fileId;
  await db.delete(schema.rowFileLinks).where(eq(schema.rowFileLinks.id, linkId));
  await deleteStoredFileIfOrphaned(db, fileId);
  return link;
}

export async function assembleChunksToFile(
  sessionDir: string,
  totalChunks: number,
  outputPath: string,
) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const writeStream = createWriteStream(outputPath);

  for (let index = 0; index < totalChunks; index += 1) {
    const chunkPath = path.join(sessionDir, String(index));
    await pipeline(createReadStream(chunkPath), writeStream, { end: false });
  }

  writeStream.end();
  await finished(writeStream);
}

export async function countLinksForFile(db: Db, fileId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.issueFileLinks)
    .where(eq(schema.issueFileLinks.fileId, fileId));
  return Number(row?.count ?? 0);
}

export async function getFileTeamId(db: Db, fileId: string) {
  const [issueRow] = await db
    .select({ teamId: schema.issues.teamId })
    .from(schema.issueFileLinks)
    .innerJoin(schema.issues, eq(schema.issues.id, schema.issueFileLinks.issueId))
    .where(eq(schema.issueFileLinks.fileId, fileId))
    .limit(1);
  if (issueRow?.teamId) return issueRow.teamId;

  const [rowLink] = await db
    .select({ teamId: schema.boardRows.teamId })
    .from(schema.rowFileLinks)
    .innerJoin(schema.boardRows, eq(schema.boardRows.id, schema.rowFileLinks.rowId))
    .where(eq(schema.rowFileLinks.fileId, fileId))
    .limit(1);
  return rowLink?.teamId ?? null;
}
