import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SETUP_CODE_PATTERN } from "@teamflow/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bootApp, json, setupCode, type TestApp } from "./helpers";

let app: TestApp;
let scratch: string;
type Setup = typeof import("../src/lib/setup.js");
let setup: Setup;

const ADMIN = { name: "George", email: "george@example.test", password: "correct-horse-battery" };

async function reload(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { reloadConfig } = await import("../src/config.js");
  reloadConfig();
}

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-setup-test-"));
  app = await bootApp();
  setup = await import("../src/lib/setup.js");
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("a fresh server", () => {
  it("says setup is needed and refuses ordinary registration", async () => {
    const status = await json<{ setup: { needed: boolean; codeRequired: boolean } }>(
      await api(app, "GET", "/auth/setup"),
    );
    expect(status.setup).toEqual({ needed: true, codeRequired: true });

    const config = await json<{ setupNeeded: boolean; siteName: string }>(
      await api(app, "GET", "/auth/config"),
    );
    expect(config).toMatchObject({ setupNeeded: true, siteName: "Teamflow" });

    const res = await api(app, "POST", "/auth/register", {
      body: { email: "first@example.test", name: "First", password: "correct-horse-battery" },
    });
    expect(res.status).toBe(409);
    expect((await json<{ code: string }>(res)).code).toBe("setup_required");
  });

  it("keeps the code in <data dir>/setup-code and reuses it across restarts", async () => {
    const dbFile = path.join(scratch, "data", "teamflow.db");
    await reload({ DATABASE_URL: `file:${dbFile}` });
    try {
      const { db } = await import("../src/db.js");
      const first = setup.ensureSetupCode(db)!;
      expect(first).toMatch(SETUP_CODE_PATTERN);
      const file = path.join(scratch, "data", "setup-code");
      expect(fs.readFileSync(file, "utf8").trim()).toBe(first);
      expect(setup.ensureSetupCode(db)).toBe(first);

      const lines: string[] = [];
      setup.announceSetupIfNeeded(db, (line) => lines.push(line));
      expect(lines.join("\n")).toContain(`http://localhost:3000/setup?code=${first}`);

      setup.removeSetupCode();
      expect(fs.existsSync(file)).toBe(false);
    } finally {
      await reload({ DATABASE_URL: ":memory:" });
    }
  });

  it("uses TEAMFLOW_SETUP_CODE when the installer sets one", async () => {
    await reload({ TEAMFLOW_SETUP_CODE: "abcd efgh" });
    try {
      expect(await setupCode()).toBe("ABCD-EFGH");
    } finally {
      await reload({ TEAMFLOW_SETUP_CODE: undefined });
    }
  });

  it("refuses a wrong setup code", async () => {
    const res = await api(app, "POST", "/auth/setup/admin", {
      body: { ...ADMIN, code: "AAAA-AAAA" },
    });
    expect(res.status).toBe(403);
    expect((await json<{ code: string }>(res)).code).toBe("setup_code_invalid");
  });

  it("makes exactly one admin when two setups race, then closes for good", async () => {
    const code = (await setupCode()).toLowerCase().replace("-", " ");
    const [a, b] = await Promise.all([
      api(app, "POST", "/auth/setup/admin", { body: { ...ADMIN, code } }),
      api(app, "POST", "/auth/setup/admin", {
        body: { ...ADMIN, email: "intruder@example.test", code },
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = a.status === 201 ? a : b;
    const { user, token } = await json<{
      user: { isInstanceAdmin: boolean };
      token: string;
    }>(winner);
    expect(user.isInstanceAdmin).toBe(true);

    // The admin starts with no team; the welcome page offers to create one.
    const teams = await json<{ teams: unknown[] }>(await api(app, "GET", "/teams", { token }));
    expect(teams.teams).toEqual([]);

    const status = await json<{ setup: { needed: boolean } }>(await api(app, "GET", "/auth/setup"));
    expect(status.setup.needed).toBe(false);

    const again = await api(app, "POST", "/auth/setup/admin", {
      body: { ...ADMIN, email: "late@example.test", code },
    });
    expect(again.status).toBe(409);
    expect((await json<{ code: string }>(again)).code).toBe("setup_done");
  });

  it("opens ordinary registration once the admin exists", async () => {
    const res = await api(app, "POST", "/auth/register", {
      body: { email: "member@example.test", name: "Member", password: "correct-horse-battery" },
    });
    expect(res.status).toBe(201);
    const { user } = await json<{ user: { isInstanceAdmin: boolean } }>(res);
    expect(user.isInstanceAdmin).toBe(false);
  });
});
