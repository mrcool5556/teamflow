import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BASH_PATH,
  buildJobSpawn,
  buildSpawnArgs,
  INSTALLED_SCRIPT_DIR,
} from "../src/lib/hostScripts.js";
import { api, bootApp, registerUser } from "./helpers";

describe("buildSpawnArgs", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  beforeEach(() => Object.defineProperty(process, "platform", { value: "linux" }));
  afterEach(() => Object.defineProperty(process, "platform", platform));

  it("runs installed copies directly under sudo and checkout copies via bash", () => {
    const installed = `${INSTALLED_SCRIPT_DIR}backup.sh`;
    expect(buildSpawnArgs(installed, ["--db-only"], true)).toEqual({
      command: "sudo",
      args: ["-n", installed, "--db-only"],
    });
    expect(buildSpawnArgs("/opt/teamflow/deploy/backup.sh", [], true)).toEqual({
      command: "sudo",
      args: ["-n", BASH_PATH, "/opt/teamflow/deploy/backup.sh"],
    });
    expect(buildSpawnArgs(installed, ["status"], false)).toEqual({
      command: BASH_PATH,
      args: [installed, "status"],
    });
  });

  it("runs .ps1 scripts with Windows PowerShell on Windows, never sudo", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const script = "C:\\Teamflow\\current\\deploy\\windows\\update.ps1";
    expect(buildSpawnArgs(script, ["--version", "0.2.1"], true)).toEqual({
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "--version",
        "0.2.1",
      ],
    });
  });
});

describe("buildJobSpawn", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  afterEach(() => Object.defineProperty(process, "platform", platform));

  it("spawns the plain command on Linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const installed = `${INSTALLED_SCRIPT_DIR}update.sh`;
    expect(buildJobSpawn(installed, ["--version", "0.2.1"])).toEqual({
      command: "sudo",
      args: ["-n", installed, "--version", "0.2.1"],
      verbatim: false,
    });
  });

  it("hops through cmd start /b on Windows so PowerShell outlives the server", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const script = String.raw`C:\Users\Jo Smith\AppData\Local\Teamflow\current\deploy\windows\update.ps1`;
    const spawn = buildJobSpawn(script, ["--version", "0.2.1"]);
    expect(spawn.command).toBe("cmd.exe");
    expect(spawn.verbatim).toBe(true);
    expect(spawn.args).toEqual([
      "/d",
      "/s",
      "/c",
      `"start "" /b powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}" --version 0.2.1"`,
    ]);
  });
});

describe("removed routes", () => {
  it("no longer serves the dead POST /teams/:teamId/statuses", async () => {
    const app = await bootApp();
    const user = await registerUser(app);
    const res = await api(app, "POST", `/teams/${user.teamId}/statuses`, {
      token: user.token,
      body: { name: "x" },
    });
    expect(res.status).toBe(404);
  });
});
