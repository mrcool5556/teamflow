import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  api,
  bootApp,
  joinTeam,
  json,
  registerUser,
  type RegisteredUser,
  type TestApp,
} from "./helpers";
import { formatEnvValue, readEnvFile, setEnvFileValue } from "../src/lib/envFile.js";

let app: TestApp;
let admin: RegisteredUser;
let member: RegisteredUser;
let scratch: string;

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-hygiene-"));
  app = await bootApp({ UPLOAD_DIR: path.join(scratch, "uploads") });
  admin = await registerUser(app); // first user = instance admin
  member = await registerUser(app);
  await joinTeam(app, admin.token, admin.teamId, member.token, "member");
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("maintenance update input", () => {
  it("refuses any git branch: servers install prebuilt releases", async () => {
    for (const branch of ["main", "--upload-pack=evil"]) {
      const res = await api(app, "POST", `/teams/${admin.teamId}/server/maintenance/update`, {
        token: admin.token,
        body: { branch },
      });
      expect(res.status).toBe(400);
      expect((await json<{ error: string }>(res)).error).toMatch(/branch/);
    }
  });

  it("only accepts a version number as the target", async () => {
    const res = await api(app, "POST", `/teams/${admin.teamId}/server/maintenance/update`, {
      token: admin.token,
      body: { version: "1.2.3; rm -rf /" },
    });
    expect(res.status).toBe(400);
  });
});

describe("maintenance restore input", () => {
  it("only takes a plain database backup file name", async () => {
    for (const file of [
      "../../etc/passwd",
      "/var/backups/teamflow/teamflow_1.db",
      "teamflow_1.tar.gz",
      "x.db",
    ]) {
      const res = await api(app, "POST", `/teams/${admin.teamId}/server/maintenance/restore`, {
        token: admin.token,
        body: { file },
      });
      expect(res.status).toBe(400);
    }
  });

  it("is instance-admin only", async () => {
    const res = await api(app, "POST", `/teams/${member.teamId}/server/maintenance/restore`, {
      token: member.token,
      body: { file: "teamflow_2026-11-09_140201.db" },
    });
    expect(res.status).toBe(403);
  });
});

describe("env file writes", () => {
  it("refuses values with line breaks", async () => {
    const file = path.join(scratch, "a.env");
    await expect(setEnvFileValue(file, "TEAMFLOW_URL", "http://x\nEVIL=1")).rejects.toThrow();
    await expect(setEnvFileValue(file, "TEAMFLOW_URL", "http://x\rEVIL=1")).rejects.toThrow();
    expect(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "").not.toMatch(/EVIL/);
  });

  it("quotes and escapes quotes, round-tripping through the reader", async () => {
    const file = path.join(scratch, "b.env");
    const tricky = 'say "hi" # not a comment \\ done';
    await setEnvFileValue(file, "PLAIN", "http://localhost:3000");
    await setEnvFileValue(file, "TRICKY", tricky);
    const raw = fs.readFileSync(file, "utf8");
    expect(raw.split("\n").filter((l) => l.startsWith("TRICKY=")).length).toBe(1);
    expect(formatEnvValue("simple")).toBe("simple");
    const values = await readEnvFile(file);
    expect(values.get("PLAIN")).toBe("http://localhost:3000");
    expect(values.get("TRICKY")).toBe(tricky);
  });

  it("rejects invalid keys", async () => {
    await expect(setEnvFileValue(path.join(scratch, "c.env"), "BAD KEY", "x")).rejects.toThrow();
  });
});

describe("chunked upload ownership", () => {
  it("only the session owner can PUT chunks", async () => {
    const { issue } = await json<{ issue: { id: string } }>(
      await api(app, "POST", "/issues", {
        token: admin.token,
        body: { teamId: admin.teamId, title: "chunks" },
      }),
    );
    const { session } = await json<{ session: { sessionId: string } }>(
      await api(app, "POST", `/issues/${issue.id}/uploads`, {
        token: admin.token,
        body: { filename: "part.bin", totalBytes: 10 },
      }),
    );
    const payload = Buffer.alloc(10, 1);
    const put = (token: string) =>
      app.request(`/uploads/${session.sessionId}/chunks/0`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
        body: payload,
      });

    const stranger = await put(member.token);
    expect([403, 404]).toContain(stranger.status);
    const owner = await put(admin.token);
    expect(owner.status).toBe(200);
  });
});
