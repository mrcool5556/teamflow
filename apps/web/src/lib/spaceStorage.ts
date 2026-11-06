import { formatStorageBytes, type SpaceStoragePublic } from "@teamflow/core";

export type StorageNotice = {
  tone: "warn" | "full";
  /** Short line for the upload zone. */
  text: string;
  /** What the user can do about it. */
  help?: string;
  /** Uploads are refused while this notice shows. */
  blocked: boolean;
};

export const DISK_LOW_TEXT =
  "The server is almost out of disk space, so uploads are paused for everyone. Issues and comments still work.";

export const MAKE_ROOM_HELP =
  "Removing a file from its issues and rows frees the space at once. Files in the trash still count until they are purged after 7 days, or until you delete them forever from the Files trash. A server admin can raise the cap.";

/** What an upload zone should say about the space's room, or null when there is nothing to say. */
export function storageNotice(storage: SpaceStoragePublic | undefined): StorageNotice | null {
  if (!storage) return null;
  if (storage.diskLow) return { tone: "full", text: DISK_LOW_TEXT, blocked: true };
  if (storage.capBytes === null) return null;
  const cap = formatStorageBytes(storage.capBytes);
  if (storage.state === "full") {
    return {
      tone: "full",
      text: `This space is full: ${formatStorageBytes(storage.usedBytes)} of ${cap}. New uploads are paused; issues, comments and linking existing files still work.`,
      help: MAKE_ROOM_HELP,
      blocked: true,
    };
  }
  if (storage.state === "warn") {
    return {
      tone: "warn",
      text: `${formatStorageBytes(storage.remainingBytes ?? 0)} left of this space's ${cap}.`,
      blocked: false,
    };
  }
  return null;
}

/**
 * Why `file` cannot be uploaded right now, checked before any bytes are sent (the server checks
 * again). null when it fits or the room is not known yet.
 */
export function uploadRefusal(
  storage: SpaceStoragePublic | undefined,
  file: { name: string; size: number },
): string | null {
  if (!storage) return null;
  if (storage.diskLow) return DISK_LOW_TEXT;
  if (storage.capBytes === null || storage.remainingBytes === null) return null;
  if (file.size <= storage.remainingBytes) return null;
  const cap = formatStorageBytes(storage.capBytes);
  if (storage.remainingBytes === 0) {
    return `This space is full (${formatStorageBytes(storage.usedBytes)} of ${cap}), so ${file.name} was not uploaded. ${MAKE_ROOM_HELP}`;
  }
  return `${file.name} (${formatStorageBytes(file.size)}) won't fit: this space has ${formatStorageBytes(storage.remainingBytes)} left of its ${cap}. Remove files or ask a server admin for more.`;
}
