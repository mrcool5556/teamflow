const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;
const ZIP_EXT = /\.zip$/i;
const ZIP_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
]);

export type AttachmentLimitsPublic = {
  imageBytes: number;
  zipBytes: number;
  defaultBytes: number;
};

export function isImageAttachmentFile(filename: string, mimeType = "") {
  if (mimeType.startsWith("image/")) return true;
  return IMAGE_EXT.test(filename);
}

export function isZipAttachmentFile(filename: string, mimeType = "") {
  if (ZIP_MIMES.has(mimeType)) return true;
  return ZIP_EXT.test(filename);
}

export function maxBytesForAttachmentFile(
  filename: string,
  mimeType: string,
  limits: AttachmentLimitsPublic,
) {
  if (isZipAttachmentFile(filename, mimeType)) return limits.zipBytes;
  if (isImageAttachmentFile(filename, mimeType)) return limits.imageBytes;
  return limits.defaultBytes;
}

export function attachmentFileKind(filename: string, mimeType = "") {
  if (isZipAttachmentFile(filename, mimeType)) return "zip" as const;
  if (isImageAttachmentFile(filename, mimeType)) return "image" as const;
  return "other" as const;
}

export const DEFAULT_ATTACHMENT_LIMITS: AttachmentLimitsPublic = {
  imageBytes: 25 * 1024 * 1024,
  zipBytes: 150 * 1024 * 1024,
  defaultBytes: 25 * 1024 * 1024,
};
