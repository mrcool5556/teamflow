import type Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, createDb, getSchemaVersion, runDataMaintenance } from "../src/index.js";
import { applySchemaPatches } from "../src/patches.js";

const DAY = 24 * 60 * 60 * 1000;

/** One user, one team with Owner/Admin roles, a row, a column. Returns ids. */
function seedTeam(sqlite: Database.Database) {
  sqlite.exec(`
    INSERT INTO users (id, email, name, password_hash) VALUES
      ('u1', 'a@example.test', 'A', 'x'), ('u2', 'b@example.test', 'B', 'x');
    INSERT INTO workspaces (id, name, slug) VALUES ('w1', 'W', 'w1');
    INSERT INTO teams (id, workspace_id, name, key, issue_counter) VALUES ('t1', 'w1', 'T', 'T', 3);
    INSERT INTO team_roles (id, team_id, name, slug, permissions, is_system, position)
      VALUES ('r-owner', 't1', 'Owner', 'owner', '["team.members.view"]', 1, 0),
             ('r-admin', 't1', 'Admin', 'admin', '[]', 1, 1);
    INSERT INTO team_members (id, team_id, user_id, role_id, role, created_at)
      VALUES ('m1', 't1', 'u1', 'r-admin', 'admin', '2020-01-01'),
             ('m2', 't1', 'u2', 'r-admin', 'admin', '2021-01-01');
    INSERT INTO board_rows (id, team_id, key, name, position) VALUES ('row1', 't1', 'row_a', 'R', 0);
    INSERT INTO issue_statuses (id, team_id, row_id, key, name, type, position)
      VALUES ('s1', 't1', 'row1', 'col_a', 'Todo', 'todo', 0);
  `);
}

function insertIssue(sqlite: Database.Database, id: string, number: number, deletedAt?: string) {
  sqlite
    .prepare(
      `INSERT INTO issues (id, team_id, row_id, number, title, status_id, creator_id, deleted_at)
       VALUES (?, 't1', 'row1', ?, ?, 's1', 'u1', ?)`,
    )
    .run(id, number, id, deletedAt ?? null);
}

describe("schema versioning", () => {
  it("records the schema version and skips the patch run once current", () => {
    const sqlite = createDb(":memory:").$client;
    expect(getSchemaVersion(sqlite)).toBe(SCHEMA_VERSION);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      applySchemaPatches(sqlite);
      expect(log).not.toHaveBeenCalled();

      // An older database re-runs the idempotent patches once and is stamped again.
      sqlite.prepare("UPDATE schema_version SET version = 1").run();
      applySchemaPatches(sqlite);
      expect(getSchemaVersion(sqlite)).toBe(SCHEMA_VERSION);
      expect(log).toHaveBeenCalledWith(expect.stringContaining(`version ${SCHEMA_VERSION}`));
    } finally {
      log.mockRestore();
    }
  });

  it("leaves a newer database untouched", () => {
    const sqlite = createDb(":memory:").$client;
    sqlite.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION + 1);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      applySchemaPatches(sqlite);
      expect(getSchemaVersion(sqlite)).toBe(SCHEMA_VERSION + 1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("newer than this build"));
    } finally {
      warn.mockRestore();
    }
  });

  it("no longer mutates data while patching", () => {
    const sqlite = createDb(":memory:").$client;
    seedTeam(sqlite);
    insertIssue(sqlite, "old-trash", 1, new Date(Date.now() - 30 * DAY).toISOString());
    sqlite.prepare("UPDATE schema_version SET version = 0").run();
    vi.spyOn(console, "log").mockImplementation(() => {});
    applySchemaPatches(sqlite);
    vi.restoreAllMocks();

    const count = sqlite.prepare("SELECT COUNT(*) AS n FROM issues").get() as { n: number };
    expect(count.n).toBe(1);
    const owner = sqlite
      .prepare("SELECT permissions FROM team_roles WHERE id = 'r-owner'")
      .get() as { permissions: string };
    expect(owner.permissions).not.toContain("team.data.transfer");
  });
});

describe("runDataMaintenance", () => {
  it("purges old trash, repairs Owner roles and promotes the earliest Admin", () => {
    const sqlite = createDb(":memory:").$client;
    seedTeam(sqlite);
    const now = Date.now();
    insertIssue(sqlite, "old-trash", 1, new Date(now - 30 * DAY).toISOString());
    insertIssue(sqlite, "new-trash", 2, new Date(now - DAY).toISOString());
    insertIssue(sqlite, "live", 3);

    const report = runDataMaintenance(sqlite, now);
    expect(report).toMatchObject({
      purgedIssues: 1,
      ownerGrants: 1,
      promotedAdmins: 1,
      renumberedIssues: 0,
      issueNumberIndex: true,
    });

    const ids = (sqlite.prepare("SELECT id FROM issues ORDER BY id").all() as { id: string }[]).map(
      (row) => row.id,
    );
    expect(ids).toEqual(["live", "new-trash"]);
    const promoted = sqlite.prepare("SELECT role FROM team_members WHERE id = 'm1'").get() as {
      role: string;
    };
    expect(promoted.role).toBe("owner");

    // A second run has nothing left to do.
    expect(runDataMaintenance(sqlite, now)).toMatchObject({
      purgedIssues: 0,
      ownerGrants: 0,
      promotedAdmins: 0,
    });
  });

  it("renumbers duplicate issue numbers and then enforces uniqueness", () => {
    const sqlite = createDb(":memory:").$client;
    seedTeam(sqlite);
    sqlite.exec("DROP INDEX IF EXISTS issues_team_number_unique");
    insertIssue(sqlite, "first", 2);
    insertIssue(sqlite, "second", 2);
    insertIssue(sqlite, "third", 2);

    const report = runDataMaintenance(sqlite);
    expect(report.renumberedIssues).toBe(2);
    const numbers = sqlite.prepare("SELECT id, number FROM issues ORDER BY rowid").all() as {
      id: string;
      number: number;
    }[];
    expect(numbers).toEqual([
      { id: "first", number: 2 },
      { id: "second", number: 4 },
      { id: "third", number: 5 },
    ]);
    expect(() => insertIssue(sqlite, "dup", 2)).toThrow(/UNIQUE/);
  });
});
