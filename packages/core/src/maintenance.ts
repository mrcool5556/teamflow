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
