import type { AttachmentLimitsPublic } from "@teamflow/core";

/** Human file size: B, KB, MB, then GB with `gbDigits` decimals. */
export function formatFileSize(bytes: number, gbDigits = 1) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(gbDigits)} GB`;
}

/**
 * Date and time for timestamps from the API. SQLite-style "YYYY-MM-DD HH:MM:SS" values are
 * UTC; anything unparseable is shown as-is.
 */
export function formatTimestamp(value: string) {
  const trimmed = value.trim();
  const sqliteLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const date = sqliteLike.test(trimmed)
    ? new Date(trimmed.replace(" ", "T") + "Z")
    : new Date(trimmed);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function describeAttachmentLimits(limits: AttachmentLimitsPublic, gbDigits = 1) {
  const size = (bytes: number) => formatFileSize(bytes, gbDigits);
  return `Images ${size(limits.imageBytes)}, videos ${size(limits.videoBytes)}, ZIPs ${size(limits.zipBytes)}`;
}
