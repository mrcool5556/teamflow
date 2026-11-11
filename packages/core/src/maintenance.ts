import { z } from "zod";

export type MaintenanceBackupKind = "database" | "uploads";

export type MaintenanceBackupPublic = {
  name: string;
  kind: MaintenanceBackupKind;
  sizeBytes: number;
  createdAt: string;
};

export type MaintenanceJobStatus = "running" | "success" | "failed";

export type MaintenanceJobPublic = {
  id: string;
  type: "backup" | "update" | "restore";
  status: MaintenanceJobStatus;
  startedAt: string;
  finishedAt: string | null;
  logTail: string;
  options: {
    full?: boolean;
    backupFull?: boolean;
    skipBackup?: boolean;
    /** update: the version asked for. */
    version?: string;
    /** restore: the backup file put back. */
    file?: string;
  };
};

export function inferMaintenanceJobOutcome(
  type: MaintenanceJobPublic["type"],
  log: string,
): MaintenanceJobStatus {
  if (type === "update") {
    if (/^DONE /m.test(log) || log.includes("Health: ok")) return "success";
    return "failed";
  }
  if (type === "restore") {
    return /^RESTORED /m.test(log) ? "success" : "failed";
  }

  if (
    /^BACKUP /m.test(log) ||
    log.includes("SQLite backup:") ||
    log.includes("PostgreSQL backup:") ||
    log.includes("Uploads backup:")
  ) {
    return "success";
  }

  return "failed";
}

/* ---------- Prebuilt releases (update.sh / update.ps1 and the GitHub release check) ---------- */

/** The steps update.sh and update.ps1 announce with `STEP <id>` lines, in order. */
export type MaintenanceUpdateStep = "download" | "backup" | "install" | "restart" | "check";

export const MAINTENANCE_RELEASE_STEPS: { id: MaintenanceUpdateStep; label: string }[] = [
  { id: "download", label: "Download" },
  { id: "backup", label: "Backup" },
  { id: "install", label: "Install" },
  { id: "restart", label: "Restart" },
  { id: "check", label: "Check" },
];

/** `FAIL <code> <message>` codes written by update.sh / update.ps1. */
export type MaintenanceFailureCode =
  | "network"
  | "checksum"
  | "disk"
  | "migrate"
  | "health"
  | "not-set-up"
  | "busy"
  | "usage"
  | "unknown";

export type MaintenanceFailure = { code: MaintenanceFailureCode; message: string };

const FAILURE_CODES: MaintenanceFailureCode[] = [
  "network",
  "checksum",
  "disk",
  "migrate",
  "health",
  "not-set-up",
  "busy",
  "usage",
  "unknown",
];

export type MaintenanceLogSummary = {
  /** The last `STEP` the script reached, or null before the first one. */
  step: MaintenanceUpdateStep | null;
  /** The last `FAIL` line, or null. */
  failure: MaintenanceFailure | null;
  /** The version from the `DONE` line, or null. */
  done: string | null;
};

/** Read the machine lines (STEP / FAIL / DONE) that the release update scripts write. */
export function parseMaintenanceLog(log: string): MaintenanceLogSummary {
  let step: MaintenanceUpdateStep | null = null;
  let failure: MaintenanceFailure | null = null;
  let done: string | null = null;
  const steps = MAINTENANCE_RELEASE_STEPS.map((s) => s.id);
  for (const raw of log.split(/\r?\n/)) {
    const line = raw.trim();
    const stepMatch = /^STEP (\S+)$/.exec(line);
    if (stepMatch && steps.includes(stepMatch[1] as MaintenanceUpdateStep)) {
      step = stepMatch[1] as MaintenanceUpdateStep;
      continue;
    }
    const failMatch = /^FAIL (\S+) (.+)$/.exec(line);
    if (failMatch) {
      const code = FAILURE_CODES.includes(failMatch[1] as MaintenanceFailureCode)
        ? (failMatch[1] as MaintenanceFailureCode)
        : "unknown";
      failure = { code, message: failMatch[2] };
      continue;
    }
    const doneMatch = /^DONE (\S+)$/.exec(line);
    if (doneMatch) done = doneMatch[1];
  }
  return { step, failure, done };
}

/**
 * Compare two SemVer strings (x.y.z with an optional -pre suffix). Returns <0, 0 or >0.
 * A pre-release sorts before its release (0.3.0-rc.1 < 0.3.0).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [main, pre] = v.replace(/^v/, "").split("-", 2);
    return { nums: main.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  const xs = x.pre.split(".");
  const ys = y.pre.split(".");
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    if (xs[i] === undefined) return -1;
    if (ys[i] === undefined) return 1;
    const xn = Number(xs[i]);
    const yn = Number(ys[i]);
    if (!Number.isNaN(xn) && !Number.isNaN(yn)) {
      if (xn !== yn) return xn - yn;
    } else if (xs[i] !== ys[i]) {
      return xs[i] < ys[i] ? -1 : 1;
    }
  }
  return 0;
}

export const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

export type MaintenanceChannel = "stable" | "prerelease";

/** A GitHub release, as the update check reports it. */
export type MaintenanceReleasePublic = {
  version: string;
  /** Release notes (Markdown from the GitHub release body). */
  notes: string;
  publishedAt: string | null;
  url: string;
  prerelease: boolean;
  /** Size of this platform's download, when the release has one. */
  sizeBytes: number | null;
};

/** The running build (version.json in a release; package.json in a checkout). */
export type MaintenanceCurrentPublic = {
  version: string;
  commit: string | null;
  builtAt: string | null;
  platform: string | null;
  /** True when running from an unpacked release (one-click updates possible). */
  releaseInstall: boolean;
};

/** The one-word state the Updates page is built around. */
export type MaintenanceUpdateState =
  "up-to-date" | "available" | "updating" | "failed" | "not-set-up";

export type MaintenanceReleaseCheckPublic = {
  current: MaintenanceCurrentPublic;
  latest: MaintenanceReleasePublic | null;
  channel: MaintenanceChannel;
  /** When GitHub was last asked; null when never (or the check is turned off). */
  checkedAt: string | null;
  /** Why the last check failed, in one line; null when it worked. */
  checkError: string | null;
  /** False when TEAMFLOW_UPDATE_CHECK=false. */
  checkEnabled: boolean;
};

export type MaintenanceStatusPublic = {
  enabled: boolean;
  reason: string | null;
  platform: string;
  backupScriptReady: boolean;
  updateScriptReady: boolean;
  backupScript: string | null;
  updateScript: string | null;
  sudoReady: boolean;
  /**
   * A backup or update job is running, so the sudo check waits (update.sh reinstalls the
   * scripts and sudoers rule mid-run). The web shows "Update in progress" instead of an error.
   */
  sudoPending: boolean;
  sudoDetail: string | null;
  backupDir: string | null;
  backups: MaintenanceBackupPublic[];
  job: MaintenanceJobPublic | null;
  /** Installed version, newest release and the check that found it. */
  release: MaintenanceReleaseCheckPublic;
  state: MaintenanceUpdateState;
  /** What the last update job's log says: step reached, failure, finished version. */
  lastRun: MaintenanceLogSummary | null;
  /** Why one-click updates are not available here (state "not-set-up"), in one line. */
  notSetUpReason: string | null;
};

export const runMaintenanceBackupSchema = z.object({
  full: z.boolean().optional().default(false),
});

export const runMaintenanceUpdateSchema = z
  .object({
    /** Install this release; defaults to the newest on the channel. */
    version: z.string().regex(SEMVER_PATTERN).optional(),
    backupFull: z.boolean().optional().default(false),
    skipBackup: z.boolean().optional().default(false),
  })
  .strict();

/** A database backup file in the backup folder (no paths). */
export const MAINTENANCE_BACKUP_NAME = /^teamflow_[A-Za-z0-9_.-]+\.db$/;

export const runMaintenanceRestoreSchema = z.object({
  file: z.string().regex(MAINTENANCE_BACKUP_NAME),
});

export type RunMaintenanceRestoreInput = z.input<typeof runMaintenanceRestoreSchema>;

export const maintenanceSettingsSchema = z.object({
  channel: z.enum(["stable", "prerelease"]),
});

export type MaintenanceSettingsInput = z.input<typeof maintenanceSettingsSchema>;

export type RunMaintenanceBackupInput = z.input<typeof runMaintenanceBackupSchema>;
export type RunMaintenanceUpdateInput = z.input<typeof runMaintenanceUpdateSchema>;
