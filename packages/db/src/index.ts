import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { applySchemaPatches } from "./patches.js";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

export function findRepoRoot(start = process.cwd()) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return start;
}

export function resolveDatabasePath(databaseUrl?: string) {
  const url =
    databaseUrl ??
    process.env.DATABASE_URL ??
    `file:${path.join(findRepoRoot(), "data", "teamflow.db")}`;
  const filePath = url.replace(/^file:/, "");
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(findRepoRoot(), filePath);
}

export function createDb(databaseUrl?: string) {
  const filePath = resolveDatabasePath(databaseUrl);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applySchemaPatches(sqlite);
  return drizzle(sqlite, { schema });
}

export { schema };
