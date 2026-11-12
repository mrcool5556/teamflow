import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { GIB, type SetupChecklistPublic, type SiteSettingsAdminPublic } from "@teamflow/core";
import { createDb, getSchemaVersion, schema, SCHEMA_VERSION } from "@teamflow/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createTeam, json, login, type TestApp } from "./helpers";

/**
 * A server that already has accounts and teams (like production before onboarding) keeps
 * working after the update: no setup page, everyone keeps their teams (including the "General"
 * that registration used to make), and .env values still win.
 */

let scratch: string;
let dbFile: string;
let app: TestApp;

const ADMIN = { id: "u-admin", email: "admin@old.example", name: "Old Admin" };
const MEMBER = { id: "u-member", email: "member@old.example", name: "Old Member" };
/** Like CT998: the oldest account is a retired demo account that once held the admin flag. */
const DEMO = { id: "u-demo", email: "demo-retired@invalid.invalid", name: "Demo User (retired)" };
const PASSWORD = "old-password-123";

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-existing-db-"));
  dbFile = path.join(scratch, "data", "teamflow.db");

  // 1. The database as the previous release left it, written by its own handle.
  const old = createDb(`file:${dbFile}`);
  const { createTeamWithOwner } = await import("../src/lib/teams.js");
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  old.transaction((tx) => {
    tx.insert(schema.users)
      .values([
        { ...DEMO, passwordHash, isInstanceAdmin: 0, createdAt: "2026-10-01 09:00:00" },
        { ...ADMIN, passwordHash, isInstanceAdmin: 1, createdAt: "2026-10-02 09:00:00" },
        { ...MEMBER, passwordHash, isInstanceAdmin: 0, createdAt: "2026-10-03 09:00:00" },
      ])
      .run();
    createTeamWithOwner(tx, {
      userId: ADMIN.id,
      userName: ADMIN.name,
      name: "General",
      key: "GEN",
      role: "owner",
      space: { spaceType: "admin", storageCapBytes: null, spaceOwnerId: ADMIN.id },
    });
    createTeamWithOwner(tx, {
      userId: MEMBER.id,
      userName: MEMBER.name,
      name: "General",
      key: "GENM",
      role: "owner",
      space: { spaceType: "free", storageCapBytes: GIB, spaceOwnerId: MEMBER.id },
    });
  });
  // Wind it back to schema 4 (before the Server Owner), as the previous release left it.
  const raw = (old as unknown as { $client: import("better-sqlite3").Database }).$client;
  raw.prepare("UPDATE users SET is_server_owner = 0, server_powers = NULL").run();
  raw.prepare("UPDATE schema_version SET version = 4").run();
  raw.close();

  // 2. The new release boots on that file, with PUBLIC_URL in .env as production has.
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.PUBLIC_URL = "https://tf.old.example";
  const { reloadConfig } = await import("../src/config.js");
  reloadConfig();
  app = (await import("../src/index.js")).app;
});

afterAll(async () => {
  const { db } = await import("../src/db.js");
  (db as unknown as { $client: { close(): void } }).$client.close();
  delete process.env.PUBLIC_URL;
  process.env.DATABASE_URL = ":memory:";
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("an existing database after the update", () => {
  it("is at the current schema version", async () => {
    const { db } = await import("../src/db.js");
    expect(getSchemaVersion((db as unknown as { $client: never }).$client)).toBe(SCHEMA_VERSION);
  });

  it("never offers setup and writes no setup code", async () => {
    const { db } = await import("../src/db.js");
    const { announceSetupIfNeeded } = await import("../src/lib/setup.js");
    const lines: string[] = [];
    expect(announceSetupIfNeeded(db, (line) => lines.push(line))).toBeNull();
    expect(lines).toEqual([]);
    expect(fs.existsSync(path.join(scratch, "data", "setup-code"))).toBe(false);

    const status = await json<{ setup: { needed: boolean } }>(await api(app, "GET", "/auth/setup"));
    expect(status.setup.needed).toBe(false);
    const res = await api(app, "POST", "/auth/setup/admin", {
      body: { code: "AAAA-AAAA", name: "X", email: "x@example.test", password: "whatever-123" },
    });
    expect(res.status).toBe(409);
  });

  it("lets everyone log in with their teams, roles and admin flag unchanged", async () => {
    const admin = await login(app, ADMIN.email, PASSWORD);
    expect(admin.user.isInstanceAdmin).toBe(true);
    // Schema 5 made the instance admin the Server Owner, not the older retired account.
    expect(admin.user).toMatchObject({ serverRole: "owner" });
    expect((admin.user as { serverPowers?: string[] }).serverPowers).toHaveLength(7);
    const member = await login(app, MEMBER.email, PASSWORD);
    expect(member.user.isInstanceAdmin).toBe(false);

    const teams = await json<{ teams: { key: string; spaceType: string }[] }>(
      await api(app, "GET", "/teams", { token: member.token }),
    );
    expect(teams.teams).toEqual([expect.objectContaining({ key: "GENM", spaceType: "free" })]);
  });

  it("counts the old General toward the member's free Flows", async () => {
    const member = await login(app, MEMBER.email, PASSWORD);
    await createTeam(app, member.token, "Two", "TWO");
    await createTeam(app, member.token, "Three", "THREE");
    const fourth = await api(app, "POST", "/teams", {
      token: member.token,
      body: { name: "Four", key: "FOUR" },
    });
    expect(fourth.status).toBe(409);
  });

  it("keeps PUBLIC_URL from .env in charge, read-only on the admin page", async () => {
    const admin = await login(app, ADMIN.email, PASSWORD);
    const { site } = await json<{ site: SiteSettingsAdminPublic }>(
      await api(app, "GET", "/instance/site", { token: admin.token }),
    );
    expect(site).toMatchObject({ publicUrl: "https://tf.old.example", publicUrlSource: "env" });
    const res = await api(app, "PATCH", "/instance/site", {
      token: admin.token,
      body: { publicUrl: "https://other.example" },
    });
    expect(res.status).toBe(409);
    expect((await json<{ code: string }>(res)).code).toBe("setting_set_in_env");
  });

  it("shows the admin a checklist with the address and first Flow already done", async () => {
    const admin = await login(app, ADMIN.email, PASSWORD);
    const { checklist } = await json<{ checklist: SetupChecklistPublic }>(
      await api(app, "GET", "/instance/setup-checklist", { token: admin.token }),
    );
    const state = (id: string) => checklist.items.find((item) => item.id === id)?.state;
    expect(state("site")).toBe("done");
    expect(state("flow")).toBe("done");
  });

  it("lets new people sign up, with no team until they create or join a Flow", async () => {
    const res = await api(app, "POST", "/auth/register", {
      body: { email: "new@old.example", name: "Newcomer", password: "new-password-123" },
    });
    expect(res.status).toBe(201);
    const { token } = await json<{ token: string }>(res);
    const teams = await json<{ teams: unknown[] }>(await api(app, "GET", "/teams", { token }));
    expect(teams.teams).toEqual([]);
  });
});
