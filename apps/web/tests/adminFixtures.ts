import {
  GIB,
  type InstanceOverviewPublic,
  type InstanceSpaceDetailPublic,
  type InstanceSpacePublic,
  type SpaceSettingsPublic,
  type SpaceStoragePublic,
} from "@teamflow/core";
import type { FakeRoute } from "./fakeApi";

export const MIB = 1024 * 1024;

export function makeOverview(extra: Partial<InstanceOverviewPublic> = {}): InstanceOverviewPublic {
  return {
    checkedAt: "2026-11-06T10:00:00.000Z",
    server: {
      version: "0.9.2",
      commitShort: "1d99913",
      node: "v20.19.2",
      platform: "linux",
      startedAt: "2026-11-01T10:00:00.000Z",
      uptimeSec: 6 * 86400,
      listen: { host: "0.0.0.0", port: 3000 },
      publicUrl: "https://teamflow.example.com",
      supervisor: "systemd",
      serviceName: "teamflow.service",
      production: true,
    },
    disk: {
      totalBytes: 30 * GIB,
      freeBytes: 19 * GIB,
      uploadDir: "/opt/teamflow/data/uploads",
      uploadsBytes: 4 * GIB,
      databaseBytes: 500_000,
      backupsBytes: GIB,
      floorBytes: 2 * GIB,
      diskLow: false,
      allocatedCapBytes: 3 * GIB,
      cappedSpaces: 3,
      uncappedSpaces: 2,
    },
    bot: {
      managementAvailable: true,
      managementReason: null,
      platform: "linux",
      scriptReady: true,
      sudoReady: true,
      sudoDetail: null,
      unitInstalled: true,
      unitEnabled: true,
      state: "running",
      processRunning: true,
      credentialsConfigured: true,
      botConfigKeyConfigured: true,
      botEnvReady: true,
      teamflowUrl: "http://127.0.0.1:3000",
      lastLogTail: null,
    },
    maintenance: {
      enabled: true,
      reason: null,
      platform: "linux",
      backupScriptReady: true,
      updateScriptReady: true,
      backupScript: "/opt/teamflow/backup.sh",
      updateScript: "/opt/teamflow/update.sh",
      sudoReady: true,
      sudoDetail: null,
      backupDir: "/var/backups/teamflow",
      backups: [
        {
          name: "db.sqlite",
          kind: "database",
          sizeBytes: 500_000,
          createdAt: "2026-11-05T21:39:00Z",
        },
      ],
      job: null,
      version: {
        version: "0.9.2",
        branch: "main",
        commit: "1d99913aaaa",
        commitShort: "1d99913",
        commitDate: null,
        latestCommit: "a41c07ebbbb",
        latestCommitShort: "a41c07e",
        updateAvailable: true,
        commitsBehind: 2,
        gitError: null,
      },
    },
    spaces: { count: 2, admin: 1, free: 1, nearLimit: 1, full: 0 },
    settings: { freeSpaceCapBytes: GIB, freeSpacesPerUser: 3, minFreeDiskBytes: 2 * GIB },
    fixes: [
      {
        id: "uploads-not-backed-up",
        severity: "warn",
        title: "Uploads are not in any backup",
        detail: "Database-only backups skip data/uploads. Run a full backup.",
      },
    ],
    ...extra,
  };
}

export function makeSpace(extra: Partial<InstanceSpacePublic> = {}): InstanceSpacePublic {
  return {
    id: "00000000-0000-4000-8000-00000000e001",
    name: "Engineering",
    key: "ENG",
    spaceType: "admin",
    capBytes: null,
    usedBytes: 3 * GIB,
    state: "ok",
    owner: { id: "user-1", name: "Ada", email: "ada@example.test" },
    memberCount: 4,
    issueCount: 212,
    createdAt: "2026-10-01T10:00:00.000Z",
    ...extra,
  };
}

export function makeSpaceDetail(
  extra: Partial<InstanceSpaceDetailPublic> = {},
): InstanceSpaceDetailPublic {
  return {
    ...makeSpace({
      id: "00000000-0000-4000-8000-00000000e002",
      name: "Mod pack",
      key: "MOD",
      spaceType: "free",
      capBytes: GIB,
      usedBytes: 812 * MIB,
      state: "warn",
      owner: { id: "user-2", name: "Jules", email: "jules@example.test" },
      memberCount: 2,
      issueCount: 18,
    }),
    breakdown: {
      issueFilesBytes: 520 * MIB,
      rowFilesBytes: 140 * MIB,
      trashBytes: 120 * MIB,
      uploadingBytes: 32 * MIB,
    },
    remainingBytes: GIB - 812 * MIB,
    largestFiles: [
      {
        fileId: "f1",
        filename: "modpack-v3.zip",
        sizeBytes: 310 * MIB,
        deletedAt: null,
        uploaderName: "Jules",
        createdAt: "2026-11-02T10:00:00.000Z",
        usedBy: "MOD-12",
      },
    ],
    nextTrashPurgeAt: "2026-11-14T10:00:00.000Z",
    events: [
      {
        id: "e1",
        kind: "created",
        detail: "Free space for Jules, cap 1.00 GB",
        actorName: null,
        createdAt: "2026-11-01T10:00:00.000Z",
      },
    ],
    ownerFreeSpaces: 2,
    ...extra,
  };
}

export function makeStorage(extra: Partial<SpaceStoragePublic> = {}): SpaceStoragePublic {
  return {
    teamId: "00000000-0000-4000-8000-00000000e002",
    spaceType: "free",
    capBytes: GIB,
    usedBytes: 240 * MIB,
    remainingBytes: GIB - 240 * MIB,
    state: "ok",
    breakdown: { issueFilesBytes: 240 * MIB, rowFilesBytes: 0, trashBytes: 0, uploadingBytes: 0 },
    diskLow: false,
    ...extra,
  };
}

/** Routes for the admin page backed by mutable state the test can inspect. */
export function adminRoutes(state: {
  overview?: InstanceOverviewPublic;
  spaces?: InstanceSpacePublic[];
  detail?: InstanceSpaceDetailPublic;
  settings?: SpaceSettingsPublic;
}): FakeRoute[] {
  return [
    ["GET", /^\/instance\/overview$/, () => ({ overview: state.overview ?? makeOverview() })],
    [
      "GET",
      /^\/instance\/checks\/public-url$/,
      () => ({
        check: {
          url: "https://teamflow.example.com/health",
          ok: true,
          status: 200,
          error: null,
          ms: 42,
        },
      }),
    ],
  ];
}
