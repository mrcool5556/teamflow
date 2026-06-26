import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { open } from "node:fs/promises";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  MaintenanceBackupPublic,
  MaintenanceJobPublic,
  MaintenanceStatusPublic,
  RunMaintenanceBackupInput,
  RunMaintenanceUpdateInput,
} from "@teamflow/core";
import { inferMaintenanceJobOutcome } from "@teamflow/core";
import { findRepoRoot } from "@teamflow/db";
import { getMaintenanceVersionInfo } from "./versionInfo.js";

const JOB_FILE = "maintenance-job.json";
const LOG_FILE = "maintenance.log";
const LOG_TAIL_BYTES = 12_000;

function getAppDir() {
  const configured = process.env.TEAMFLOW_APP_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(findRepoRoot(), configured);
  }
  return findRepoRoot();
}

function getDataDir() {
  return path.join(getAppDir(), "data");
}

function isMaintenanceEnabled() {
  return process.env.TEAMFLOW_MAINTENANCE_ENABLED === "true";
}

function getBackupDir() {
  const configured = process.env.TEAMFLOW_BACKUP_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(getAppDir(), configured);
  }
  return "/var/backups/teamflow";
}

function resolveScriptPath(configured: string | undefined, installedPath: string, repoRelative: string) {
  if (configured?.trim()) {
    const value = configured.trim();
    return path.isAbsolute(value) ? value : path.resolve(getAppDir(), value);
  }
  if (existsSync(installedPath)) return installedPath;
  return path.join(getAppDir(), repoRelative);
}

function getBackupScript() {
  return resolveScriptPath(
    process.env.TEAMFLOW_BACKUP_SCRIPT,
    "/usr/local/bin/teamflow-backup",
    "deploy/proxmox-lxc/backup.sh",
  );
}

function getUpdateScript() {
  return resolveScriptPath(
    process.env.TEAMFLOW_UPDATE_SCRIPT,
    "/usr/local/bin/teamflow-update",
    "deploy/proxmox-lxc/update.sh",
  );
}

function useSudo() {
  return process.env.TEAMFLOW_MAINTENANCE_SUDO !== "false";
}

function disabledReason(): string | null {
  if (!isMaintenanceEnabled()) {
    return "Server maintenance is disabled. Set TEAMFLOW_MAINTENANCE_ENABLED=true on the host.";
  }
  if (process.platform === "win32") {
    return "In-app maintenance is only supported on Linux server installs.";
  }
  return null;
}

function backupKindFromName(name: string): MaintenanceBackupPublic["kind"] {
  if (name.includes("uploads")) return "uploads";
  return "database";
}

async function readLogTail(): Promise<string> {
  const logPath = path.join(getDataDir(), LOG_FILE);
  try {
    const stat = await fs.stat(logPath);
    const start = Math.max(0, stat.size - LOG_TAIL_BYTES);
    const handle = await fs.open(logPath, "r");
    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

type StoredJob = Omit<MaintenanceJobPublic, "logTail"> & {
  pid?: number;
};

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reconcileStaleJob() {
  const job = await readStoredJob();
  if (!job || job.status !== "running") return;

  if (job.pid && isProcessRunning(job.pid)) return;

  const logPath = path.join(getDataDir(), LOG_FILE);
  const log = await readLogTail();
  const outcome = inferMaintenanceJobOutcome(job.type, log);

  if (
    job.type === "update" &&
    outcome === "failed" &&
    log.includes("App dir:") &&
    !log.includes("Health:") &&
    !log.includes("SQLite backup") &&
    !log.includes("PostgreSQL backup")
  ) {
    await fs.appendFile(
      logPath,
      "\nUpdate stopped when the app restarted itself (fixed in newer builds — deploy latest, then retry).\n",
    );
  }

  await writeStoredJob({
    ...job,
    status: outcome,
    finishedAt: new Date().toISOString(),
  });
}

async function readStoredJob(): Promise<StoredJob | null> {
  const jobPath = path.join(getDataDir(), JOB_FILE);
  try {
    const raw = await fs.readFile(jobPath, "utf8");
    const parsed = JSON.parse(raw) as StoredJob;
    if (!parsed?.id || !parsed.type || !parsed.status) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeStoredJob(job: StoredJob) {
  const dataDir = getDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, JOB_FILE), JSON.stringify(job, null, 2), "utf8");
}

async function mapJob(job: StoredJob | null): Promise<MaintenanceJobPublic | null> {
  if (!job) return null;
  return {
    ...job,
    logTail: await readLogTail(),
  };
}

async function listBackups(): Promise<MaintenanceBackupPublic[]> {
  const backupDir = getBackupDir();
  let entries: string[];
  try {
    entries = await fs.readdir(backupDir);
  } catch {
    return [];
  }

  const backups: MaintenanceBackupPublic[] = [];
  for (const name of entries) {
    if (!/^teamflow_.+\.(db|sql|tar\.gz)$/.test(name)) continue;
    const fullPath = path.join(backupDir, name);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) continue;
      backups.push({
        name,
        kind: backupKindFromName(name),
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      });
    } catch {
      continue;
    }
  }

  return backups.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

const BASH_PATH = "/usr/bin/bash";
const INSTALLED_SCRIPT_PREFIX = "/usr/local/bin/";

function scriptUsesDirectSudo(script: string) {
  return script.startsWith(INSTALLED_SCRIPT_PREFIX);
}

function formatCommand(command: string, args: string[]) {
  return [command, ...args].join(" ");
}

function buildSpawnArgs(script: string, args: string[]) {
  if (process.platform === "win32") {
    return { command: "bash", args: [script, ...args] };
  }
  if (useSudo()) {
    if (scriptUsesDirectSudo(script)) {
      return { command: "sudo", args: ["-n", script, ...args] };
    }
    return { command: "sudo", args: ["-n", BASH_PATH, script, ...args] };
  }
  return { command: BASH_PATH, args: [script, ...args] };
}

async function probeSudo(script: string): Promise<{ ready: boolean; command: string; detail: string }> {
  if (!useSudo() || process.platform === "win32") {
    return { ready: true, command: "", detail: "sudo not required" };
  }
  if (!existsSync(script)) {
    return { ready: false, command: "", detail: `Script missing: ${script}` };
  }

  const { command, args } = buildSpawnArgs(script, ["--help"]);
  const cmdline = formatCommand(command, args);

  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      resolve({ ready: false, command: cmdline, detail: err.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ready: true, command: cmdline, detail: "ok" });
        return;
      }
      const detail = stderr.trim() || `exit ${code ?? "unknown"}`;
      resolve({ ready: false, command: cmdline, detail });
    });
  });
}

async function assertJobIdle() {
  await reconcileStaleJob();
  const current = await readStoredJob();
  if (current?.status === "running") {
    throw new Error("A maintenance job is already running. Wait for it to finish.");
  }
}

async function startJob(
  type: MaintenanceJobPublic["type"],
  script: string,
  args: string[],
  options: MaintenanceJobPublic["options"],
) {
  await assertJobIdle();

  const dataDir = getDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  const logPath = path.join(dataDir, LOG_FILE);
  await fs.writeFile(logPath, "", "utf8");

  const job: StoredJob = {
    id: randomUUID(),
    type,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    options,
  };
  await writeStoredJob(job);

  const { command, args: spawnArgs } = buildSpawnArgs(script, args);
  const env = {
    ...process.env,
    APP_DIR: getAppDir(),
    BACKUP_DIR: getBackupDir(),
    MAINTENANCE_LOG: logPath,
  };

  await fs.appendFile(logPath, `> ${formatCommand(command, spawnArgs)}\n`);

  const logHandle = await open(logPath, "a");
  try {
    const child = spawn(command, spawnArgs, {
      detached: true,
      stdio: ["ignore", logHandle.fd, logHandle.fd],
      env,
      windowsHide: true,
    });

    child.on("error", (err) => {
      void (async () => {
        await fs.appendFile(logPath, `\n${err.message}\n`);
        const latest = await readStoredJob();
        if (!latest || latest.id !== job.id) return;
        await writeStoredJob({
          ...latest,
          status: "failed",
          finishedAt: new Date().toISOString(),
        });
      })();
    });

    if (!child.pid) {
      throw new Error("Failed to start maintenance process");
    }

    await writeStoredJob({ ...job, pid: child.pid });
    child.unref();
  } finally {
    await logHandle.close();
  }

  return mapJob(await readStoredJob());
}

export async function getMaintenanceStatus(): Promise<MaintenanceStatusPublic> {
  await reconcileStaleJob();
  const reason = disabledReason();
  const backupScript = getBackupScript();
  const updateScript = getUpdateScript();
  const enabled = reason === null;
  const backups = enabled ? await listBackups() : [];
  const job = await mapJob(await readStoredJob());
  const sudoProbe = enabled ? await probeSudo(backupScript) : { ready: false, command: "", detail: reason };
  const version = await getMaintenanceVersionInfo({
    skipOriginCheck: job?.status === "running",
  });

  return {
    enabled,
    reason,
    platform: process.platform,
    backupScriptReady: existsSync(backupScript),
    updateScriptReady: existsSync(updateScript),
    backupScript: enabled ? backupScript : null,
    updateScript: enabled ? updateScript : null,
    sudoReady: sudoProbe.ready,
    sudoDetail: enabled
      ? sudoProbe.ready
        ? null
        : `${sudoProbe.detail}${sudoProbe.command ? ` (${sudoProbe.command})` : ""}`
      : null,
    backupDir: enabled ? getBackupDir() : null,
    backups,
    job,
    version,
  };
}

export async function runMaintenanceBackup(input: RunMaintenanceBackupInput) {
  const reason = disabledReason();
  if (reason) throw new Error(reason);

  const script = getBackupScript();
  if (!existsSync(script)) {
    throw new Error(`Backup script not found at ${script}`);
  }

  const args = input.full ? ["--full"] : ["--db-only"];
  const job = await startJob("backup", script, args, { full: input.full });
  if (!job) throw new Error("Failed to start backup job");
  return job;
}

export async function runMaintenanceUpdate(input: RunMaintenanceUpdateInput) {
  const reason = disabledReason();
  if (reason) throw new Error(reason);

  const script = getUpdateScript();
  if (!existsSync(script)) {
    throw new Error(`Update script not found at ${script}`);
  }

  const args: string[] = [];
  if (input.skipBackup) args.push("--skip-backup");
  if (input.backupFull) args.push("--backup-full");
  if (input.branch) {
    args.push("--branch", input.branch);
  }

  const job = await startJob("update", script, args, {
    backupFull: input.backupFull,
    skipBackup: input.skipBackup,
    branch: input.branch,
  });
  if (!job) throw new Error("Failed to start update job");
  return job;
}

export async function getMaintenanceJob() {
  await reconcileStaleJob();
  return mapJob(await readStoredJob());
}

export async function dismissMaintenanceJob() {
  await reconcileStaleJob();
  const job = await readStoredJob();
  if (!job) return null;

  if (job.status === "running") {
    if (job.pid && isProcessRunning(job.pid)) {
      throw new Error("Job is still running on the server.");
    }
    const log = await readLogTail();
    const outcome = inferMaintenanceJobOutcome(job.type, log);
    await writeStoredJob({
      ...job,
      status: outcome,
      finishedAt: new Date().toISOString(),
    });
  }

  return mapJob(await readStoredJob());
}
