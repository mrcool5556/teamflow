import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, schema } from "@teamflow/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const dbPackage = path.join(repoRoot, "packages", "db");
const tsxBin = path.join(
  dbPackage,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.CMD" : "tsx",
);

let scratch: string;

function runSeed(dbFile: string, extraEnv: Record<string, string>) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: `file:${dbFile}` };
  delete env.TEAMFLOW_SEED_DEMO;
  Object.assign(env, extraEnv);
  const stdout = execFileSync(tsxBin, ["src/seed.ts"], {
    cwd: dbPackage,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  return stdout;
}

async function countUsers(dbFile: string) {
  const db = createDb(`file:${dbFile}`);
  const rows = await db.select({ id: schema.users.id }).from(schema.users);
  return rows.length;
}

beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-seed-"));
});

afterAll(() => {
  // The in-process db handle stays open until the worker exits; a locked file is harmless here.
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* temp dir will be cleaned by the OS */
  }
});

describe("demo seed", () => {
  it("does nothing and prints nothing unless TEAMFLOW_SEED_DEMO=1", async () => {
    const dbFile = path.join(scratch, "plain.db");
    const out = runSeed(dbFile, {});
    expect(out.trim()).toBe("");
    expect(await countUsers(dbFile)).toBe(0);
  });

  it("seeds the demo user only when opted in, without printing the password", async () => {
    const dbFile = path.join(scratch, "demo.db");
    const out = runSeed(dbFile, { TEAMFLOW_SEED_DEMO: "1" });
    expect(out).not.toMatch(/changeme123/);
    expect(await countUsers(dbFile)).toBe(1);
  });

  it("login screen no longer ships demo credentials", () => {
    const loginTsx = fs.readFileSync(
      path.join(repoRoot, "apps", "web", "src", "routes", "auth", "LoginScreen.tsx"),
      "utf8",
    );
    expect(loginTsx).not.toMatch(/changeme123/);
    expect(loginTsx).not.toMatch(/demo@teamflow\.local/);
  });
});
