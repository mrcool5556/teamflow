import type { InstanceUserPublic, PasswordResetIssuedPublic } from "@teamflow/core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  json,
  login,
  registerAccount,
  registerUser,
  uniqueEmail,
  type RegisteredAccount,
  type TestApp,
} from "./helpers";

let app: TestApp;
let admin: RegisteredAccount;
let sam: RegisteredAccount;
let envListed: RegisteredAccount;
const envEmail = uniqueEmail("envlisted");

beforeAll(async () => {
  app = await bootApp({ TEAMFLOW_INSTANCE_ADMINS: envEmail });
  admin = await registerUser(app, { name: "Admin" });
  sam = await registerAccount(app, { name: "Sam" });
  envListed = await registerAccount(app, { name: "Env Admin", email: envEmail });
});

async function people(q = "") {
  const res = await api(app, "GET", `/instance/users?limit=500${q ? `&q=${q}` : ""}`, {
    token: admin.token,
  });
  return (await json<{ users: InstanceUserPublic[] }>(res)).users;
}

describe("People", () => {
  it("is for server admins only", async () => {
    for (const [method, url] of [
      ["PATCH", `/instance/users/${admin.id}`],
      ["POST", `/instance/users/${admin.id}/reset-link`],
    ] as const) {
      const res = await api(app, method, url, {
        token: sam.token,
        body: { isInstanceAdmin: true },
      });
      expect(res.status, `${method} ${url}`).toBe(403);
    }
  });

  it("lists everyone with their Flows and where their admin flag comes from", async () => {
    const list = await people();
    const byName = (name: string) => list.find((p) => p.name === name)!;
    expect(byName("Admin")).toMatchObject({
      isInstanceAdmin: true,
      adminFromEnv: false,
      teamCount: 1,
    });
    expect(byName("Sam")).toMatchObject({ isInstanceAdmin: false, teamCount: 0, freeSpaces: 0 });
    expect(byName("Env Admin")).toMatchObject({ isInstanceAdmin: true, adminFromEnv: true });
    expect(byName("Sam").createdAt).toBeTruthy();
  });

  it("makes someone a server admin and back", async () => {
    let res = await api(app, "PATCH", `/instance/users/${sam.id}`, {
      token: admin.token,
      body: { isInstanceAdmin: true },
    });
    expect((await json<{ user: InstanceUserPublic }>(res)).user.isInstanceAdmin).toBe(true);
    // Checked on every request, so the new admin has the page at once.
    expect((await api(app, "GET", "/instance/overview", { token: sam.token })).status).toBe(200);

    res = await api(app, "PATCH", `/instance/users/${sam.id}`, {
      token: admin.token,
      body: { isInstanceAdmin: false },
    });
    expect((await json<{ user: InstanceUserPublic }>(res)).user.isInstanceAdmin).toBe(false);
    expect((await api(app, "GET", "/instance/overview", { token: sam.token })).status).toBe(403);
  });

  it("will not remove someone TEAMFLOW_INSTANCE_ADMINS lists", async () => {
    const res = await api(app, "PATCH", `/instance/users/${envListed.id}`, {
      token: admin.token,
      body: { isInstanceAdmin: false },
    });
    expect(res.status).toBe(409);
    expect((await json<{ code: string }>(res)).code).toBe("setting_set_in_env");
  });

  it("never removes the last server admin", async () => {
    // Make the env-listed admin an ordinary account in the database to leave one admin.
    const { db } = await import("../src/db.js");
    db.$client.prepare("UPDATE users SET is_instance_admin = 0 WHERE id = ?").run(envListed.id);
    const res = await api(app, "PATCH", `/instance/users/${admin.id}`, {
      token: admin.token,
      body: { isInstanceAdmin: false },
    });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toMatch(/last server admin/);
  });

  it("hands out a working reset link when email is not set up", async () => {
    const res = await api(app, "POST", `/instance/users/${sam.id}/reset-link`, {
      token: admin.token,
    });
    const { reset } = await json<{ reset: PasswordResetIssuedPublic }>(res);
    expect(reset.emailed).toBe(false);
    const token = new URL(reset.url).searchParams.get("reset")!;
    expect(token).toBeTruthy();

    const done = await api(app, "POST", "/auth/reset-password", {
      body: { token, password: "brand-new-password" },
    });
    expect(done.status).toBe(200);
    await login(app, sam.email, "brand-new-password");
  });
});
