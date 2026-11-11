import { describe, expect, it } from "vitest";
import {
  compareVersions,
  inferMaintenanceJobOutcome,
  parseMaintenanceLog,
} from "../src/maintenance";

describe("parseMaintenanceLog", () => {
  it("reads the last STEP, FAIL and DONE lines", () => {
    const log = [
      "> sudo -n /usr/local/lib/teamflow/update.sh --version 0.2.1",
      "==> Teamflow update",
      "STEP download",
      "==> Verified teamflow-v0.2.1-linux-x64.tar.gz (sha256 ok)",
      "STEP backup",
      "STEP install",
      "FAIL migrate The database update for v0.2.1 failed. The backup was restored.",
    ].join("\n");
    expect(parseMaintenanceLog(log)).toEqual({
      step: "install",
      failure: {
        code: "migrate",
        message: "The database update for v0.2.1 failed. The backup was restored.",
      },
      done: null,
    });
  });

  it("handles CRLF logs from Windows and unknown codes", () => {
    const log = "STEP download\r\nSTEP bogus\r\nFAIL weird Something odd\r\n";
    expect(parseMaintenanceLog(log)).toEqual({
      step: "download",
      failure: { code: "unknown", message: "Something odd" },
      done: null,
    });
  });

  it("reports DONE", () => {
    expect(parseMaintenanceLog("STEP check\nDONE 0.2.1\n").done).toBe("0.2.1");
  });
});

describe("inferMaintenanceJobOutcome", () => {
  it("understands the release scripts and the old git scripts", () => {
    expect(inferMaintenanceJobOutcome("update", "STEP check\nDONE 0.2.1\n")).toBe("success");
    expect(inferMaintenanceJobOutcome("update", "Health: ok\n")).toBe("success");
    expect(inferMaintenanceJobOutcome("update", "STEP restart\n")).toBe("failed");
    expect(inferMaintenanceJobOutcome("backup", "BACKUP database /x/teamflow_1.db\n")).toBe(
      "success",
    );
    expect(inferMaintenanceJobOutcome("backup", "SQLite backup: /x\n")).toBe("success");
    expect(inferMaintenanceJobOutcome("backup", "No database found\n")).toBe("failed");
  });
});

describe("compareVersions", () => {
  it("orders SemVer including pre-releases", () => {
    const sorted = ["0.10.0", "0.2.0", "0.3.0-rc.2", "0.3.0", "0.3.0-rc.10", "1.0.0", "v0.2.1"]
      .slice()
      .sort(compareVersions);
    expect(sorted).toEqual([
      "0.2.0",
      "v0.2.1",
      "0.3.0-rc.2",
      "0.3.0-rc.10",
      "0.3.0",
      "0.10.0",
      "1.0.0",
    ]);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
  });
});
