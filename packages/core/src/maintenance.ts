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
  type: "backup" | "update";
  status: MaintenanceJobStatus;
  startedAt: string;
  finishedAt: string | null;
  logTail: string;
  options: {
    full?: boolean;
    backupFull?: boolean;
    skipBackup?: boolean;
    branch?: string;
  };
};

export type MaintenanceVersionPublic = {
  version: string;
  branch: string | null;
  commit: string | null;
  commitShort: string | null;
  commitDate: string | null;
  latestCommit: string | null;
  latestCommitShort: string | null;
  updateAvailable: boolean;
  commitsBehind: number | null;
  gitError: string | null;
};

export type MaintenanceUpdatePhase =
  | "starting"
  | "backup"
  | "pull"
  | "install"
  | "build"
  | "migrate"
  | "restart"
  | "health"
  | "done"
  | "failed";

export const MAINTENANCE_UPDATE_STEPS: { id: MaintenanceUpdatePhase; label: string }[] = [
  { id: "starting", label: "Prepare" },
  { id: "backup", label: "Backup" },
  { id: "pull", label: "Pull" },
  { id: "install", label: "Install" },
  { id: "build", label: "Build" },
  { id: "migrate", label: "Migrate" },
  { id: "restart", label: "Restart" },
  { id: "health", label: "Health" },
  { id: "done", label: "Done" },
];

export function inferUpdatePhase(
  log: string,
  job: Pick<MaintenanceJobPublic, "type" | "status">,
): MaintenanceUpdatePhase {
  if (job.type !== "update") {
    if (job.status === "success") return "done";
    if (job.status === "failed") return "failed";
    return "starting";
  }

  if (job.status === "failed") {
    if (log.includes("Health check failed")) return "health";
    return "failed";
  }

  if (job.status === "success" || log.includes("Health: ok")) return "done";
  if (log.includes("Health check failed")) return "health";
  if (log.includes("Update complete.")) return "restart";
  if (log.includes("db:migrate") || log.includes("Applying migration")) return "migrate";
  if (
    log.includes("apps/server build") ||
    log.includes("vite build") ||
    log.includes("Done in")
  ) {
    return "build";
  }
  if (log.includes("pnpm install") || log.includes("Lockfile")) return "install";
  if (
    log.includes("git pull") ||
    log.includes("From https://") ||
    log.includes("Fast-forward") ||
    log.includes("Already up to date")
  ) {
    return "pull";
  }
  if (
    log.includes("backup") ||
    log.includes("SQLite backup") ||
    log.includes("PostgreSQL backup")
  ) {
    return "backup";
  }
  if (log.includes("Teamflow update") || log.includes("systemctl stop")) return "starting";
  return "starting";
}

export function updatePhaseIndex(phase: MaintenanceUpdatePhase) {
  const order = MAINTENANCE_UPDATE_STEPS.map((step) => step.id);
  if (phase === "failed") return -1;
  return order.indexOf(phase);
}

export type MaintenanceStatusPublic = {
  enabled: boolean;
  reason: string | null;
  platform: string;
  backupScriptReady: boolean;
  updateScriptReady: boolean;
  backupScript: string | null;
  updateScript: string | null;
  sudoReady: boolean;
  sudoDetail: string | null;
  backupDir: string | null;
  backups: MaintenanceBackupPublic[];
  job: MaintenanceJobPublic | null;
  version: MaintenanceVersionPublic;
};

export const runMaintenanceBackupSchema = z.object({
  full: z.boolean().optional().default(false),
});

export const runMaintenanceUpdateSchema = z.object({
  backupFull: z.boolean().optional().default(false),
  skipBackup: z.boolean().optional().default(false),
  branch: z.string().min(1).max(120).optional(),
});

export type RunMaintenanceBackupInput = z.input<typeof runMaintenanceBackupSchema>;
export type RunMaintenanceUpdateInput = z.input<typeof runMaintenanceUpdateSchema>;
