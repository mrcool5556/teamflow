import { beforeAll, describe, expect, it, vi } from "vitest";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";

const versionInfo = vi.hoisted(() => ({
  calls: [] as { skipOriginCheck?: boolean }[],
}));

vi.mock("../src/lib/versionInfo.js", () => ({
  getMaintenanceVersionInfo: async (options?: { skipOriginCheck?: boolean }) => {
    versionInfo.calls.push({ skipOriginCheck: options?.skipOriginCheck });
    return {
      version: "0.1.0",
      branch: "main",
      commit: "abc",
      commitShort: "abc",
      commitDate: null,
      latestCommit: options?.skipOriginCheck ? null : "def",
      latestCommitShort: options?.skipOriginCheck ? null : "def",
      updateAvailable: !options?.skipOriginCheck,
      commitsBehind: options?.skipOriginCheck ? null : 1,
      gitError: null,
    };
  },
}));

let app: TestApp;
let admin: RegisteredUser;

beforeAll(async () => {
  app = await bootApp();
  admin = await registerUser(app); // first account: instance admin and Owner of "General"
});

describe("maintenance status", () => {
  it("GET never contacts origin; POST check does and is cached for later GETs", async () => {
    versionInfo.calls.length = 0;
    const before = await api(app, "GET", `/teams/${admin.teamId}/server/maintenance`, {
      token: admin.token,
    });
    expect(before.status).toBe(200);
    expect(versionInfo.calls).toEqual([{ skipOriginCheck: true }]);
    const { status: cold } = await json<{ status: { version: { latestCommit: string | null } } }>(
      before,
    );
    expect(cold.version.latestCommit).toBeNull();

    versionInfo.calls.length = 0;
    const check = await api(app, "POST", `/teams/${admin.teamId}/server/maintenance/check`, {
      token: admin.token,
    });
    expect(check.status).toBe(200);
    expect(versionInfo.calls).toEqual([{ skipOriginCheck: false }]);

    versionInfo.calls.length = 0;
    const after = await api(app, "GET", `/teams/${admin.teamId}/server/maintenance`, {
      token: admin.token,
    });
    const { status } = await json<{ status: { version: { latestCommit: string | null } } }>(after);
    expect(status.version.latestCommit).toBe("def");
    expect(versionInfo.calls).toEqual([]);
  });

  it("guards the check like the other maintenance actions", async () => {
    const other = await registerUser(app); // not instance admin
    const res = await api(app, "POST", `/teams/${other.teamId}/server/maintenance/check`, {
      token: other.token,
    });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: "Instance admin required", code: "forbidden" });
  });
});
