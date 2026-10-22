import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASH_PATH, buildSpawnArgs, INSTALLED_SCRIPT_DIR } from "../src/lib/hostScripts.js";
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
