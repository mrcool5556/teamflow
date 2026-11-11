import {
  SERVER_POWERS,
  type InstanceUserPublic,
  type PasswordResetIssuedPublic,
  type ServerAdminPublic,
  type ServerPower,
} from "@teamflow/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  api,
  bootApp,
  createTeam,
  json,
  login,
  registerAccount,
  uniqueEmail,
  type RegisteredAccount,
  type TestApp,
} from "./helpers";

/** Maintenance jobs are stubbed: these tests are about who may call what. */
vi.mock("../src/lib/maintenance.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/maintenance.js")>();
  const job = {
    id: "j",
    type: "backup",
    status: "running",
    startedAt: "",
    finishedAt: null,
    logTail: "",
    options: {},
  };
  return {
    ...actual,
    runMaintenanceBackup: async () => job,
    runMaintenanceUpdate: async () => ({ ...job, type: "update" }),
  };
});
vi.mock("../src/lib/backupFiles.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/backupFiles.js")>();
  const list = {
    backups: [],
    totalBytes: 0,
    backupDir: null,
    retention: { keepDatabaseBackups: 10, keepUploadArchives: 1 },
  };
  return {
    ...actual,
    getBackupList: async () => list,
    deleteBackupFile: async () => list,
    writeBackupRetention: async (r: unknown) => r,
  };
});

let app: TestApp;
let owner: RegisteredAccount;
let sam: RegisteredAccount;
let jules: RegisteredAccount;
let envAdmin: RegisteredAccount;
const envEmail = uniqueEmail("envlisted");

beforeAll(async () => {
  app = await bootApp({ TEAMFLOW_INSTANCE_ADMINS: envEmail });
  owner = await registerAccount(app, { name: "George" }); // the setup account: Server Owner
  sam = await registerAccount(app, { name: "Sam" });
  jules = await registerAccount(app, { name: "Jules" });
  envAdmin = await registerAccount(app, { name: "Env Admin", email: envEmail });
});

async function setPowers(userId: string, powers: ServerPower[], token = owner.token) {
  return api(app, "PUT", `/instance/admins/${userId}`, { token, body: { powers } });
}

/** One request per power that only that power opens (a read where the route is a read). */
const PROBES: Record<ServerPower, [string, string, unknown?]> = {
  updates: ["PUT", "/server/maintenance/settings", { channel: "stable" }],
  backups: ["GET", "/server/maintenance/backups"],
  people: ["POST", "/instance/users/__SELF__/reset-link"],
  flows: ["GET", "/instance/spaces"],
  site: ["GET", "/instance/site"],
  discord: ["GET", "/integrations/discord/secrets"],
  signup: ["GET", "/instance/signup"],
};

describe("Server Owner", () => {
  it("is the setup account and has every power", async () => {
    const me = await json<{ user: { serverRole: string; serverPowers: string[] } }>(
      await api(app, "GET", "/auth/me", { token: owner.token }),
    );
    expect(me.user.serverRole).toBe("owner");
    expect(me.user.serverPowers).toEqual([...SERVER_POWERS]);
  });

  it("lists itself and the TEAMFLOW_INSTANCE_ADMINS admin on the admin list", async () => {
    const { admins } = await json<{ admins: ServerAdminPublic[] }>(
      await api(app, "GET", "/instance/admins", { token: owner.token }),
    );
    expect(admins[0]).toMatchObject({ id: owner.id, role: "owner" });
    expect(admins.find((a) => a.id === envAdmin.id)).toMatchObject({
      role: "admin",
      fromEnv: true,
      powers: [...SERVER_POWERS],
    });
  });
});

describe("each power opens only its own routes", () => {
  for (const power of SERVER_POWERS) {
    it(power, async () => {
      expect((await setPowers(sam.id, [power])).status).toBe(200);
      for (const [other, [method, path, body]] of Object.entries(PROBES)) {
        const url = path.replace("__SELF__", jules.id);
        const res = await api(app, method, url, {
          token: sam.token,
          body: body ?? (method === "GET" ? undefined : {}),
        });
        if (other === power) expect(res.status, `${power}: ${method} ${url}`).toBeLessThan(300);
        else expect(res.status, `${power} must not open ${method} ${url}`).toBe(403);
      }
      // Any power opens the Overview.
      expect((await api(app, "GET", "/instance/overview", { token: sam.token })).status).toBe(200);
    });
  }

  it("with no power ticked there is no Server admin access at all", async () => {
    await setPowers(sam.id, []);
    expect((await api(app, "GET", "/instance/overview", { token: sam.token })).status).toBe(403);
    const me = await json<{ user: { isInstanceAdmin: boolean; serverRole: string } }>(
      await api(app, "GET", "/auth/me", { token: sam.token }),
    );
    expect(me.user).toMatchObject({ isInstanceAdmin: false, serverRole: "admin" });
  });

  it("a trusted admin with the Flows power makes admin Flows (no cap)", async () => {
    await setPowers(sam.id, ["flows"]);
    const teamId = await createTeam(app, sam.token, "Ops", "OPSX");
    const { teams } = await json<{ teams: { id: string; spaceType: string }[] }>(
      await api(app, "GET", "/teams", { token: sam.token }),
    );
    expect(teams.find((t) => t.id === teamId)?.spaceType).toBe("admin");
  });
});

describe("Owner-only actions", () => {
  it("refuse a trusted admin, even with every power", async () => {
    await setPowers(sam.id, [...SERVER_POWERS]);
    const flowId = await createTeam(app, jules.token, "Jules Flow", "JULES");
    for (const [method, path, body] of [
      ["GET", "/instance/admins", undefined],
      ["PUT", `/instance/admins/${jules.id}`, { powers: ["site"] }],
      ["DELETE", `/instance/admins/${envAdmin.id}`, undefined],
      ["POST", "/instance/owner/transfer", { userId: sam.id, confirmEmail: sam.email }],
      ["DELETE", `/instance/spaces/${flowId}`, { confirmKey: "JULES" }],
    ] as const) {
      const res = await api(app, method, path, { token: sam.token, body });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("cannot change or remove the Owner or a TEAMFLOW_INSTANCE_ADMINS admin", async () => {
    expect((await setPowers(owner.id, ["site"])).status).toBe(400);
    const env = await api(app, "DELETE", `/instance/admins/${envAdmin.id}`, { token: owner.token });
    expect(env.status).toBe(409);
    expect((await json<{ code: string }>(env)).code).toBe("setting_set_in_env");
  });

  it("removes a trusted admin", async () => {
    await setPowers(jules.id, ["people"]);
    const res = await api(app, "DELETE", `/instance/admins/${jules.id}`, { token: owner.token });
    const { admins } = await json<{ admins: ServerAdminPublic[] }>(res);
    expect(admins.some((a) => a.id === jules.id)).toBe(false);
    expect((await api(app, "GET", "/instance/overview", { token: jules.token })).status).toBe(403);
  });

  it("deletes a Flow for good once its key is typed", async () => {
    const flowId = await createTeam(app, jules.token, "Old Flow", "OLDF");
    const wrong = await api(app, "DELETE", `/instance/spaces/${flowId}`, {
      token: owner.token,
      body: { confirmKey: "NOPE" },
    });
    expect(wrong.status).toBe(400);
    const res = await api(app, "DELETE", `/instance/spaces/${flowId}`, {
      token: owner.token,
      body: { confirmKey: "oldf" },
    });
    expect(res.status).toBe(204);
    const { teams } = await json<{ teams: { id: string }[] }>(
      await api(app, "GET", "/teams", { token: jules.token }),
    );
    expect(teams.some((t) => t.id === flowId)).toBe(false);
  });
});

describe("Transfer ownership", () => {
  it("needs the new Owner's email typed", async () => {
    const res = await api(app, "POST", "/instance/owner/transfer", {
      token: owner.token,
      body: { userId: sam.id, confirmEmail: "someone@else.example" },
    });
    expect(res.status).toBe(400);
  });

  it("makes the new Owner and keeps the old one as a trusted admin with every power", async () => {
    const res = await api(app, "POST", "/instance/owner/transfer", {
      token: owner.token,
      body: { userId: sam.id, confirmEmail: sam.email.toUpperCase() },
    });
    expect(res.status).toBe(200);
    const { admins } = await json<{ admins: ServerAdminPublic[] }>(res);
    expect(admins.filter((a) => a.role === "owner").map((a) => a.id)).toEqual([sam.id]);
    expect(admins.find((a) => a.id === owner.id)).toMatchObject({
      role: "admin",
      powers: [...SERVER_POWERS],
    });

    // The old Owner can no longer manage admins; the new one can, and can give it back.
    expect((await api(app, "GET", "/instance/admins", { token: owner.token })).status).toBe(403);
    const back = await api(app, "POST", "/instance/owner/transfer", {
      token: sam.token,
      body: { userId: owner.id, confirmEmail: owner.email },
    });
    expect(back.status).toBe(200);
  });
});

describe("People list", () => {
  it("shows each account's server role", async () => {
    const res = await api(app, "GET", "/instance/users?limit=500", { token: owner.token });
    const { users } = await json<{ users: InstanceUserPublic[] }>(res);
    expect(users.find((u) => u.id === owner.id)).toMatchObject({ serverRole: "owner" });
    expect(users.find((u) => u.id === envAdmin.id)).toMatchObject({ adminFromEnv: true });
  });

  it("hands out a working reset link when email is not set up", async () => {
    const res = await api(app, "POST", `/instance/users/${jules.id}/reset-link`, {
      token: owner.token,
    });
    const { reset } = await json<{ reset: PasswordResetIssuedPublic }>(res);
    expect(reset.emailed).toBe(false);
    const token = new URL(reset.url).searchParams.get("reset")!;
    const done = await api(app, "POST", "/auth/reset-password", {
      body: { token, password: "brand-new-password" },
    });
    expect(done.status).toBe(200);
    await login(app, jules.email, "brand-new-password");
  });
});
