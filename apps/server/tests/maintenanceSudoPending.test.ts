import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Stands in for `sudo -n <backup.sh> --help`; tests set what it answers and count calls. */
const sudo = vi.hoisted(() => ({
  calls: 0,
  result: { ready: true, command: "", detail: "ok" } as {
    ready: boolean;
    command: string;
    detail: string;
  },
}));

vi.mock("../src/lib/hostScripts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/hostScripts.js")>();
  return {
    ...actual,
    probeSudo: async () => {
      sudo.calls += 1;
      return sudo.result;
    },
  };
});

let appDir: string;
const realPlatform = process.platform;
type Maintenance = typeof import("../src/lib/maintenance.js");
let maintenance: Maintenance;

function writeJob(status: "running" | "success") {
  fs.mkdirSync(path.join(appDir, "data"), { recursive: true });
  fs.writeFileSync(
    path.join(appDir, "data", "maintenance-job.json"),
    JSON.stringify({
      id: "job-1",
      type: "update",
      status,
      startedAt: new Date().toISOString(),
      finishedAt: status === "running" ? null : new Date().toISOString(),
      options: {},
      // The test process stands in for update.sh, so the job counts as still running.
      pid: process.pid,
    }),
  );
}

beforeAll(async () => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-sudo-pending-test-"));
  for (const script of ["backup.sh", "update.sh"]) {
    fs.writeFileSync(path.join(appDir, script), "#!/bin/sh\n");
  }
  // In-app maintenance only runs on Linux hosts.
  Object.defineProperty(process, "platform", { value: "linux" });
  process.env.TEAMFLOW_MAINTENANCE_ENABLED = "true";
  process.env.TEAMFLOW_APP_DIR = appDir;
  process.env.TEAMFLOW_BACKUP_DIR = path.join(appDir, "backups");
  process.env.TEAMFLOW_BACKUP_SCRIPT = path.join(appDir, "backup.sh");
  process.env.TEAMFLOW_UPDATE_SCRIPT = path.join(appDir, "update.sh");
  const { reloadConfig } = await import("../src/config.js");
  reloadConfig();
  maintenance = await import("../src/lib/maintenance.js");
});

afterAll(() => {
  Object.defineProperty(process, "platform", { value: realPlatform });
  fs.rmSync(appDir, { recursive: true, force: true });
});

beforeEach(() => {
  maintenance.resetMaintenanceHostCheck();
  sudo.calls = 0;
  fs.rmSync(path.join(appDir, "data"), { recursive: true, force: true });
});

describe("sudo check during an update", () => {
  it("does not probe while update.sh is reinstalling the scripts, and reports it as pending", async () => {
    writeJob("running");
    // What the probe would have said mid-reinstall (the false alarm George saw).
    sudo.result = {
      ready: false,
      command: "sudo -n backup.sh --help",
      detail: "command not found",
    };

    const status = await maintenance.checkMaintenanceHost();
    expect(sudo.calls).toBe(0);
    expect(status.sudoPending).toBe(true);
    expect(status.sudoDetail).toBeNull();
  });

  it("probes again once the job has finished, then uses the cached result", async () => {
    writeJob("running");
    await maintenance.checkMaintenanceHost();

    writeJob("success");
    sudo.result = { ready: true, command: "", detail: "ok" };
    const after = await maintenance.getMaintenanceStatus();
    expect(sudo.calls).toBe(1);
    expect(after).toMatchObject({ sudoPending: false, sudoReady: true, sudoDetail: null });

    await maintenance.getMaintenanceStatus();
    expect(sudo.calls).toBe(1);
  });

  it("still reports a real sudo problem when no job is running", async () => {
    sudo.result = {
      ready: false,
      command: "sudo -n backup.sh --help",
      detail: "a password is required",
    };
    const status = await maintenance.checkMaintenanceHost();
    expect(sudo.calls).toBe(1);
    expect(status).toMatchObject({ sudoPending: false, sudoReady: false });
    expect(status.sudoDetail).toBe("a password is required (sudo -n backup.sh --help)");
  });
});
