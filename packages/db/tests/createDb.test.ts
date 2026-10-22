import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, resolveDatabasePath } from "../src/index.js";

describe("createDb", () => {
  it("treats :memory: as an in-memory database", () => {
    expect(resolveDatabasePath(":memory:")).toBe(":memory:");
    expect(resolveDatabasePath("file::memory:")).toBe(":memory:");
  });

  it("bootstraps the schema and patches on an empty in-memory database without seeding", () => {
    const db = createDb(":memory:");
    const tables = db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .map((row) => row.name);
    // init.sql tables
    expect(tables).toEqual(expect.arrayContaining(["users", "teams", "issues"]));
    // tables created only by applySchemaPatches
    expect(tables).toEqual(expect.arrayContaining(["board_rows", "team_roles", "stored_files"]));

    const [users] = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM users`);
    const [teams] = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM teams`);
    expect(users.n).toBe(0);
    expect(teams.n).toBe(0);
  });
});
