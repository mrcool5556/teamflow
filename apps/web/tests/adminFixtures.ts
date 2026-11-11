import {
  GIB,
  type InstanceOverviewPublic,
  type InstanceSpaceDetailPublic,
  type InstanceSpacePublic,
  type SignupSettingsPublic,
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
      sudoPending: false,
      sudoDetail: null,
      backupDir: "/var/backups/teamflow",
      backups: [
        {
          name: "db.sqlite",
          kind: "database",
          sizeBytes: 500_000,
          createdAt: "2026-11-05T21:39:00Z",
          deletable: false,
          restorable: true,
        },
      ],
      job: null,
      release: {
        current: {
          version: "0.9.2",
          commit: "1d99913aaaa",
          builtAt: "2026-11-01T10:00:00Z",
          platform: "linux-x64",
          releaseInstall: true,
        },
        latest: {
          version: "0.9.3",
          notes: "- Faster boards",
          publishedAt: "2026-11-05T10:00:00Z",
          url: "https://github.com/mrcool5556/teamflow/releases/tag/v0.9.3",
          prerelease: false,
          sizeBytes: 9_800_000,
        },
        channel: "stable",
        checkedAt: "2026-11-05T21:40:00Z",
        checkError: null,
        checkEnabled: true,
      },
      state: "available",
      lastRun: null,
      notSetUpReason: null,
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
      id: "00000000-0000-4000-8000-0000000000d2",
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
    teamId: "00000000-0000-4000-8000-0000000000d2",
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
export function adminRoutes(
  state: {
    overview?: InstanceOverviewPublic;
    spaces?: InstanceSpacePublic[];
    detail?: InstanceSpaceDetailPublic;
    settings?: SpaceSettingsPublic;
    signup?: SignupSettingsPublic;
  } = {},
): FakeRoute[] {
  const settings = () =>
    (state.settings ??= {
      freeSpaceCapBytes: GIB,
      freeSpacesPerUser: 3,
      minFreeDiskBytes: 2 * GIB,
    });
  const spaces = () =>
    (state.spaces ??= [
      makeSpace(),
      makeSpace({
        id: "00000000-0000-4000-8000-0000000000d2",
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
    ]);
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
    ["GET", /^\/instance\/settings$/, () => ({ settings: settings() })],
    [
      "GET",
      /^\/instance\/signup$/,
      () => ({ signup: (state.signup ??= { inviteOnly: false, source: "default" }) }),
    ],
    [
      "PATCH",
      /^\/instance\/signup$/,
      ({ body }) => ({
        signup: (state.signup = { ...(body as { inviteOnly: boolean }), source: "saved" }),
      }),
    ],
    [
      "PATCH",
      /^\/instance\/settings$/,
      ({ body }) => ({ settings: (state.settings = { ...settings(), ...(body as object) }) }),
    ],
    [
      "GET",
      /^\/instance\/users$/,
      () => ({
        users: [
          {
            id: "user-1",
            name: "Ada",
            email: "ada@example.test",
            isInstanceAdmin: true,
            adminFromEnv: false,
            freeSpaces: 0,
            teamCount: 2,
            createdAt: "2026-10-01T10:00:00.000Z",
          },
          {
            id: "user-2",
            name: "Jules",
            email: "jules@example.test",
            isInstanceAdmin: false,
            adminFromEnv: false,
            freeSpaces: 2,
            teamCount: 2,
            createdAt: "2026-10-02T10:00:00.000Z",
          },
        ],
      }),
    ],
    ["GET", /^\/instance\/spaces$/, () => ({ spaces: spaces() })],
    [
      "POST",
      /^\/instance\/spaces$/,
      ({ body }) => {
        const input = body as {
          name: string;
          key: string;
          spaceType: "admin" | "free";
          capBytes?: number | null;
        };
        const created = makeSpaceDetail({
          id: "00000000-0000-4000-8000-0000000000c1",
          name: input.name,
          key: input.key,
          spaceType: input.spaceType,
          capBytes:
            input.spaceType === "free" ? settings().freeSpaceCapBytes : (input.capBytes ?? null),
          usedBytes: 0,
          state: "ok",
          owner: { id: "user-1", name: "Ada", email: "ada@example.test" },
          memberCount: 1,
          issueCount: 0,
          breakdown: { issueFilesBytes: 0, rowFilesBytes: 0, trashBytes: 0, uploadingBytes: 0 },
          largestFiles: [],
          events: [],
        });
        spaces().push(created);
        state.detail = created;
        return { space: created };
      },
    ],
    [
      "GET",
      /^\/instance\/spaces\/([^/]+)$/,
      ({ params }) => {
        const detail = (state.detail ??= makeSpaceDetail());
        if (detail.id !== params[0]) {
          throw Object.assign(new Error("Space not found"), { status: 404 });
        }
        return { space: detail };
      },
    ],
    [
      "PATCH",
      /^\/instance\/spaces\/([^/]+)$/,
      ({ body }) => {
        const patch = body as { spaceType?: "admin" | "free"; capBytes?: number | null };
        const detail = (state.detail ??= makeSpaceDetail());
        state.detail = {
          ...detail,
          ...(patch.spaceType ? { spaceType: patch.spaceType } : {}),
          ...(patch.capBytes !== undefined ? { capBytes: patch.capBytes } : {}),
        };
        return { space: state.detail };
      },
    ],
    [
      "POST",
      /^\/instance\/spaces\/([^/]+)\/empty-trash$/,
      () => {
        const detail = (state.detail ??= makeSpaceDetail());
        const freedBytes = detail.breakdown.trashBytes;
        state.detail = {
          ...detail,
          usedBytes: detail.usedBytes - freedBytes,
          breakdown: { ...detail.breakdown, trashBytes: 0 },
          nextTrashPurgeAt: null,
        };
        return { deletedFiles: 1, freedBytes, space: state.detail };
      },
    ],
  ];
}
