import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BACKUP_KEEP_MAX,
  BACKUP_KEEP_MIN,
  backupKindFromName,
  DEFAULT_BACKUP_RETENTION,
  MAINTENANCE_BACKUP_NAME,
  type BackupRetention,
  type MaintenanceBackupListPublic,
  type MaintenanceBackupPublic,
} from "@teamflow/core";
import { config } from "../config.js";
import { badRequest, internalError, notFound } from "./errors.js";
import { buildSpawnArgs, INSTALLED_SCRIPT_DIR, useSudo } from "./hostScripts.js";

/**
 * The backup folder: list, delete one file, and the keep-N settings that backup.sh / backup.ps1
 * apply after each backup. The rules live in @teamflow/core (backupKindFromName); the root-owned
 * backup-files.sh checks them again before it deletes anything.
 */

/** Read by backup.sh (as root) and backup.ps1. Only two integers; anything else means default. */
export const RETENTION_FILE = "backup-settings.json";

function retentionPath() {
  return path.join(config.appDir, "data", RETENTION_FILE);
}

function validKeep(value: unknown, fallback: number) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= BACKUP_KEEP_MIN &&
    value <= BACKUP_KEEP_MAX
    ? value
    : fallback;
}

export async function readBackupRetention(): Promise<BackupRetention> {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(await fs.readFile(retentionPath(), "utf8")) ?? {};
  } catch {
    // missing or unreadable: defaults
  }
  return {
    keepDatabaseBackups: validKeep(
      raw.keepDatabaseBackups,
      DEFAULT_BACKUP_RETENTION.keepDatabaseBackups,
    ),
    keepUploadArchives: validKeep(
      raw.keepUploadArchives,
      DEFAULT_BACKUP_RETENTION.keepUploadArchives,
    ),
  };
}

/** Written atomically, so a backup running meanwhile reads the old or the new file, never half. */
export async function writeBackupRetention(value: BackupRetention) {
  const file = retentionPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
  return readBackupRetention();
}

export function getBackupDir() {
  return config.maintenance.backupDir;
}

/** Every teamflow-named regular file in the backup folder, newest first. */
export async function listBackupFiles(): Promise<MaintenanceBackupPublic[]> {
  const dir = getBackupDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files: Array<Omit<MaintenanceBackupPublic, "deletable"> & { mtimeMs: number }> = [];
  for (const name of entries) {
    const kind = backupKindFromName(name);
    if (!kind) continue;
    try {
      const stat = await fs.lstat(path.join(dir, name));
      if (!stat.isFile()) continue; // no links, folders or devices
      files.push({
        name,
        kind,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        restorable: kind !== "uploads" && MAINTENANCE_BACKUP_NAME.test(name),
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      continue;
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  const newestDb = files.find((f) => f.kind === "database")?.name;
  return files.map(({ mtimeMs: _mtime, ...f }) => ({ ...f, deletable: f.name !== newestDb }));
}

export async function getBackupList(): Promise<MaintenanceBackupListPublic> {
  const enabled = config.maintenance.enabled;
  const backups = enabled ? await listBackupFiles() : [];
  return {
    backups,
    totalBytes: backups.reduce((sum, b) => sum + b.sizeBytes, 0),
    backupDir: enabled ? getBackupDir() : null,
    retention: await readBackupRetention(),
  };
}

function getBackupFilesScript() {
  const installed = `${INSTALLED_SCRIPT_DIR}backup-files.sh`;
  if (existsSync(installed)) return installed;
  return path.join(config.appDir, "deploy", "proxmox-lxc", "backup-files.sh");
}

/** Linux with sudo: the root-owned backup-files.sh deletes (the folder belongs to root). */
function runDeleteScript(name: string): Promise<{ code: number; output: string }> {
  const { command, args } = buildSpawnArgs(getBackupFilesScript(), ["delete", name]);
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (c: Buffer) => (output += c.toString("utf8")));
    child.stderr?.on("data", (c: Buffer) => (output += c.toString("utf8")));
    child.on("error", (err) => resolve({ code: -1, output: err.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, output }));
  });
}

/**
 * Delete one backup by name. Refuses names outside the listing (paths, other files), links,
 * and the newest database backup.
 */
export async function deleteBackupFile(name: string): Promise<MaintenanceBackupListPublic> {
  if (!config.maintenance.enabled) {
    throw badRequest(
      "Server maintenance is disabled. Set TEAMFLOW_MAINTENANCE_ENABLED=true on the host.",
    );
  }
  if (!backupKindFromName(name) || path.basename(name) !== name) {
    throw badRequest(`Not a Teamflow backup name: ${name}`);
  }
  const backup = (await listBackupFiles()).find((b) => b.name === name);
  if (!backup) throw notFound(`No backup named ${name}`);
  if (!backup.deletable) {
    throw badRequest("The newest database backup can't be deleted.");
  }

  if (process.platform === "win32" || !useSudo()) {
    await fs.rm(path.join(getBackupDir(), name));
  } else {
    const { code, output } = await runDeleteScript(name);
    if (code !== 0) {
      const fail = output.match(/^FAIL \S+ (.*)$/m)?.[1];
      if (fail) throw badRequest(fail);
      throw internalError(`backup-files.sh failed: ${output.trim().slice(0, 300)}`);
    }
  }
  return getBackupList();
}
