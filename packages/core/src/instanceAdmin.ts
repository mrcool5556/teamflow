import { z } from "zod";
import type { DiscordBotServiceStatusPublic } from "./discordBotService.js";
import type { MaintenanceStatusPublic } from "./maintenance.js";
import type {
  SpaceSettingsPublic,
  SpaceStorageBreakdown,
  SpaceStorageState,
  SpaceType,
} from "./spaces.js";

/**
 * The instance-admin page (web /admin, API /instance/*). Everything here comes from checks the
 * server can make on its own host: its process, its database file, statfs on the upload folder,
 * the maintenance and bot scripts. Anything that needs more host access says "not available".
 */

/** How the server process is run, as far as it can tell from its own environment. */
export type ServerSupervisor = "systemd" | "windows-service" | "docker" | "none" | "unknown";

export type InstanceServerPublic = {
  version: string;
  commitShort: string | null;
  node: string;
  platform: string;
  startedAt: string;
  uptimeSec: number;
  listen: { host: string; port: number };
  publicUrl: string;
  supervisor: ServerSupervisor;
  /** systemd unit name or service name when known. */
  serviceName: string | null;
  production: boolean;
};

export type InstanceDiskPublic = {
  /** null when statfs is not available for the upload folder. */
  totalBytes: number | null;
  freeBytes: number | null;
  uploadDir: string;
  uploadsBytes: number;
  databaseBytes: number | null;
  /** Sum of the backups the maintenance panel lists; null when it cannot see them. */
  backupsBytes: number | null;
  /** Uploads pause for everyone under this (0 = off). */
  floorBytes: number;
  diskLow: boolean;
  /** Sum of the caps of every capped space. */
  allocatedCapBytes: number;
  cappedSpaces: number;
  uncappedSpaces: number;
};

export type InstanceFixSeverity = "bad" | "warn" | "info";

/** A finding from the overview checks; the web matches `id` to a how-to. */
export type InstanceFixPublic = {
  id: string;
  severity: InstanceFixSeverity;
  title: string;
  detail: string;
};

export type InstanceOverviewPublic = {
  checkedAt: string;
  server: InstanceServerPublic;
  disk: InstanceDiskPublic;
  bot: DiscordBotServiceStatusPublic;
  maintenance: MaintenanceStatusPublic;
  spaces: { count: number; admin: number; free: number; nearLimit: number; full: number };
  settings: SpaceSettingsPublic;
  fixes: InstanceFixPublic[];
};

export type PublicUrlCheckPublic = {
  url: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  ms: number;
};

export type InstanceSpacePublic = {
  id: string;
  name: string;
  key: string;
  spaceType: SpaceType;
  capBytes: number | null;
  usedBytes: number;
  state: SpaceStorageState;
  /** The account a free space counts against (or who an admin space was made for). */
  owner: { id: string; name: string; email: string } | null;
  memberCount: number;
  issueCount: number;
  createdAt: string;
};

export type InstanceSpaceFilePublic = {
  fileId: string;
  filename: string;
  sizeBytes: number;
  deletedAt: string | null;
  uploaderName: string;
  createdAt: string;
  /** "MOD-12", a row name, or null when nothing links it. */
  usedBy: string | null;
};

export type SpaceEventPublic = {
  id: string;
  kind: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
};

export type InstanceSpaceDetailPublic = InstanceSpacePublic & {
  breakdown: SpaceStorageBreakdown;
  remainingBytes: number | null;
  largestFiles: InstanceSpaceFilePublic[];
  /** When the oldest file in the trash will be purged. */
  nextTrashPurgeAt: string | null;
  events: SpaceEventPublic[];
  /** Free spaces the owner holds, against the per-user limit. */
  ownerFreeSpaces: number | null;
};

export type InstanceUserPublic = {
  id: string;
  name: string;
  email: string;
  isInstanceAdmin: boolean;
  /** Listed in TEAMFLOW_INSTANCE_ADMINS: admin again at every login, so the page cannot remove it. */
  adminFromEnv: boolean;
  freeSpaces: number;
  /** Flows (teams) the person is a member of. */
  teamCount: number;
  createdAt: string;
};

export const updateInstanceUserSchema = z.object({ isInstanceAdmin: z.boolean() }).strict();
export type UpdateInstanceUserInput = z.infer<typeof updateInstanceUserSchema>;

export type PasswordResetIssuedPublic = {
  /** The one-hour link; show it so the admin can pass it on. */
  url: string;
  expiresAt: string;
  emailed: boolean;
  emailError: string | null;
};
