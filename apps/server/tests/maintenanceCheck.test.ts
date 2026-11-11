import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MaintenanceStatusPublic } from "@teamflow/core";
import { api, bootApp, json, registerUser, type RegisteredUser, type TestApp } from "./helpers";

const github = vi.hoisted(() => ({ calls: 0 }));

let app: TestApp;
let admin: RegisteredUser;
let appDir: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-check-"));
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/")) {
      github.calls += 1;
      return new Response(
        JSON.stringify([
          { tag_name: "v99.0.0-rc.1", prerelease: true, draft: false, body: "rc", assets: [] },
          {
            tag_name: "v99.0.0",
            prerelease: false,
            draft: false,
            body: "- Big one",
            html_url: "https://github.com/mrcool5556/teamflow/releases/tag/v99.0.0",
            published_at: "2026-11-09T10:00:00Z",
            assets: [{ name: "teamflow-v99.0.0-linux-x64.tar.gz", size: 123 }],
          },
          { tag_name: "v98.0.0", prerelease: false, draft: false, body: "", assets: [] },
          { tag_name: "v100.0.0", prerelease: false, draft: true, body: "", assets: [] },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;
  app = await bootApp({ TEAMFLOW_UPDATE_CHECK: "true", TEAMFLOW_APP_DIR: appDir });
  admin = await registerUser(app); // first account: instance admin and Owner of "General"
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  process.env.TEAMFLOW_UPDATE_CHECK = "false";
  delete process.env.TEAMFLOW_APP_DIR;
  const { reloadConfig } = await import("../src/config.js");
  reloadConfig();
  fs.rmSync(appDir, { recursive: true, force: true });
});

async function status(method: "GET" | "POST", suffix = "") {
  const res = await api(app, method, `/server/maintenance${suffix}`, {
    token: admin.token,
  });
  expect(res.status).toBe(200);
  return (await json<{ status: MaintenanceStatusPublic }>(res)).status;
}

describe("maintenance status", () => {
  it("GET never contacts GitHub; POST check does and later GETs read the cache", async () => {
    github.calls = 0;
    const cold = await status("GET");
    expect(github.calls).toBe(0);
    expect(cold.release.latest).toBeNull();
    expect(cold.release.checkEnabled).toBe(true);

    const checked = await status("POST", "/check");
    expect(github.calls).toBe(1);
    // Newest stable, non-draft release; the pre-release and the draft are skipped.
    expect(checked.release.latest?.version).toBe("99.0.0");
    expect(checked.release.latest?.notes).toBe("- Big one");
    expect(checked.release.channel).toBe("stable");

    const after = await status("GET");
    expect(github.calls).toBe(1);
    expect(after.release.latest?.version).toBe("99.0.0");
    // A dev checkout is not a release install, so one-click updates are not set up here.
    expect(after.state).toBe("not-set-up");
    expect(after.notSetUpReason).toBeTruthy();
  });

  it("switching to the pre-release channel offers release candidates", async () => {
    const res = await api(app, "PUT", `/server/maintenance/settings`, {
      token: admin.token,
      body: { channel: "prerelease" },
    });
    expect(res.status).toBe(200);
    const { status: next } = await json<{ status: MaintenanceStatusPublic }>(res);
    expect(next.release.channel).toBe("prerelease");
    // 99.0.0 is newer than its own release candidate.
    expect(next.release.latest?.version).toBe("99.0.0");
    await api(app, "PUT", `/server/maintenance/settings`, {
      token: admin.token,
      body: { channel: "stable" },
    });
  });

  it("refuses branch updates", async () => {
    const res = await api(app, "POST", `/server/maintenance/update`, {
      token: admin.token,
      body: { branch: "main" },
    });
    expect(res.status).toBe(400);
  });

  it("guards the check like the other maintenance actions", async () => {
    const other = await registerUser(app); // not instance admin
    const res = await api(app, "POST", `/server/maintenance/check`, {
      token: other.token,
    });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: "Instance admin required", code: "forbidden" });
  });
});
