import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@teamflow/db";

/**
 * Which env file to load: TEAMFLOW_ENV_FILE when set, else `<app dir>/.env` when it exists,
 * else none. The app dir is TEAMFLOW_APP_DIR (relative to the repo root) or the repo root.
 */
export function resolveEnvFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.TEAMFLOW_ENV_FILE?.trim();
  if (explicit) return path.resolve(explicit);
  const repoRoot = findRepoRoot();
  const appDir = env.TEAMFLOW_APP_DIR?.trim()
    ? path.resolve(repoRoot, env.TEAMFLOW_APP_DIR.trim())
    : repoRoot;
  const candidate = path.join(appDir, ".env");
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Load the env file into process.env with Node's built-in loader. Variables already set in the
 * process environment always win, so systemd's EnvironmentFile behaves exactly as before.
 * Throws when TEAMFLOW_ENV_FILE names a file that does not exist, so the server refuses to start.
 */
export function loadEnvFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const file = resolveEnvFile(env);
  if (!file) return null;
  if (!fs.existsSync(file)) throw new Error(`TEAMFLOW_ENV_FILE not found: ${file}`);
  process.loadEnvFile(file);
  return file;
}
