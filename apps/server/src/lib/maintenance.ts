import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { open } from "node:fs/promises";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  MaintenanceChannel,
  MaintenanceJobPublic,
  MaintenanceLogSummary,
  MaintenanceReleaseCheckPublic,
  MaintenanceStatusPublic,
  MaintenanceUpdateState,
  RunMaintenanceBackupInput,
  RunMaintenanceRestoreInput,
  RunMaintenanceUpdateInput,
} from "@teamflow/core";
import { inferMaintenanceJobOutcome, parseMaintenanceLog } from "@teamflow/core";
import { config } from "../config.js";
import { getReleaseCheck, isUpdateAvailable, writeChannel } from "./releaseCheck.js";
import { buildJobSpawn, formatCommand, INSTALLED_SCRIPT_DIR, probeSudo } from "./hostScripts.js";
import { badRequest, internalError } from "./errors.js";
import { getBackupDir, listBackupFiles } from "./backupFiles.js";

const JOB_FILE = "maintenance-job.json";
const LOG_FILE = "maintenance.log";
/** Windows: the PowerShell job writes its PID here (the spawned cmd.exe exits at once). */
const JOB_PID_FILE = "maintenance-job.pid";
/** How long a Windows job may take to start PowerShell and write its PID file. */
const JOB_START_GRACE_MS = 60_000;
const LOG_TAIL_BYTES = 12_000;

function getDataDir() {
  return path.join(config.appDir, "data");
}

function isMaintenanceEnabled() {
  return config.maintenance.enabled;
}

/**
 * Linux: configured path (already absolute) > root-owned installed copy > checkout copy.
 * Windows: configured path > the running release's deploy\windows script > checkout copy.
 */
function resolveScriptPath(
  configured: string | undefined,
  installedPath: string,
  repoRelative: string,
) {
  if (configured) return configured;
  if (process.platform === "win32") {
    const name = path.basename(repoRelative).replace(/\.sh$/, ".ps1");
    const release = path.join(config.appDir, "current", "deploy", "windows", name);
    if (existsSync(release)) return release;
    return path.join(config.appDir, "deploy", "windows", name);
  }
  if (existsSync(installedPath)) return installedPath;
  return path.join(config.appDir, repoRelative);
}

export { INSTALLED_SCRIPT_DIR };

function getBackupScript() {
  return resolveScriptPath(
    config.maintenance.backupScript,
    `${INSTALLED_SCRIPT_DIR}backup.sh`,
    "deploy/proxmox-lxc/backup.sh",
  );
}

function getUpdateScript() {
  return resolveScriptPath(
    config.maintenance.updateScript,
    `${INSTALLED_SCRIPT_DIR}update.sh`,
    "deploy/proxmox-lxc/update.sh",
  );
}

function getRestoreScript() {
  return resolveScriptPath(
    undefined,
    `${INSTALLED_SCRIPT_DIR}restore.sh`,
    "deploy/proxmox-lxc/restore.sh",
  );
}

function disabledReason(): string | null {
  if (!isMaintenanceEnabled()) {
    return "Server maintenance is disabled. Set TEAMFLOW_MAINTENANCE_ENABLED=true on the host.";
  }
  return null;
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
  } catch (err) {
    // The update runs as root through sudo: signalling it is refused (EPERM) but it is alive.
    // Treating that as "gone" marked updates failed while they were still finishing.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Is the job's process still alive? On Windows the PID comes from the script's PID file. */
async function jobAlive(job: StoredJob) {
  if (process.platform === "win32") {
    try {
      const raw = await fs.readFile(path.join(getDataDir(), JOB_PID_FILE), "utf8");
      const pid = Number.parseInt(raw.trim(), 10);
      if (Number.isFinite(pid) && pid > 0) return isProcessRunning(pid);
    } catch {
      // not written yet
    }
    return Date.now() - Date.parse(job.startedAt) < JOB_START_GRACE_MS;
  }
  return Boolean(job.pid && isProcessRunning(job.pid));
}

async function reconcileStaleJob() {
  const job = await readStoredJob();
  if (!job || job.status !== "running") return;

  if (await jobAlive(job)) return;

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

async function assertJobIdle() {
  await reconcileStaleJob();
  const current = await readStoredJob();
  if (current?.status === "running") {
    throw badRequest("A maintenance job is already running. Wait for it to finish.");
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

  const { command, args: spawnArgs, verbatim } = buildJobSpawn(script, args);
  // A PID file left by an earlier job must not speak for this one (Windows, see jobPid).
  await fs.rm(path.join(dataDir, JOB_PID_FILE), { force: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APP_DIR: config.appDir,
    BACKUP_DIR: getBackupDir(),
    MAINTENANCE_LOG: logPath,
    // Windows: update.ps1 / restore.ps1 stop this process when no service manager does it.
    TEAMFLOW_SERVER_PID: String(process.pid),
  };
  // Set by update.ps1 / restore.ps1 for their own child backup; a server they restarted inherits it.
  delete env.TEAMFLOW_NESTED_JOB;
  // Windows PowerShell 5.1 cannot load its own modules (Get-FileHash...) with PowerShell 7's
  // module path, which a server started from PowerShell 7 inherits. Unset, 5.1 uses its default.
  if (process.platform === "win32") {
    for (const key of Object.keys(env)) if (key.toLowerCase() === "psmodulepath") delete env[key];
  }

  await fs.appendFile(logPath, `> ${formatCommand(command, spawnArgs)}\n`);

  // Update and restore stop teamflow: they must survive as detached root processes that write
  // their own log (update.sh / restore.sh redirect themselves). On Windows every job writes its
  // own log: output does not come back through the cmd.exe hop, and a log handle passed down
  // would block the script's own writes to the same file.
  const writesOwnLog = type === "update" || type === "restore" || process.platform === "win32";

  if (writesOwnLog) {
    const child = spawn(command, spawnArgs, {
      detached: true,
      stdio: "ignore",
      env,
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
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
      throw internalError("Failed to start maintenance process");
    }

    await writeStoredJob({ ...job, pid: child.pid });
    child.unref();
    return mapJob(await readStoredJob());
  }

  const logHandle = await open(logPath, "a");
  try {
    const child = spawn(command, spawnArgs, {
      detached: true,
      stdio: ["ignore", logHandle.fd, logHandle.fd],
      env,
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
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
      throw internalError("Failed to start maintenance process");
    }

    await writeStoredJob({ ...job, pid: child.pid });
    child.unref();
  } finally {
    await logHandle.close();
  }

  return mapJob(await readStoredJob());
}

type HostCheck = {
  /** null: never probed (skipped because a job was running). */
  sudo: { ready: boolean; command: string; detail: string } | null;
  checkedAt: string;
  /**
   * The check ran while a backup or update job was running. update.sh re-runs
   * setup-maintenance-sudo.sh, which reinstalls the scripts and the sudoers rule, so a sudo probe
   * then can fail although nothing is wrong. The probe is redone once the job has finished.
   */
  duringJob: boolean;
};

/** Result of the last explicit host check (sudo probe + origin comparison), shown by the GET. */
let hostCheck: HostCheck | null = null;

const HOST_NOT_CHECKED = "Host not checked yet. Use Refresh status to probe sudo and origin.";

/**
 * The slow, side-effecting part of the status: run the sudo probe and compare with origin
 * (git ls-remote / fetch). Only called from POST .../maintenance/check and once at boot; the
 * GET status reads the cached result.
 */
export async function checkMaintenanceHost(): Promise<MaintenanceStatusPublic> {
  await reconcileStaleJob();
  const reason = disabledReason();
  const job = await readStoredJob();
  const jobRunning = job?.status === "running";
  // While a job runs, keep the last real probe result (if any) instead of probing mid-update.
  const sudo =
    reason !== null
      ? { ready: false, command: "", detail: reason }
      : jobRunning
        ? (hostCheck?.sudo ?? null)
        : await probeSudo(getBackupScript());
  hostCheck = { sudo, checkedAt: new Date().toISOString(), duringJob: jobRunning };
  // "Check now": ask GitHub again even if the six-hour cache is fresh.
  await getReleaseCheck({ force: !jobRunning });
  return getMaintenanceStatus();
}

/** Test hook. */
export function resetMaintenanceHostCheck() {
  hostCheck = null;
}

/**
 * Status for the GET route: reads files and local git only; no network. It runs the sudo probe
 * only once after a job ends, when the cached check was taken during that job.
 */
export async function getMaintenanceStatus(): Promise<MaintenanceStatusPublic> {
  await reconcileStaleJob();
  const reason = disabledReason();
  const backupScript = getBackupScript();
  const updateScript = getUpdateScript();
  const enabled = reason === null;
  const backups = enabled ? await listBackupFiles() : [];
  const job = await mapJob(await readStoredJob());
  const jobRunning = job?.status === "running";
  if (enabled && !jobRunning && hostCheck?.duringJob) {
    hostCheck = { ...hostCheck, sudo: await probeSudo(backupScript), duringJob: false };
  }
  // During a job the scripts may be mid-reinstall: report "pending", not a sudo error.
  const sudoPending = enabled && jobRunning;
  const sudoProbe = enabled
    ? (hostCheck?.sudo ?? { ready: false, command: "", detail: HOST_NOT_CHECKED })
    : { ready: false, command: "", detail: reason };
  // Reads the cache only; the boot check, the six-hourly timer and "Check now" refresh it.
  const release = await getReleaseCheck({ network: false });
  const lastRun = job?.type === "update" ? parseMaintenanceLog(job.logTail) : null;
  const notSetUpReason = describeNotSetUp({
    disabledReason: reason,
    release,
    sudoReady: sudoProbe.ready,
    sudoChecked: Boolean(hostCheck?.sudo),
    sudoPending,
    lastRun,
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
    sudoPending,
    sudoDetail: enabled
      ? sudoProbe.ready || sudoPending
        ? null
        : `${sudoProbe.detail}${sudoProbe.command ? ` (${sudoProbe.command})` : ""}`
      : null,
    backupDir: enabled ? getBackupDir() : null,
    backups,
    job,
    release,
    state: computeUpdateState({ job, lastRun, notSetUpReason, release }),
    lastRun,
    notSetUpReason,
  };
}

/** Why the one-click update cannot run on this host, or null when it can. */
export function describeNotSetUp(input: {
  disabledReason: string | null;
  release: MaintenanceReleaseCheckPublic;
  sudoReady: boolean;
  /** False until the sudo probe has run once (it runs at boot and on "Check now"). */
  sudoChecked: boolean;
  sudoPending: boolean;
  lastRun: MaintenanceLogSummary | null;
}): string | null {
  if (input.disabledReason) return input.disabledReason;
  if (!input.release.current.releaseInstall) {
    return "This server runs from a git checkout. Run the installer once to switch it to prebuilt releases; it keeps your data and settings.";
  }
  if (input.sudoChecked && !input.sudoReady && !input.sudoPending) {
    return "The maintenance permission (sudo rule) is missing. Re-run the installer to add it.";
  }
  if (input.lastRun?.failure?.code === "not-set-up") return input.lastRun.failure.message;
  return null;
}

export function computeUpdateState(input: {
  job: MaintenanceJobPublic | null;
  lastRun: MaintenanceLogSummary | null;
  notSetUpReason: string | null;
  release: MaintenanceReleaseCheckPublic;
}): MaintenanceUpdateState {
  const { job } = input;
  if (job?.type === "update" && job.status === "running") return "updating";
  if (
    job?.type === "update" &&
    job.status === "failed" &&
    input.lastRun?.failure?.code !== "not-set-up"
  ) {
    return "failed";
  }
  if (input.notSetUpReason) return "not-set-up";
  return isUpdateAvailable(input.release) ? "available" : "up-to-date";
}

/** Settings → Updates → Advanced → Release channel. */
export async function setMaintenanceChannel(channel: MaintenanceChannel) {
  await writeChannel(channel);
  await getReleaseCheck({ force: true });
  return getMaintenanceStatus();
}

export async function runMaintenanceBackup(input: RunMaintenanceBackupInput) {
  const reason = disabledReason();
  if (reason) throw badRequest(reason);

  const script = getBackupScript();
  if (!existsSync(script)) {
    throw badRequest(`Backup script not found at ${script}`);
  }

  const args = input.full ? ["--full"] : ["--db-only"];
  const job = await startJob("backup", script, args, { full: input.full });
  if (!job) throw internalError("Failed to start backup job");
  return job;
}

export async function runMaintenanceUpdate(input: RunMaintenanceUpdateInput) {
  const reason = disabledReason();
  if (reason) throw badRequest(reason);

  const script = getUpdateScript();
  if (!existsSync(script)) {
    throw badRequest(`Update script not found at ${script}`);
  }

  // Install the version the page showed, so a release published meanwhile is not picked up
  // unannounced. Without one, use the newest the check knows of; the script falls back to
  // asking GitHub itself.
  const release = await getReleaseCheck({ network: false });
  const version = input.version ?? release.latest?.version;
  const args: string[] = [];
  if (version) args.push("--version", version);
  if (release.channel === "prerelease") args.push("--channel", "prerelease");
  if (input.skipBackup) args.push("--skip-backup");
  if (input.backupFull) args.push("--backup-full");

  const job = await startJob("update", script, args, {
    backupFull: input.backupFull,
    skipBackup: input.skipBackup,
    version,
  });
  if (!job) throw internalError("Failed to start update job");
  return job;
}

/** Put a database backup back (Advanced → Backups → Restore). */
export async function runMaintenanceRestore(input: RunMaintenanceRestoreInput) {
  const reason = disabledReason();
  if (reason) throw badRequest(reason);

  const backups = await listBackupFiles();
  if (!backups.some((backup) => backup.name === input.file && backup.restorable)) {
    throw badRequest(`No database backup named ${input.file}`);
  }
  const script = getRestoreScript();
  if (!existsSync(script)) {
    throw badRequest(`Restore script not found at ${script}. Re-run the installer to add it.`);
  }

  const job = await startJob("restore", script, ["--file", input.file], { file: input.file });
  if (!job) throw internalError("Failed to start restore job");
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

  // A finished job is cleared, so a failed update stops showing once read.
  if (job.status !== "running") {
    await fs.rm(path.join(getDataDir(), JOB_FILE), { force: true });
    return null;
  }

  if (job.status === "running") {
    if (await jobAlive(job)) {
      throw badRequest("Job is still running on the server.");
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
