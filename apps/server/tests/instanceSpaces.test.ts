import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GIB, type InstanceOverviewPublic, type InstanceSpaceDetailPublic } from "@teamflow/core";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";
import {
  createIssue,
  firstRowId,
  getStorage,
  startSession,
  uploadToIssue,
  uploadToRow,
  uploadedFileId,
} from "./spaceHelpers";
import { diskProbe } from "../src/lib/disk.js";
import { checkPublicUrl, collectFixes } from "../src/lib/instanceAdmin.js";

let app: TestApp;
let scratch: string;
let admin: RegisteredUser;
let user: RegisteredUser;

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-instance-admin-test-"));
  app = await bootApp({ UPLOAD_DIR: path.join(scratch, "uploads") });
  admin = await registerUser(app, { name: "Admin" }); // first account: instance admin
  user = await registerUser(app, { name: "Sam" });
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function detail(teamId: string) {
  const res = await api(app, "GET", `/instance/spaces/${teamId}`, { token: admin.token });
  expect(res.status).toBe(200);
  return (await json<{ space: InstanceSpaceDetailPublic }>(res)).space;
}

describe("access", () => {
  it("is for instance admins only", async () => {
    for (const [method, url] of [
      ["GET", "/instance/overview"],
      ["GET", "/instance/spaces"],
      ["GET", "/instance/settings"],
      ["GET", "/instance/users"],
      ["POST", "/instance/spaces"],
      ["PATCH", `/instance/spaces/${user.teamId}`],
    ] as const) {
      const body = method === "GET" ? undefined : {};
      const res = await api(app, method, url, { token: user.token, body });
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect((await api(app, "GET", "/instance/overview")).status).toBe(401);
  });
});

describe("overview", () => {
  it("reports server, disk, spaces and settings from local checks", async () => {
    vi.spyOn(diskProbe, "read").mockResolvedValue({ totalBytes: 30 * GIB, freeBytes: 19 * GIB });
    const res = await api(app, "GET", "/instance/overview", { token: admin.token });
    expect(res.status).toBe(200);
    const { overview } = await json<{ overview: InstanceOverviewPublic }>(res);
    expect(overview.server.node).toBe(process.version);
    expect(overview.server.listen.port).toBeTypeOf("number");
    expect(overview.disk).toMatchObject({ totalBytes: 30 * GIB, freeBytes: 19 * GIB });
    expect(overview.spaces.count).toBeGreaterThanOrEqual(2);
    expect(overview.spaces.free).toBeGreaterThanOrEqual(1);
    expect(overview.settings.freeSpacesPerUser).toBe(3);
    expect(Array.isArray(overview.fixes)).toBe(true);
    expect(overview.bot.state).toBeTypeOf("string");
    expect(overview.maintenance.version.version).toBeTypeOf("string");
  });

  it("checks PUBLIC_URL/health and reports failures without throwing", async () => {
    const ok = await checkPublicUrl(async () => new Response("{}", { status: 200 }));
    expect(ok).toMatchObject({ ok: true, status: 200, error: null });
    expect(ok.url).toMatch(/\/health$/);
    const down = await checkPublicUrl(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(down).toMatchObject({ ok: false, status: null, error: "connect ECONNREFUSED" });
  });
});

describe("common fixes", () => {
  const base = {
    server: {
      version: "1",
      commitShort: null,
      node: "v20",
      platform: "linux",
      startedAt: "",
      uptimeSec: 1,
      listen: { host: "0.0.0.0", port: 3000 },
      publicUrl: "https://teamflow.example.com",
      supervisor: "systemd" as const,
      serviceName: "teamflow.service",
      production: true,
    },
    disk: {
      totalBytes: 30 * GIB,
      freeBytes: 19 * GIB,
      uploadDir: "/data/uploads",
      uploadsBytes: 0,
      databaseBytes: 1,
      backupsBytes: 0,
      floorBytes: 2 * GIB,
      diskLow: false,
      allocatedCapBytes: 0,
      cappedSpaces: 0,
      uncappedSpaces: 0,
    },
    bot: {
      credentialsConfigured: true,
      state: "running" as const,
      unitEnabled: true,
    } as InstanceOverviewPublic["bot"],
    maintenance: {
      enabled: true,
      reason: null,
      sudoReady: true,
      sudoDetail: null,
      backups: [
        { name: "db.sqlite", kind: "database" as const, sizeBytes: 1, createdAt: "2026-11-05" },
      ],
      version: { updateAvailable: false, commitsBehind: 0, branch: "main" },
    } as unknown as InstanceOverviewPublic["maintenance"],
    spaces: [],
    settings: { freeSpaceCapBytes: GIB, freeSpacesPerUser: 3, minFreeDiskBytes: 2 * GIB },
    now: new Date("2026-11-06T00:00:00Z"),
  };

  it("flags a missing uploads backup on an otherwise healthy server", () => {
    expect(collectFixes(base).map((fix) => fix.id)).toEqual(["uploads-not-backed-up"]);
  });

  it("puts a full disk and a failed bot first", () => {
    const fixes = collectFixes({
      ...base,
      disk: { ...base.disk, freeBytes: GIB, diskLow: true },
      bot: { ...base.bot, state: "failed" },
      server: { ...base.server, publicUrl: "http://localhost:3000", supervisor: "none" },
    });
    expect(fixes.slice(0, 2).map((fix) => fix.id)).toEqual(["disk-low", "bot-failed"]);
    expect(fixes.map((fix) => fix.id)).toEqual(
      expect.arrayContaining(["public-url-unset", "no-service"]),
    );
  });

  it("notices old backups and caps larger than the free disk", () => {
    const fixes = collectFixes({
      ...base,
      now: new Date("2026-12-01T00:00:00Z"),
      spaces: [
        {
          id: "t",
          name: "Big",
          key: "BIG",
          spaceType: "admin",
          capBytes: 25 * GIB,
          usedBytes: 0,
          state: "ok",
          owner: null,
          memberCount: 1,
          issueCount: 0,
          createdAt: "",
        },
      ],
    });
    expect(fixes.map((fix) => fix.id)).toEqual(
      expect.arrayContaining(["backup-old", "caps-exceed-disk"]),
    );
  });
});

describe("spaces", () => {
  it("lists every space with type, cap, owner, members, issues and usage", async () => {
    const issueId = await createIssue(app, user.token, user.teamId);
    await uploadedFileId(await uploadToIssue(app, user.token, issueId, 1234));
    const res = await api(app, "GET", "/instance/spaces", { token: admin.token });
    const { spaces } = await json<{ spaces: InstanceSpaceDetailPublic[] }>(res);
    const sams = spaces.find((space) => space.id === user.teamId)!;
    expect(sams).toMatchObject({
      name: "General",
      spaceType: "free",
      capBytes: GIB,
      usedBytes: 1234,
      state: "ok",
      memberCount: 1,
      issueCount: 1,
      owner: { id: user.id, name: "Sam" },
    });
    const admins = spaces.find((space) => space.id === admin.teamId)!;
    expect(admins).toMatchObject({ spaceType: "admin", capBytes: null });
  });

  it("creates an admin space for another user with the allowance the admin sets", async () => {
    const res = await api(app, "POST", "/instance/spaces", {
      token: admin.token,
      body: {
        name: "Client portal",
        key: "CLI",
        spaceType: "admin",
        capBytes: 10 * GIB,
        ownerUserId: user.id,
      },
    });
    expect(res.status).toBe(201);
    const { space } = await json<{ space: InstanceSpaceDetailPublic }>(res);
    expect(space).toMatchObject({
      spaceType: "admin",
      capBytes: 10 * GIB,
      owner: { id: user.id },
      memberCount: 1,
    });
    expect(space.events[0]).toMatchObject({ kind: "created", actorName: "Admin" });

    // The owner has it, as Owner; the admin did not join.
    const teams = await api(app, "GET", "/teams", { token: user.token });
    const { teams: list } = await json<{ teams: { id: string }[] }>(teams);
    expect(list.map((team) => team.id)).toContain(space.id);
    const adminTeams = await json<{ teams: { id: string }[] }>(
      await api(app, "GET", "/teams", { token: admin.token }),
    );
    expect(adminTeams.teams.map((team) => team.id)).not.toContain(space.id);
  });

  it("gives a free space the free-space default whatever cap is sent", async () => {
    const res = await api(app, "POST", "/instance/spaces", {
      token: admin.token,
      body: { name: "Free one", key: "FREE", spaceType: "free", capBytes: 99 * GIB },
    });
    const { space } = await json<{ space: InstanceSpaceDetailPublic }>(res);
    expect(space).toMatchObject({ spaceType: "free", capBytes: GIB, owner: { id: admin.id } });
  });

  it("changes cap and type, logs both, and deletes nothing when the cap drops under usage", async () => {
    const other = await registerUser(app);
    const issueId = await createIssue(app, other.token, other.teamId);
    await uploadedFileId(await uploadToIssue(app, other.token, issueId, 500));

    const lowered = await api(app, "PATCH", `/instance/spaces/${other.teamId}`, {
      token: admin.token,
      body: { capBytes: 100 },
    });
    expect(lowered.status).toBe(200);
    const { space } = await json<{ space: InstanceSpaceDetailPublic }>(lowered);
    expect(space).toMatchObject({
      capBytes: 100,
      usedBytes: 500,
      state: "full",
      remainingBytes: 0,
    });
    expect((await uploadToIssue(app, other.token, issueId, 1)).status).toBe(413);

    const promoted = await api(app, "PATCH", `/instance/spaces/${other.teamId}`, {
      token: admin.token,
      body: { spaceType: "admin", capBytes: null },
    });
    const after = (await json<{ space: InstanceSpaceDetailPublic }>(promoted)).space;
    expect(after).toMatchObject({ spaceType: "admin", capBytes: null, state: "ok" });
    expect(after.events.map((event) => [event.kind, event.detail])).toEqual([
      ["cap_changed", "100 B → no limit"],
      ["type_changed", "free → admin"],
      ["cap_changed", "1.00 GB → 100 B"],
    ]);
    expect(after.ownerFreeSpaces).toBe(0);

    // Back to free without a cap: the free-space default applies.
    const demoted = await api(app, "PATCH", `/instance/spaces/${other.teamId}`, {
      token: admin.token,
      body: { spaceType: "free" },
    });
    expect((await json<{ space: InstanceSpaceDetailPublic }>(demoted)).space.capBytes).toBe(GIB);
  });

  it("empties a space's trash and cancels its uploads in progress", async () => {
    const other = await registerUser(app);
    const issueId = await createIssue(app, other.token, other.teamId);
    const rowId = await firstRowId(app, other.token, other.teamId);
    const fileId = await uploadedFileId(await uploadToRow(app, other.token, rowId, 300));
    await api(app, "DELETE", `/teams/${other.teamId}/files/${fileId}`, { token: other.token });
    expect((await startSession(app, other.token, { issueId }, 700)).status).toBe(201);
    expect(await detail(other.teamId)).toMatchObject({
      breakdown: { trashBytes: 300, uploadingBytes: 700 },
    });

    const emptied = await api(app, "POST", `/instance/spaces/${other.teamId}/empty-trash`, {
      token: admin.token,
    });
    expect(await json(emptied)).toMatchObject({ deletedFiles: 1, freedBytes: 300 });
    const cancelled = await api(app, "POST", `/instance/spaces/${other.teamId}/cancel-uploads`, {
      token: admin.token,
    });
    expect(await json(cancelled)).toMatchObject({ cancelledUploads: 1 });
    expect((await getStorage(app, other.token, other.teamId)).usedBytes).toBe(0);
    const events = (await detail(other.teamId)).events.map((event) => event.kind);
    expect(events).toEqual(["uploads_cancelled", "trash_emptied"]);
  });

  it("shows the largest files with what uses them", async () => {
    const other = await registerUser(app);
    const issueId = await createIssue(app, other.token, other.teamId);
    await uploadedFileId(await uploadToIssue(app, other.token, issueId, 900));
    const space = await detail(other.teamId);
    expect(space.largestFiles[0]).toMatchObject({ sizeBytes: 900, usedBy: "GEN-1" });
  });

  it("404s an unknown space", async () => {
    const res = await api(app, "GET", `/instance/spaces/${crypto.randomUUID()}`, {
      token: admin.token,
    });
    expect(res.status).toBe(404);
  });
});

describe("settings and users", () => {
  it("reads and saves space settings", async () => {
    const res = await api(app, "PATCH", "/instance/settings", {
      token: admin.token,
      body: { freeSpacesPerUser: 4 },
    });
    expect(await json(res)).toMatchObject({ settings: { freeSpacesPerUser: 4 } });
    const bad = await api(app, "PATCH", "/instance/settings", { token: admin.token, body: {} });
    expect(bad.status).toBe(400);
    await api(app, "PATCH", "/instance/settings", {
      token: admin.token,
      body: { freeSpacesPerUser: 3 },
    });
  });

  it("finds users with their free-space count", async () => {
    const res = await api(app, "GET", "/instance/users?q=sam", { token: admin.token });
    const { users } = await json<{ users: { id: string; freeSpaces: number }[] }>(res);
    expect(users.find((u) => u.id === user.id)).toMatchObject({ freeSpaces: 1 });
  });
});
