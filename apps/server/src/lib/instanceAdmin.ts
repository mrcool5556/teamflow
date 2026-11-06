import fs from "node:fs";
import { stat } from "node:fs/promises";
import {
  FILE_TRASH_RETENTION_DAYS,
  formatStorageBytes,
  spaceStorageState,
  type CreateSpaceInput,
  type InstanceDiskPublic,
  type InstanceFixPublic,
  type InstanceOverviewPublic,
  type InstanceServerPublic,
  type InstanceSpaceDetailPublic,
  type InstanceSpaceFilePublic,
  type InstanceSpacePublic,
  type InstanceUserPublic,
  type PublicUrlCheckPublic,
  type ServerSupervisor,
  type SpaceEventPublic,
  type SpaceSettingsPublic,
  type UpdateSpaceInput,
} from "@teamflow/core";
import { resolveDatabasePath, schema, type Db } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { getUploadDir, hardDeleteStoredFile } from "./attachments.js";
import { abortUploadSession } from "./chunkedUpload.js";
import { readDiskSpace } from "./disk.js";
import { getDiscordBotServiceStatus } from "./discordBotService.js";
import { badRequest, notFound } from "./errors.js";
import { getMaintenanceStatus } from "./maintenance.js";
import { getSpaceSettings } from "./spaceSettings.js";
import {
  asSpaceType,
  getAllSpaceUsage,
  getSpaceUsageBreakdown,
  sumBreakdown,
} from "./spaceStorage.js";
import { countOwnedFreeSpaces, createTeamWithOwner } from "./teams.js";

const startedAt = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- server and disk (local checks only) ---------- */

function detectSupervisor(): { supervisor: ServerSupervisor; serviceName: string | null } {
  if (process.env.INVOCATION_ID) {
    // systemd puts each service in its own cgroup, named after the unit.
    let serviceName: string | null = null;
    try {
      const cgroup = fs.readFileSync("/proc/self/cgroup", "utf8");
      serviceName = /([\w@.-]+\.service)/.exec(cgroup)?.[1] ?? null;
    } catch {
      serviceName = null;
    }
    return { supervisor: "systemd", serviceName };
  }
  if (fs.existsSync("/.dockerenv")) return { supervisor: "docker", serviceName: null };
  if (process.platform === "win32") {
    // NSSM leaves no marker the process can read without host tools.
    return { supervisor: "unknown", serviceName: null };
  }
  return { supervisor: "none", serviceName: null };
}

function serverInfo(version: string, commitShort: string | null): InstanceServerPublic {
  const { supervisor, serviceName } = detectSupervisor();
  return {
    version,
    commitShort,
    node: process.version,
    platform: process.platform,
    startedAt: startedAt.toISOString(),
    uptimeSec: Math.round(process.uptime()),
    listen: { host: config.host, port: config.port },
    publicUrl: config.publicUrl,
    supervisor,
    serviceName,
    production: config.isProduction,
  };
}

async function fileSize(filePath: string) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

async function databaseBytes(): Promise<number | null> {
  const dbPath = resolveDatabasePath(config.databaseUrl);
  if (dbPath === ":memory:") return null;
  const sizes = await Promise.all(
    [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map((file) => fileSize(file)),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

type SpaceRowRaw = {
  id: string;
  name: string;
  key: string;
  spaceType: string;
  capBytes: number | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  issueCount: number;
  createdAt: string;
};

/** Owner: the account a space counts against, else its oldest Owner-role member. */
const SPACE_SELECT = `
  SELECT t.id, t.name, t.key, t.space_type AS spaceType, t.storage_cap_bytes AS capBytes,
    t.created_at AS createdAt, u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail,
    (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS memberCount,
    (SELECT COUNT(*) FROM issues i WHERE i.team_id = t.id AND i.deleted_at IS NULL) AS issueCount
  FROM teams t
  LEFT JOIN users u ON u.id = COALESCE(t.space_owner_id, (
    SELECT m.user_id FROM team_members m JOIN team_roles r ON r.id = m.role_id
    WHERE m.team_id = t.id AND r.slug = 'owner' ORDER BY m.created_at LIMIT 1))`;

function mapSpace(row: SpaceRowRaw, usedBytes: number): InstanceSpacePublic {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    spaceType: asSpaceType(row.spaceType),
    capBytes: row.capBytes,
    usedBytes,
    state: spaceStorageState(usedBytes, row.capBytes),
    owner:
      row.ownerId && row.ownerName && row.ownerEmail
        ? { id: row.ownerId, name: row.ownerName, email: row.ownerEmail }
        : null,
    memberCount: row.memberCount,
    issueCount: row.issueCount,
    createdAt: row.createdAt,
  };
}

/** Every space, most used first. */
export function listSpaces(db: Db): InstanceSpacePublic[] {
  const rows = db.$client.prepare(`${SPACE_SELECT} ORDER BY t.created_at`).all() as SpaceRowRaw[];
  const usage = getAllSpaceUsage(db);
  return rows
    .map((row) => mapSpace(row, usage.get(row.id) ?? 0))
    .sort((a, b) => b.usedBytes - a.usedBytes || a.name.localeCompare(b.name));
}

async function diskInfo(db: Db, spaces: InstanceSpacePublic[], backupsBytes: number | null) {
  const settings = getSpaceSettings(db);
  const disk = await readDiskSpace(getUploadDir());
  const capped = spaces.filter((space) => space.capBytes !== null);
  const result: InstanceDiskPublic = {
    totalBytes: disk?.totalBytes ?? null,
    freeBytes: disk?.freeBytes ?? null,
    uploadDir: getUploadDir(),
    uploadsBytes: spaces.reduce((sum, space) => sum + space.usedBytes, 0),
    databaseBytes: await databaseBytes(),
    backupsBytes,
    floorBytes: settings.minFreeDiskBytes,
    diskLow:
      settings.minFreeDiskBytes > 0 && disk !== null && disk.freeBytes < settings.minFreeDiskBytes,
    allocatedCapBytes: capped.reduce((sum, space) => sum + (space.capBytes ?? 0), 0),
    cappedSpaces: capped.length,
    uncappedSpaces: spaces.length - capped.length,
  };
  return result;
}

/* ---------- common fixes ---------- */

export function collectFixes(input: {
  server: InstanceServerPublic;
  disk: InstanceDiskPublic;
  bot: InstanceOverviewPublic["bot"];
  maintenance: InstanceOverviewPublic["maintenance"];
  spaces: InstanceSpacePublic[];
  settings: SpaceSettingsPublic;
  now?: Date;
}): InstanceFixPublic[] {
  const { server, disk, bot, maintenance, spaces } = input;
  const now = input.now ?? new Date();
  const fixes: InstanceFixPublic[] = [];
  const add = (fix: InstanceFixPublic) => fixes.push(fix);

  if (disk.freeBytes === null) {
    add({
      id: "disk-unreadable",
      severity: "warn",
      title: "Free disk space could not be read",
      detail: `The server could not check the disk holding ${disk.uploadDir}, so the free-disk floor is not enforced.`,
    });
  } else if (disk.diskLow) {
    add({
      id: "disk-low",
      severity: "bad",
      title: "Uploads are paused: the disk is almost full",
      detail: `${formatStorageBytes(disk.freeBytes)} free, under the ${formatStorageBytes(disk.floorBytes)} floor. Free space on the server or lower caps.`,
    });
  } else if (disk.floorBytes > 0 && disk.freeBytes < disk.floorBytes * 2) {
    add({
      id: "disk-getting-full",
      severity: "warn",
      title: "The disk is getting full",
      detail: `${formatStorageBytes(disk.freeBytes)} free; uploads pause under ${formatStorageBytes(disk.floorBytes)}.`,
    });
  }
  if (disk.freeBytes !== null) {
    const unusedCaps = spaces.reduce(
      (sum, space) =>
        space.capBytes === null ? sum : sum + Math.max(0, space.capBytes - space.usedBytes),
      0,
    );
    if (unusedCaps > disk.freeBytes) {
      add({
        id: "caps-exceed-disk",
        severity: "info",
        title: "Caps add up to more than the free disk",
        detail: `Spaces could still upload ${formatStorageBytes(unusedCaps)}; ${formatStorageBytes(disk.freeBytes)} is free. The floor still protects the server.`,
      });
    }
  }

  const full = spaces.filter((space) => space.state === "full");
  if (full.length > 0) {
    add({
      id: "spaces-full",
      severity: "info",
      title: `${full.length} space${full.length === 1 ? " is" : "s are"} full`,
      detail: `${full.map((space) => space.name).join(", ")}: uploads are paused there until files are removed or the cap is raised.`,
    });
  }

  if (server.production && /localhost|127\.0\.0\.1/.test(server.publicUrl)) {
    add({
      id: "public-url-unset",
      severity: "warn",
      title: "PUBLIC_URL still points at localhost",
      detail:
        "Password-reset links and the Discord bot use it. Set PUBLIC_URL in .env and restart.",
    });
  }
  if (server.production && server.supervisor === "none") {
    add({
      id: "no-service",
      severity: "info",
      title: "The server is not running as a service",
      detail:
        "It will not restart after a crash or reboot. Install the systemd unit or NSSM service.",
    });
  }

  if (!maintenance.enabled) {
    add({
      id: "maintenance-off",
      severity: "info",
      title: "Updates and backups from the app are off",
      detail: maintenance.reason ?? "Set TEAMFLOW_MAINTENANCE_ENABLED=true on a Linux host.",
    });
  } else {
    const latest = maintenance.backups
      .map((backup) => Date.parse(backup.createdAt))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    if (latest === undefined) {
      add({
        id: "no-backups",
        severity: "warn",
        title: "No backups yet",
        detail: "Run a full backup from Updates & backups.",
      });
    } else if (now.getTime() - latest > 7 * DAY_MS) {
      add({
        id: "backup-old",
        severity: "warn",
        title: "The last backup is more than a week old",
        detail: "Run a backup, or schedule sudo teamflow-backup.",
      });
    }
    if (latest !== undefined && !maintenance.backups.some((backup) => backup.kind === "uploads")) {
      add({
        id: "uploads-not-backed-up",
        severity: "warn",
        title: "Uploads are not in any backup",
        detail: "Database-only backups skip data/uploads. Run a full backup.",
      });
    }
    if (!maintenance.sudoReady) {
      add({
        id: "maintenance-sudo",
        severity: "warn",
        title: "Update and backup scripts cannot run",
        detail: maintenance.sudoDetail ?? "sudo is not set up for the teamflow user.",
      });
    }
    if (maintenance.version.updateAvailable) {
      add({
        id: "update-available",
        severity: "info",
        title: "An update is available",
        detail:
          maintenance.version.commitsBehind !== null
            ? `${maintenance.version.commitsBehind} commit(s) behind ${maintenance.version.branch ?? "the remote"}.`
            : "The remote branch has newer commits.",
      });
    }
  }

  if (bot.credentialsConfigured) {
    if (bot.state === "failed") {
      add({
        id: "bot-failed",
        severity: "bad",
        title: "The Discord bot service has failed",
        detail: "Check its log, fix the cause (often a revoked PAT or bot token), then restart it.",
      });
    } else if (bot.state === "stopped" && bot.unitEnabled) {
      add({
        id: "bot-stopped",
        severity: "warn",
        title: "The Discord bot is stopped",
        detail: "It is enabled but not running. Start or restart it.",
      });
    } else if (bot.state === "not_installed") {
      add({
        id: "bot-not-installed",
        severity: "info",
        title: "The Discord bot service is not installed",
        detail: "Credentials are saved but the teamflow-discord unit is not installed.",
      });
    }
  }

  const order = { bad: 0, warn: 1, info: 2 } as const;
  return fixes.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ---------- overview ---------- */

export async function getInstanceOverview(db: Db): Promise<InstanceOverviewPublic> {
  const [maintenance, bot] = await Promise.all([
    getMaintenanceStatus(),
    getDiscordBotServiceStatus(db),
  ]);
  const spaces = listSpaces(db);
  const settings = getSpaceSettings(db);
  const backupsBytes = maintenance.enabled
    ? maintenance.backups.reduce((sum, backup) => sum + backup.sizeBytes, 0)
    : null;
  const disk = await diskInfo(db, spaces, backupsBytes);
  const server = serverInfo(maintenance.version.version, maintenance.version.commitShort);
  return {
    checkedAt: new Date().toISOString(),
    server,
    disk,
    bot,
    maintenance,
    spaces: {
      count: spaces.length,
      admin: spaces.filter((space) => space.spaceType === "admin").length,
      free: spaces.filter((space) => space.spaceType === "free").length,
      nearLimit: spaces.filter((space) => space.state === "warn").length,
      full: spaces.filter((space) => space.state === "full").length,
    },
    settings,
    fixes: collectFixes({ server, disk, bot, maintenance, spaces, settings }),
  };
}

/** Ask PUBLIC_URL/health from the server itself (proxy, DNS and TLS in the path). */
export async function checkPublicUrl(
  fetchImpl: typeof fetch = fetch,
): Promise<PublicUrlCheckPublic> {
  const url = `${config.publicUrl}/health`;
  const started = Date.now();
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000), redirect: "manual" });
    return { url, ok: res.ok, status: res.status, error: null, ms: Date.now() - started };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { url, ok: false, status: null, error, ms: Date.now() - started };
  }
}

/* ---------- spaces ---------- */

function recordEvent(
  db: Db,
  teamId: string,
  actorId: string | null,
  kind: string,
  detail: string | null,
) {
  db.insert(schema.spaceEvents)
    .values({ teamId, actorId, kind, detail, createdAt: new Date().toISOString() })
    .run();
}

function capLabel(capBytes: number | null) {
  return capBytes === null ? "no limit" : formatStorageBytes(capBytes);
}

function getSpaceRaw(db: Db, teamId: string) {
  const row = db.$client.prepare(`${SPACE_SELECT} WHERE t.id = ?`).get(teamId) as
    SpaceRowRaw | undefined;
  if (!row) throw notFound("Space not found");
  return row;
}

export function getSpaceDetail(db: Db, teamId: string): InstanceSpaceDetailPublic {
  const row = getSpaceRaw(db, teamId);
  const breakdown = getSpaceUsageBreakdown(db, teamId);
  const usedBytes = sumBreakdown(breakdown);
  const base = mapSpace(row, usedBytes);

  const largestFiles = (
    db.$client
      .prepare(
        `SELECT f.id AS fileId, f.filename, f.size_bytes AS sizeBytes, f.deleted_at AS deletedAt,
           f.created_at AS createdAt, u.name AS uploaderName,
           (SELECT t.key || '-' || i.number FROM issue_file_links l
              JOIN issues i ON i.id = l.issue_id JOIN teams t ON t.id = i.team_id
              WHERE l.file_id = f.id LIMIT 1) AS issueRef,
           (SELECT r.name FROM row_file_links l JOIN board_rows r ON r.id = l.row_id
              WHERE l.file_id = f.id LIMIT 1) AS rowName
         FROM stored_files f JOIN users u ON u.id = f.uploader_id
         WHERE f.team_id = ? ORDER BY f.size_bytes DESC LIMIT 10`,
      )
      .all(teamId) as (Omit<InstanceSpaceFilePublic, "usedBy"> & {
      issueRef: string | null;
      rowName: string | null;
    })[]
  ).map(({ issueRef, rowName, ...file }) => ({
    ...file,
    usedBy: issueRef ?? (rowName ? `Row "${rowName}"` : null),
  }));

  const oldestTrash = db.$client
    .prepare(
      "SELECT MIN(deleted_at) AS deletedAt FROM stored_files WHERE team_id = ? AND deleted_at IS NOT NULL",
    )
    .get(teamId) as { deletedAt: string | null };
  const oldestMs = oldestTrash.deletedAt ? Date.parse(oldestTrash.deletedAt) : NaN;

  const events = db.$client
    .prepare(
      `SELECT e.id, e.kind, e.detail, e.created_at AS createdAt, u.name AS actorName
       FROM space_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.team_id = ? ORDER BY e.created_at DESC, e.rowid DESC LIMIT 20`,
    )
    .all(teamId) as SpaceEventPublic[];

  return {
    ...base,
    breakdown,
    remainingBytes: base.capBytes === null ? null : Math.max(0, base.capBytes - usedBytes),
    largestFiles,
    nextTrashPurgeAt: Number.isFinite(oldestMs)
      ? new Date(oldestMs + FILE_TRASH_RETENTION_DAYS * DAY_MS).toISOString()
      : null,
    events,
    ownerFreeSpaces: base.owner ? countOwnedFreeSpaces(db, base.owner.id) : null,
  };
}

/**
 * Create a space from the admin page. The owner gets the Owner role; the admin does not join
 * unless they are the owner. Free spaces always get the free-space default cap; admins may
 * give one user more free spaces than the per-user limit.
 */
export function createSpace(db: Db, actorId: string, input: CreateSpaceInput) {
  const ownerId = input.ownerUserId ?? actorId;
  const owner = db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, ownerId))
    .get();
  if (!owner) throw badRequest("Owner not found");

  const settings = getSpaceSettings(db);
  const storageCapBytes =
    input.spaceType === "free" ? settings.freeSpaceCapBytes : (input.capBytes ?? null);

  const team = db.transaction((tx) => {
    const created = createTeamWithOwner(tx, {
      userId: owner.id,
      userName: owner.name,
      name: input.name,
      key: input.key,
      role: "owner",
      space: { spaceType: input.spaceType, storageCapBytes, spaceOwnerId: owner.id },
    });
    tx.insert(schema.spaceEvents)
      .values({
        teamId: created.id,
        actorId,
        kind: "created",
        createdAt: new Date().toISOString(),
        detail: `${input.spaceType === "free" ? "Free" : "Admin"} space for ${owner.name}, cap ${capLabel(storageCapBytes)}`,
      })
      .run();
    return created;
  });
  return getSpaceDetail(db, team.id);
}

/** Change a space's type or cap. Lowering a cap deletes nothing; it only blocks new uploads. */
export function updateSpace(db: Db, actorId: string, teamId: string, input: UpdateSpaceInput) {
  const current = getSpaceRaw(db, teamId);
  const currentType = asSpaceType(current.spaceType);
  const nextType = input.spaceType ?? currentType;
  let nextCap = input.capBytes !== undefined ? input.capBytes : current.capBytes;
  // An admin space with no limit turned free gets the free-space default unless a cap is given.
  if (
    nextType === "free" &&
    currentType !== "free" &&
    input.capBytes === undefined &&
    nextCap === null
  ) {
    nextCap = getSpaceSettings(db).freeSpaceCapBytes;
  }

  db.transaction((tx) => {
    tx.update(schema.teams)
      .set({ spaceType: nextType, storageCapBytes: nextCap })
      .where(eq(schema.teams.id, teamId))
      .run();
  });
  if (nextType !== currentType) {
    recordEvent(db, teamId, actorId, "type_changed", `${currentType} → ${nextType}`);
  }
  if (nextCap !== current.capBytes) {
    recordEvent(
      db,
      teamId,
      actorId,
      "cap_changed",
      `${capLabel(current.capBytes)} → ${capLabel(nextCap)}`,
    );
  }
  return getSpaceDetail(db, teamId);
}

/** Delete every file in the space's Files trash now instead of after 7 days. */
export async function emptySpaceTrash(db: Db, actorId: string, teamId: string) {
  getSpaceRaw(db, teamId);
  const inTrash = db.$client
    .prepare(
      "SELECT id, size_bytes AS sizeBytes FROM stored_files WHERE team_id = ? AND deleted_at IS NOT NULL",
    )
    .all(teamId) as { id: string; sizeBytes: number }[];
  for (const file of inTrash) await hardDeleteStoredFile(db, file.id);
  const freed = inTrash.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (inTrash.length > 0) {
    recordEvent(
      db,
      teamId,
      actorId,
      "trash_emptied",
      `${inTrash.length} file(s), ${formatStorageBytes(freed)} freed`,
    );
  }
  return { deletedFiles: inTrash.length, freedBytes: freed };
}

/** Abort the space's chunked uploads in progress (their reservations stop counting). */
export async function cancelSpaceUploads(db: Db, actorId: string, teamId: string) {
  getSpaceRaw(db, teamId);
  const sessions = db.$client
    .prepare(
      `SELECT s.id, s.total_bytes AS totalBytes FROM upload_sessions s
       WHERE s.status = 'pending'
         AND (s.issue_id IN (SELECT id FROM issues WHERE team_id = ?)
           OR s.row_id IN (SELECT id FROM board_rows WHERE team_id = ?))`,
    )
    .all(teamId, teamId) as { id: string; totalBytes: number }[];
  for (const session of sessions) await abortUploadSession(db, session.id);
  if (sessions.length > 0) {
    recordEvent(db, teamId, actorId, "uploads_cancelled", `${sessions.length} upload(s) cancelled`);
  }
  return { cancelledUploads: sessions.length };
}

/* ---------- users (owner picker) ---------- */

export function listInstanceUsers(db: Db, query: string | undefined): InstanceUserPublic[] {
  const like = `%${(query ?? "").trim().toLowerCase()}%`;
  const rows = db.$client
    .prepare(
      `SELECT u.id, u.name, u.email, u.is_instance_admin AS isInstanceAdmin,
         (SELECT COUNT(*) FROM teams t WHERE t.space_owner_id = u.id AND t.space_type = 'free') AS freeSpaces
       FROM users u WHERE lower(u.name) LIKE ? OR lower(u.email) LIKE ?
       ORDER BY u.name LIMIT 50`,
    )
    .all(like, like) as (Omit<InstanceUserPublic, "isInstanceAdmin"> & {
    isInstanceAdmin: number;
  })[];
  return rows.map((row) => ({ ...row, isInstanceAdmin: row.isInstanceAdmin === 1 }));
}
