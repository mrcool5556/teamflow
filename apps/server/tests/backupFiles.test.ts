import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BackupRetention, MaintenanceBackupListPublic } from "@teamflow/core";
import { backupKindFromName } from "@teamflow/core";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";

let app: TestApp;
let admin: RegisteredUser;
let member: RegisteredUser;
let appDir: string;
let backupDir: string;

const AUTO_DB = [
  "teamflow_2026-11-01_100000.db",
  "teamflow_2026-11-02_100000.db",
  "teamflow_2026-11-03_100000.db",
];
const CHECKPOINTS = [
  "teamflow-pre-0.2.0.db",
  "teamflow_db_pre-0.2.1.db",
  "teamflow_2026-06-01_120000-before-releases.db",
  "teamflow_env_pre-0.2.0",
];
const UPLOADS = ["teamflow_uploads_2026-11-02_100000.tar.gz"];

function writeFiles() {
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.mkdirSync(backupDir, { recursive: true });
  // mtimes in order: older names are older files.
  const all = [...CHECKPOINTS, ...AUTO_DB, ...UPLOADS, "notes.txt"];
  all.forEach((name, i) => {
    const file = path.join(backupDir, name);
    fs.writeFileSync(file, "x".repeat(10 + i));
    const t = new Date(Date.UTC(2026, 10, 1, 0, i));
    fs.utimesSync(file, t, t);
  });
}

beforeAll(async () => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-backups-"));
  backupDir = path.join(appDir, "backups");
  app = await bootApp({
    TEAMFLOW_APP_DIR: appDir,
    TEAMFLOW_BACKUP_DIR: backupDir,
    TEAMFLOW_MAINTENANCE_ENABLED: "true",
    TEAMFLOW_MAINTENANCE_SUDO: "false",
  });
  admin = await registerUser(app); // first account: instance admin
  member = await registerUser(app);
});

beforeEach(() => writeFiles());

afterAll(async () => {
  for (const key of [
    "TEAMFLOW_APP_DIR",
    "TEAMFLOW_BACKUP_DIR",
    "TEAMFLOW_MAINTENANCE_ENABLED",
    "TEAMFLOW_MAINTENANCE_SUDO",
  ]) {
    delete process.env[key];
  }
  const { reloadConfig } = await import("../src/config.js");
  reloadConfig();
  fs.rmSync(appDir, { recursive: true, force: true });
});

const base = () => `/server/maintenance`;

async function list() {
  const res = await api(app, "GET", `${base()}/backups`, { token: admin.token });
  expect(res.status).toBe(200);
  return json<MaintenanceBackupListPublic>(res);
}

describe("backup names", () => {
  it("only backup.sh / backup.ps1 names are database or uploads; other teamflow files are checkpoints", () => {
    for (const n of AUTO_DB) expect(backupKindFromName(n)).toBe("database");
    expect(backupKindFromName("teamflow_2026-11-01_100000-2.db")).toBe("database");
    expect(backupKindFromName("teamflow_uploads_2026-11-01_100000.zip")).toBe("uploads");
    for (const n of CHECKPOINTS) expect(backupKindFromName(n)).toBe("checkpoint");
    expect(backupKindFromName("notes.txt")).toBeNull();
    expect(backupKindFromName("teamflow..db")).toBeNull();
    expect(backupKindFromName("teamflow/../x")).toBeNull();
  });
});

describe("GET backups", () => {
  it("lists teamflow files with type, size, total and which may be deleted", async () => {
    const body = await list();
    const names = body.backups.map((b) => b.name);
    expect(names).not.toContain("notes.txt");
    expect(names).toHaveLength(AUTO_DB.length + CHECKPOINTS.length + UPLOADS.length);
    expect(names[0]).toBe(UPLOADS[0]); // newest first
    expect(body.totalBytes).toBe(body.backups.reduce((s, b) => s + b.sizeBytes, 0));
    expect(body.backupDir).toBe(backupDir);
    expect(body.retention).toEqual({ keepDatabaseBackups: 10, keepUploadArchives: 1 });

    const byName = Object.fromEntries(body.backups.map((b) => [b.name, b]));
    expect(byName["teamflow_2026-11-03_100000.db"]).toMatchObject({
      kind: "database",
      deletable: false,
      restorable: true,
    });
    expect(byName["teamflow_2026-11-02_100000.db"]?.deletable).toBe(true);
    expect(byName["teamflow_env_pre-0.2.0"]).toMatchObject({
      kind: "checkpoint",
      deletable: true,
      restorable: false,
    });
    expect(byName["teamflow_db_pre-0.2.1.db"]).toMatchObject({
      kind: "checkpoint",
      restorable: true,
    });
    expect(byName[UPLOADS[0]!]).toMatchObject({ kind: "uploads", restorable: false });
  });

  it("is instance admin only", async () => {
    const res = await api(app, "GET", `/server/maintenance/backups`, {
      token: member.token,
    });
    expect(res.status).toBe(403);
  });

  it("has no per-team copy", async () => {
    const res = await api(app, "GET", `/teams/${admin.teamId}/server/maintenance/backups`, {
      token: admin.token,
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE backups/:name", () => {
  const del = (name: string) =>
    api(app, "DELETE", `${base()}/backups/${encodeURIComponent(name)}`, { token: admin.token });

  it("deletes an older database backup and a checkpoint", async () => {
    let res = await del("teamflow_2026-11-01_100000.db");
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(backupDir, "teamflow_2026-11-01_100000.db"))).toBe(false);
    const body = await json<MaintenanceBackupListPublic>(res);
    expect(body.backups.some((b) => b.name === "teamflow_2026-11-01_100000.db")).toBe(false);

    res = await del("teamflow-pre-0.2.0.db");
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(backupDir, "teamflow-pre-0.2.0.db"))).toBe(false);
  });

  it("refuses the newest database backup", async () => {
    const res = await del("teamflow_2026-11-03_100000.db");
    expect(res.status).toBe(400);
    expect(fs.existsSync(path.join(backupDir, "teamflow_2026-11-03_100000.db"))).toBe(true);
  });

  it("refuses path tricks, other files and links", async () => {
    fs.writeFileSync(path.join(appDir, "teamflow_secret.db"), "keep");
    for (const name of [
      "../teamflow_secret.db",
      "..%2Fteamflow_secret.db",
      "notes.txt",
      "teamflow..db",
    ]) {
      const res = await api(app, "DELETE", `${base()}/backups/${name}`, { token: admin.token });
      expect([400, 404], name).toContain(res.status);
    }
    expect(fs.existsSync(path.join(appDir, "teamflow_secret.db"))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, "notes.txt"))).toBe(true);

    const res = await del("teamflow_missing.db");
    expect(res.status).toBe(404);

    try {
      fs.symlinkSync(
        path.join(appDir, "teamflow_secret.db"),
        path.join(backupDir, "teamflow_link.db"),
      );
    } catch {
      return; // Windows without symlink rights: nothing more to check
    }
    expect((await del("teamflow_link.db")).status).toBe(404);
    expect(fs.existsSync(path.join(appDir, "teamflow_secret.db"))).toBe(true);
  });

  it("is instance admin only", async () => {
    const res = await api(
      app,
      "DELETE",
      `/server/maintenance/backups/teamflow_2026-11-01_100000.db`,
      { token: member.token },
    );
    expect(res.status).toBe(403);
    expect(fs.existsSync(path.join(backupDir, "teamflow_2026-11-01_100000.db"))).toBe(true);
  });
});

describe("backup-retention", () => {
  const put = (body: unknown, token = admin.token) =>
    api(app, "PUT", `${base()}/backup-retention`, { token, body });

  it("defaults, saves and reads back; the file is what the scripts read", async () => {
    const get = await api(app, "GET", `${base()}/backup-retention`, { token: admin.token });
    expect((await json<{ retention: BackupRetention }>(get)).retention).toEqual({
      keepDatabaseBackups: 10,
      keepUploadArchives: 1,
    });
    const res = await put({ keepDatabaseBackups: 25, keepUploadArchives: 3 });
    expect(res.status).toBe(200);
    expect((await json<{ retention: BackupRetention }>(res)).retention).toEqual({
      keepDatabaseBackups: 25,
      keepUploadArchives: 3,
    });
    const file = JSON.parse(
      fs.readFileSync(path.join(appDir, "data", "backup-settings.json"), "utf8"),
    );
    expect(file).toEqual({ keepDatabaseBackups: 25, keepUploadArchives: 3 });
    expect((await list()).retention.keepDatabaseBackups).toBe(25);
  });

  it("refuses values outside 1-100 and unknown fields", async () => {
    for (const body of [
      { keepDatabaseBackups: 0, keepUploadArchives: 1 },
      { keepDatabaseBackups: 101, keepUploadArchives: 1 },
      { keepDatabaseBackups: 5, keepUploadArchives: 1.5 },
      { keepDatabaseBackups: 5 },
      { keepDatabaseBackups: 5, keepUploadArchives: 1, extra: true },
    ]) {
      expect((await put(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("a hand-edited bad file falls back to the defaults", async () => {
    fs.writeFileSync(
      path.join(appDir, "data", "backup-settings.json"),
      '{"keepDatabaseBackups": 500, "keepUploadArchives": "7"}',
    );
    expect((await list()).retention).toEqual({ keepDatabaseBackups: 10, keepUploadArchives: 1 });
  });

  it("is instance admin only", async () => {
    const res = await api(app, "PUT", `/server/maintenance/backup-retention`, {
      token: member.token,
      body: { keepDatabaseBackups: 2, keepUploadArchives: 2 },
    });
    expect(res.status).toBe(403);
  });
});
