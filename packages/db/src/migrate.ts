import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { resolveDatabasePath } from "./index.js";
import { applySchemaPatches } from "./patches.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runMigrations() {
  const filePath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("foreign_keys = ON");

  const migrationsDir = path.join(__dirname, "..", "drizzle");
  if (!fs.existsSync(migrationsDir)) {
    const initSql = fs.readFileSync(
      path.join(__dirname, "init.sql"),
      "utf8",
    );
    sqlite.exec(initSql);
    console.log("Applied init.sql");
    applySchemaPatches(sqlite);
    sqlite.close();
    return;
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const hash = file;
    const existing = sqlite
      .prepare("SELECT hash FROM __drizzle_migrations WHERE hash = ?")
      .get(hash);
    if (existing) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO __drizzle_migrations (hash) VALUES (?)").run(hash);
    console.log(`Applied migration: ${file}`);
  }

  applySchemaPatches(sqlite);
  sqlite.close();
  console.log("Migrations complete.");
}

runMigrations();
