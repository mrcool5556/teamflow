import { describe, expect, it } from "vitest";
import type { MaintenanceJobPublic, MaintenanceReleaseCheckPublic } from "@teamflow/core";
import { parseMaintenanceLog } from "@teamflow/core";
import { computeUpdateState, describeNotSetUp } from "../src/lib/maintenance.js";
import { pickLatestRelease } from "../src/lib/releaseCheck.js";

const release = (current: string, latest: string | null): MaintenanceReleaseCheckPublic => ({
  current: {
    version: current,
    commit: null,
    builtAt: "x",
    platform: "linux-x64",
    releaseInstall: true,
  },
  latest: latest
    ? { version: latest, notes: "", publishedAt: null, url: "", prerelease: false, sizeBytes: null }
    : null,
  channel: "stable",
  checkedAt: null,
  checkError: null,
  checkEnabled: true,
});

const job = (status: MaintenanceJobPublic["status"], logTail: string): MaintenanceJobPublic => ({
  id: "j",
  type: "update",
  status,
  startedAt: "2026-11-09T10:00:00Z",
  finishedAt: null,
  logTail,
  options: {},
});

describe("computeUpdateState", () => {
  const base = { job: null, lastRun: null, notSetUpReason: null };
  it("up to date / available", () => {
    expect(computeUpdateState({ ...base, release: release("0.2.0", "0.2.0") })).toBe("up-to-date");
    expect(computeUpdateState({ ...base, release: release("0.2.0", null) })).toBe("up-to-date");
    expect(computeUpdateState({ ...base, release: release("0.2.0", "0.2.1") })).toBe("available");
  });

  it("updating wins, then failed, then not set up", () => {
    const r = release("0.2.0", "0.2.1");
    const running = job("running", "STEP download\n");
    expect(computeUpdateState({ ...base, job: running, release: r, notSetUpReason: "x" })).toBe(
      "updating",
    );
    const failed = job("failed", "STEP download\nFAIL network Couldn't reach GitHub.\n");
    expect(
      computeUpdateState({
        job: failed,
        lastRun: parseMaintenanceLog(failed.logTail),
        notSetUpReason: null,
        release: r,
      }),
    ).toBe("failed");
    const notSetUp = job("failed", "FAIL not-set-up This server runs from a git checkout.\n");
    const lastRun = parseMaintenanceLog(notSetUp.logTail);
    const reason = describeNotSetUp({
      disabledReason: null,
      release: r,
      sudoReady: true,
      sudoChecked: true,
      sudoPending: false,
      lastRun,
    });
    expect(reason).toBe("This server runs from a git checkout.");
    expect(computeUpdateState({ job: notSetUp, lastRun, notSetUpReason: reason, release: r })).toBe(
      "not-set-up",
    );
  });
});

describe("describeNotSetUp", () => {
  const input = {
    disabledReason: null,
    release: release("0.2.0", "0.2.1"),
    sudoReady: false,
    sudoChecked: false,
    sudoPending: false,
    lastRun: null,
  };
  it("does not blame sudo before it was probed or while a job runs", () => {
    expect(describeNotSetUp(input)).toBeNull();
    expect(describeNotSetUp({ ...input, sudoChecked: true, sudoPending: true })).toBeNull();
    expect(describeNotSetUp({ ...input, sudoChecked: true })).toMatch(/sudo/);
  });
  it("a git checkout is not set up", () => {
    const r = release("0.2.0", "0.2.1");
    r.current.releaseInstall = false;
    expect(describeNotSetUp({ ...input, release: r })).toMatch(/git checkout/);
  });
});

describe("pickLatestRelease", () => {
  it("skips drafts, odd tags and (on stable) pre-releases; reads this platform's size", () => {
    const list = [
      { tag_name: "v0.3.0-rc.1", prerelease: true },
      { tag_name: "v0.2.1", assets: [{ name: "teamflow-v0.2.1-linux-x64.tar.gz", size: 42 }] },
      { tag_name: "v0.9.0", draft: true },
      { tag_name: "nightly" },
      { tag_name: "v0.2.0" },
    ];
    expect(pickLatestRelease(list, "stable", "linux-x64")).toMatchObject({
      version: "0.2.1",
      sizeBytes: 42,
    });
    expect(pickLatestRelease(list, "prerelease", "linux-x64")?.version).toBe("0.3.0-rc.1");
    expect(pickLatestRelease([], "stable")).toBeNull();
  });
});
