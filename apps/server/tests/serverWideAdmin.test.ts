import { permissionsForSystemSlug } from "@teamflow/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  api,
  bootApp,
  createTeam,
  joinTeam,
  json,
  listRoles,
  registerAccount,
  type RegisteredAccount,
  type TestApp,
} from "./helpers";

/**
 * Updates, backups and the Discord bot are server-wide: the instance-admin flag alone decides,
 * whichever Flow is open (or none) and whatever the role in it. The maintenance jobs themselves
 * are stubbed; these tests are about who may call them.
 */
const ran = vi.hoisted(() => ({ backup: 0, update: 0 }));

vi.mock("../src/lib/maintenance.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/maintenance.js")>();
  const job = (type: string) => ({
    id: `job-${type}`,
    type,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logTail: "",
    options: {},
  });
  return {
    ...actual,
    getMaintenanceStatus: async () => ({ enabled: true, job: null }),
    runMaintenanceBackup: async () => {
      ran.backup += 1;
      return job("backup");
    },
    runMaintenanceUpdate: async () => {
      ran.update += 1;
      return job("update");
    },
  };
});

let app: TestApp;
let admin: RegisteredAccount;
let owner: RegisteredAccount;
let flowId: string;

beforeAll(async () => {
  app = await bootApp();
  admin = await registerAccount(app, { name: "George" }); // through setup: instance admin
  owner = await registerAccount(app, { name: "Owner" });
  flowId = await createTeam(app, owner.token, "Three D Arcade", "THREEDAR");
});

const SERVER_WIDE: [string, string][] = [
  ["GET", "/server/maintenance"],
  ["GET", "/server/maintenance/job"],
  ["POST", "/server/maintenance/backup"],
  ["POST", "/server/maintenance/update"],
  ["GET", "/integrations/discord/secrets"],
  ["GET", "/integrations/discord/service"],
];

async function call(token: string, method: string, path: string) {
  return api(app, method, path, { token, body: method === "GET" ? undefined : {} });
}

describe("server-wide admin sections", () => {
  it("work for the instance admin with no Flow at all", async () => {
    const before = { ...ran };
    for (const [method, path] of SERVER_WIDE) {
      const res = await call(admin.token, method, path);
      expect(res.status, `${method} ${path}`).toBeLessThan(300);
    }
    expect(ran.backup).toBe(before.backup + 1);
    expect(ran.update).toBe(before.update + 1);
  });

  it("work for the instance admin who is only an Admin (not Owner) in the open Flow", async () => {
    await joinTeam(app, owner.token, flowId, admin.token, "admin");
    // The role in the open Flow is irrelevant; the old per-team status path still answers.
    const status = await call(admin.token, "GET", `/teams/${flowId}/server/maintenance`);
    expect(status.status).toBe(200);
    const backup = await call(admin.token, "POST", "/server/maintenance/backup");
    expect(backup.status).toBe(202);
    const update = await call(admin.token, "POST", "/server/maintenance/update");
    expect(update.status).toBe(202);
    expect((await json<{ job: { type: string } }>(update)).job.type).toBe("update");
  });

  it("refuse a Flow Owner who is not the instance admin, with or without a Flow", async () => {
    const before = { ...ran };
    for (const [method, path] of SERVER_WIDE) {
      const res = await call(owner.token, method, path);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    for (const path of ["/server/maintenance", "/server/maintenance/job"]) {
      const viaFlow = await call(owner.token, "GET", `/teams/${flowId}${path}`);
      expect(viaFlow.status, path).toBe(403);
    }
    expect(ran).toEqual(before);
  });

  it("still lets a Flow Owner see the bot service status in their Flow's settings", async () => {
    const res = await call(owner.token, "GET", `/teams/${flowId}/integrations/discord/service`);
    expect(res.status).toBe(200);
  });

  it("lets an Owner role drop the retired server permissions", async () => {
    const ownerRole = (await listRoles(app, owner.token, flowId)).find((r) => r.slug === "owner")!;
    const permissions = permissionsForSystemSlug("owner").filter(
      (p) => !p.startsWith("server.maintenance"),
    );
    const res = await api(app, "PATCH", `/teams/${flowId}/roles/${ownerRole.id}`, {
      token: owner.token,
      body: { permissions },
    });
    expect(res.status).toBe(200);
  });
});
