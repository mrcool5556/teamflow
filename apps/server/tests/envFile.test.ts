import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { loadEnvFile, resolveEnvFile } from "../src/envFile.js";

const FILE_SECRET = "secret-from-env-file-0123456789abcdef";
const KEYS = ["JWT_SECRET", "TEAMFLOW_ENV_FILE", "TEAMFLOW_APP_DIR", "PORT"] as const;

describe("env file loading", () => {
  let dir: string;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "teamflow-env-"));
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("supplies JWT_SECRET from TEAMFLOW_ENV_FILE so config loads", () => {
    const file = path.join(dir, ".env");
    fs.writeFileSync(file, `JWT_SECRET=${FILE_SECRET}\nPORT=4321\n`);
    process.env.TEAMFLOW_ENV_FILE = file;

    expect(loadEnvFile()).toBe(file);
    const config = loadConfig({ ...process.env, NODE_ENV: "production" });
    expect(config.jwtSecret).toBe(FILE_SECRET);
    expect(config.port).toBe(4321);
  });

  it("never overrides a value already in process.env", () => {
    const file = path.join(dir, ".env");
    fs.writeFileSync(file, `JWT_SECRET=${FILE_SECRET}\nPORT=4321\n`);
    process.env.TEAMFLOW_ENV_FILE = file;
    process.env.JWT_SECRET = "secret-from-process-env-0123456789";

    loadEnvFile();
    expect(process.env.JWT_SECRET).toBe("secret-from-process-env-0123456789");
    expect(process.env.PORT).toBe("4321");
  });

  it("falls back to <app dir>/.env and to nothing when it is missing", () => {
    process.env.TEAMFLOW_APP_DIR = dir;
    expect(resolveEnvFile()).toBeNull();
    expect(loadEnvFile()).toBeNull();

    fs.writeFileSync(path.join(dir, ".env"), `JWT_SECRET=${FILE_SECRET}\n`);
    expect(resolveEnvFile()).toBe(path.join(dir, ".env"));
  });

  it("refuses a TEAMFLOW_ENV_FILE that does not exist", () => {
    process.env.TEAMFLOW_ENV_FILE = path.join(dir, "missing.env");
    expect(() => loadEnvFile()).toThrow(/TEAMFLOW_ENV_FILE not found/);
  });
});
