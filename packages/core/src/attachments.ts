const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i;
const ZIP_EXT = /\.zip$/i;
const ZIP_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/ogg",
  "video/avi",
]);

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export type AttachmentKind = "image" | "video" | "zip" | "other";

export type AttachmentLimitsPublic = {
  imageBytes: number;
  videoBytes: number;
  zipBytes: number;
  defaultBytes: number;
  chunkBytes: number;
  chunkThresholdBytes: number;
};

export function isImageAttachmentFile(filename: string, mimeType = "") {
  if (mimeType.startsWith("image/")) return true;
  return IMAGE_EXT.test(filename);
}

export function isVideoAttachmentFile(filename: string, mimeType = "") {
  if (mimeType.startsWith("video/")) return true;
  if (VIDEO_MIMES.has(mimeType)) return true;
  return VIDEO_EXT.test(filename);
}

export function isZipAttachmentFile(filename: string, mimeType = "") {
  if (ZIP_MIMES.has(mimeType)) return true;
  return ZIP_EXT.test(filename);
}

export function attachmentFileKind(filename: string, mimeType = ""): AttachmentKind {
  if (isZipAttachmentFile(filename, mimeType)) return "zip";
  if (isVideoAttachmentFile(filename, mimeType)) return "video";
  if (isImageAttachmentFile(filename, mimeType)) return "image";
  return "other";
}

export function isStreamableAttachmentFile(filename: string, mimeType = "") {
  return isVideoAttachmentFile(filename, mimeType);
}

export function maxBytesForAttachmentFile(
  filename: string,
  mimeType: string,
  limits: AttachmentLimitsPublic,
) {
  const kind = attachmentFileKind(filename, mimeType);
  if (kind === "zip") return limits.zipBytes;
  if (kind === "video") return limits.videoBytes;
  if (kind === "image") return limits.imageBytes;
  return limits.defaultBytes;
}

export const DEFAULT_ATTACHMENT_LIMITS: AttachmentLimitsPublic = {
  imageBytes: 25 * MB,
  videoBytes: 4 * GB,
  zipBytes: 4 * GB,
  defaultBytes: 25 * MB,
  chunkBytes: 32 * MB,
  chunkThresholdBytes: 8 * MB,
};

const OPAQUE_BASENAME =
  /^(?:[A-Za-z0-9]{6,24}|[a-f0-9]{8,})(?: \(\d+\))?$/i;

export function fileExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot);
}

export function fileBasename(filename: string) {
  const ext = fileExtension(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

export function isOpaqueUploadFilename(filename: string) {
  const base = fileBasename(filename);
  if (!base || base.length < 6) return false;
  if (/^(?:image|img|photo|file|download|upload|attachment)(?:[-_\s]?\d+)?$/i.test(base)) {
    return false;
  }
  if (/\s/.test(base) && base.length > 12) return false;
  if (/^[A-Za-z0-9][A-Za-z0-9._\- ()[\]]{4,}$/.test(base) && /[a-z][A-Z]|[A-Z][a-z]/.test(base)) {
    return false;
  }
  return OPAQUE_BASENAME.test(base);
}

export function slugifyFilenamePart(value: string, maxLength = 80) {
  const slug = value
    .trim()
    .replace(/[^\w.\- ()[\]]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, maxLength);
  return slug || "file";
}

export function buildFriendlyFilename(label: string, originalFilename: string) {
  const ext = fileExtension(originalFilename).toLowerCase() || "";
  const slug = slugifyFilenamePart(label);
  return `${slug}${ext}`;
}

export function normalizeRenamedFilename(next: string, previousFilename: string) {
  const trimmed = next.trim();
  if (!trimmed) return previousFilename;
  const ext = fileExtension(previousFilename);
  if (ext && !fileExtension(trimmed)) {
    return `${trimmed}${ext}`;
  }
  return trimmed;
}

export function getTeamFileDisplayName(file: {
  filename: string;
  references: ReadonlyArray<{ name: string }>;
}) {
  if (!isOpaqueUploadFilename(file.filename)) return file.filename;
  const label = file.references[0]?.name?.trim();
  if (!label) return file.filename;
  return buildFriendlyFilename(label, file.filename);
}

export type UploadSessionPublic = {
  sessionId: string;
  issueId: string | null;
  rowId?: string | null;
  filename: string;
  mimeType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  status: string;
  expiresAt: string;
};

export type StreamTokenPublic = {
  token: string;
  expiresAt: string;
  streamUrl: string;
};
