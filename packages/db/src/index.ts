import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const MEMORY_DB = ":memory:";

export function resolveDatabasePath(databaseUrl?: string) {
  const url =
    databaseUrl ??
    process.env.DATABASE_URL ??
    `file:${path.join(findRepoRoot(), "data", "teamflow.db")}`;
  const filePath = url.replace(/^file:/, "");
  if (filePath === MEMORY_DB) return MEMORY_DB;
  return path.isAbsolute(filePath) ? filePath : path.resolve(findRepoRoot(), filePath);
}

function findInitSql() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, "init.sql"), path.join(here, "..", "src", "init.sql")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("init.sql not found next to the db package");
}

function hasBaseSchema(sqlite: Database.Database) {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  return Boolean(row);
}

export function createDb(databaseUrl?: string) {
  const filePath = resolveDatabasePath(databaseUrl);
  if (filePath !== MEMORY_DB) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  if (!hasBaseSchema(sqlite)) {
    sqlite.exec(fs.readFileSync(findInitSql(), "utf8"));
  }
  applySchemaPatches(sqlite);
  return drizzle(sqlite, { schema });
}

export { schema };
