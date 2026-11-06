import {
  formatStorageBytes,
  spaceStorageState,
  type SpaceStorageBreakdown,
  type SpaceStoragePublic,
  type SpaceType,
} from "@teamflow/core";
import { schema, type Db } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { getUploadDir } from "./attachments.js";
import { readDiskSpace } from "./disk.js";
import { ApiError, notFound } from "./errors.js";
import { getSpaceSettings } from "./spaceSettings.js";

/**
 * Bytes a space keeps on disk: each stored file once (however many issues and rows link it),
 * files in the Files trash until purged, files on issues in the issue trash, and chunked
 * uploads in progress at their full size (so two large uploads cannot both squeeze in).
 * The database, backups and exports are server-level and not counted.
 */
export function getSpaceUsageBreakdown(
  db: Db,
  teamId: string,
  options: { excludeSessionId?: string } = {},
): SpaceStorageBreakdown {
  const files = db.$client
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN f.deleted_at IS NULL AND EXISTS (
           SELECT 1 FROM issue_file_links l WHERE l.file_id = f.id) THEN f.size_bytes END), 0) AS issueBytes,
         COALESCE(SUM(CASE WHEN f.deleted_at IS NULL AND NOT EXISTS (
           SELECT 1 FROM issue_file_links l WHERE l.file_id = f.id) THEN f.size_bytes END), 0) AS rowBytes,
         COALESCE(SUM(CASE WHEN f.deleted_at IS NOT NULL THEN f.size_bytes END), 0) AS trashBytes
       FROM stored_files f WHERE f.team_id = ?`,
    )
    .get(teamId) as { issueBytes: number; rowBytes: number; trashBytes: number };

  const uploading = db.$client
    .prepare(
      `SELECT COALESCE(SUM(s.total_bytes), 0) AS bytes FROM upload_sessions s
       WHERE s.status = 'pending' AND s.expires_at > ? AND s.id <> ?
         AND (s.issue_id IN (SELECT id FROM issues WHERE team_id = ?)
           OR s.row_id IN (SELECT id FROM board_rows WHERE team_id = ?))`,
    )
    .get(new Date().toISOString(), options.excludeSessionId ?? "", teamId, teamId) as {
    bytes: number;
  };

  return {
    issueFilesBytes: files.issueBytes,
    rowFilesBytes: files.rowBytes,
    trashBytes: files.trashBytes,
    uploadingBytes: uploading.bytes,
  };
}

export function sumBreakdown(breakdown: SpaceStorageBreakdown) {
  return (
    breakdown.issueFilesBytes +
    breakdown.rowFilesBytes +
    breakdown.trashBytes +
    breakdown.uploadingBytes
  );
}

export type SpaceRow = { id: string; spaceType: string; storageCapBytes: number | null };

export function getSpaceRow(db: Db, teamId: string): SpaceRow {
  const team = db
    .select({
      id: schema.teams.id,
      spaceType: schema.teams.spaceType,
      storageCapBytes: schema.teams.storageCapBytes,
    })
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .get();
  if (!team) throw notFound("Team not found");
  return team;
}

export function asSpaceType(value: string): SpaceType {
  return value === "free" ? "free" : "admin";
}

/** True while the upload disk has less free space than the admin's floor (0 turns it off). */
export async function isDiskLow(db: Db) {
  const { minFreeDiskBytes } = getSpaceSettings(db);
  if (minFreeDiskBytes <= 0) return false;
  const disk = await readDiskSpace(getUploadDir());
  return disk !== null && disk.freeBytes < minFreeDiskBytes;
}

/** The meter every member sees in the Files drawer, and what the admin page lists. */
export async function getSpaceStorage(db: Db, teamId: string): Promise<SpaceStoragePublic> {
  const team = getSpaceRow(db, teamId);
  const breakdown = getSpaceUsageBreakdown(db, teamId);
  const usedBytes = sumBreakdown(breakdown);
  const capBytes = team.storageCapBytes;
  return {
    teamId,
    spaceType: asSpaceType(team.spaceType),
    capBytes,
    usedBytes,
    remainingBytes: capBytes === null ? null : Math.max(0, capBytes - usedBytes),
    state: spaceStorageState(usedBytes, capBytes),
    breakdown,
    diskLow: await isDiskLow(db),
  };
}

/** Bytes used by every space at once, for the admin list (one query instead of one per team). */
export function getAllSpaceUsage(db: Db): Map<string, number> {
  const rows = db.$client
    .prepare(
      `SELECT team_id AS teamId, SUM(size_bytes) AS bytes FROM stored_files
       WHERE team_id IS NOT NULL GROUP BY team_id`,
    )
    .all() as { teamId: string; bytes: number }[];
  const usage = new Map(rows.map((row) => [row.teamId, row.bytes]));
  const sessions = db.$client
    .prepare(
      `SELECT COALESCE(i.team_id, r.team_id) AS teamId, SUM(s.total_bytes) AS bytes
       FROM upload_sessions s
       LEFT JOIN issues i ON i.id = s.issue_id
       LEFT JOIN board_rows r ON r.id = s.row_id
       WHERE s.status = 'pending' AND s.expires_at > ?
       GROUP BY COALESCE(i.team_id, r.team_id)`,
    )
    .all(new Date().toISOString()) as { teamId: string | null; bytes: number }[];
  for (const row of sessions) {
    if (!row.teamId) continue;
    usage.set(row.teamId, (usage.get(row.teamId) ?? 0) + row.bytes);
  }
  return usage;
}

/**
 * Refuse an upload of `fileBytes` into `teamId` before any bytes are written:
 * - 507 `server_storage_low` when the upload disk would drop under the free-disk floor;
 * - 413 `space_storage_full` when the space's cap would be passed (body adds usedBytes,
 *   capBytes, fileBytes, remainingBytes).
 * Spaces with no cap only meet the disk floor. `excludeSessionId` leaves a chunked session's
 * own reservation out when it completes.
 */
export async function assertSpaceHasRoom(
  db: Db,
  teamId: string,
  fileBytes: number,
  options: { filename?: string; excludeSessionId?: string } = {},
) {
  const { minFreeDiskBytes } = getSpaceSettings(db);
  if (minFreeDiskBytes > 0) {
    const disk = await readDiskSpace(getUploadDir());
    if (disk && disk.freeBytes - fileBytes < minFreeDiskBytes) {
      throw new ApiError(
        507,
        "The server is almost out of disk space, so uploads are paused for everyone. " +
          "Issues and comments still work. A server admin needs to free space.",
        "server_storage_low",
      );
    }
  }

  const team = getSpaceRow(db, teamId);
  const capBytes = team.storageCapBytes;
  if (capBytes === null) return;
  const usedBytes = sumBreakdown(getSpaceUsageBreakdown(db, teamId, options));
  if (usedBytes + fileBytes <= capBytes) return;

  const remainingBytes = Math.max(0, capBytes - usedBytes);
  const cap = formatStorageBytes(capBytes);
  const name = options.filename
    ? `${options.filename} (${formatStorageBytes(fileBytes)})`
    : "This file";
  const message =
    remainingBytes === 0
      ? `This space is full (${formatStorageBytes(usedBytes)} of ${cap}). New uploads are paused; ` +
        "issues, comments and linking existing files still work. Empty the trash or remove files, " +
        "or ask a server admin for more."
      : `${name} won't fit: this space has ${formatStorageBytes(remainingBytes)} left of its ${cap}. ` +
        "Remove files or ask a server admin for more.";
  throw new ApiError(413, message, "space_storage_full", {
    usedBytes,
    capBytes,
    fileBytes,
    remainingBytes,
  });
}
