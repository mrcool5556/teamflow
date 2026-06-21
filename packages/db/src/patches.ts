import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const DEFAULT_STATUSES = [
  { name: "Backlog", type: "backlog", position: 0 },
  { name: "Todo", type: "todo", position: 1 },
  { name: "In Progress", type: "in_progress", position: 2 },
  { name: "Done", type: "done", position: 3 },
  { name: "Canceled", type: "canceled", position: 4 },
] as const;

export function applySchemaPatches(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS board_rows (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const issueCols = sqlite
    .prepare("PRAGMA table_info(issues)")
    .all() as { name: string }[];

  if (!issueCols.some((col) => col.name === "row_id")) {
    sqlite.exec(
      `ALTER TABLE issues ADD COLUMN row_id TEXT REFERENCES board_rows(id) ON DELETE SET NULL`,
    );
    console.log("Added issues.row_id column");
  }

  if (!issueCols.some((col) => col.name === "board_sort")) {
    sqlite.exec(`ALTER TABLE issues ADD COLUMN board_sort INTEGER NOT NULL DEFAULT 0`);
    console.log("Added issues.board_sort column");
  }

  if (!issueCols.some((col) => col.name === "timer_active_at")) {
    sqlite.exec(`ALTER TABLE issues ADD COLUMN timer_active_at TEXT`);
    sqlite.exec(
      `ALTER TABLE issues ADD COLUMN timer_elapsed_sec INTEGER NOT NULL DEFAULT 0`,
    );
    sqlite.exec(`ALTER TABLE issues ADD COLUMN timer_target_sec INTEGER`);
    console.log("Added issues timer columns");
  }

  const rowCols = sqlite
    .prepare("PRAGMA table_info(board_rows)")
    .all() as { name: string }[];

  if (!rowCols.some((col) => col.name === "assignee_id")) {
    sqlite.exec(
      `ALTER TABLE board_rows ADD COLUMN assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL`,
    );
    sqlite.exec(`ALTER TABLE board_rows ADD COLUMN color TEXT`);
    console.log("Added board_rows assignee_id and color columns");
  }

  const teams = sqlite.prepare("SELECT id FROM teams").all() as { id: string }[];

  for (const team of teams) {
    const existing = sqlite
      .prepare("SELECT id FROM board_rows WHERE team_id = ? ORDER BY position LIMIT 1")
      .get(team.id) as { id: string } | undefined;

    let rowId = existing?.id;
    if (!rowId) {
      rowId = randomUUID();
      sqlite
        .prepare(
          "INSERT INTO board_rows (id, team_id, name, position) VALUES (?, ?, ?, ?)",
        )
        .run(rowId, team.id, "Row 1", 0);
      console.log(`Created default board row for team ${team.id}`);
    }

    sqlite
      .prepare("UPDATE issues SET row_id = ? WHERE team_id = ? AND row_id IS NULL")
      .run(rowId, team.id);
  }

  migrateStatusesToRows(sqlite);
  migrateEntityKeys(sqlite);
  ensureExtendedTables(sqlite);
  ensureColorColumns(sqlite);
  ensureTeamInvitesTable(sqlite);
  purgeExpiredDeletedIssues(sqlite);
}

function ensureTeamInvitesTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS team_invites (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member',
      created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS team_invites_token_unique ON team_invites(token)`,
  );

  const cols = sqlite
    .prepare("PRAGMA table_info(team_invites)")
    .all() as { name: string }[];
  if (!cols.some((col) => col.name === "max_uses")) {
    sqlite.exec(`ALTER TABLE team_invites ADD COLUMN max_uses INTEGER`);
    console.log("Added team_invites.max_uses column");
  }
  if (!cols.some((col) => col.name === "use_count")) {
    sqlite.exec(
      `ALTER TABLE team_invites ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0`,
    );
    console.log("Added team_invites.use_count column");
  }
}

function ensureColorColumns(sqlite: Database.Database) {
  const statusCols = sqlite
    .prepare("PRAGMA table_info(issue_statuses)")
    .all() as { name: string }[];
  if (!statusCols.some((col) => col.name === "color")) {
    sqlite.exec(`ALTER TABLE issue_statuses ADD COLUMN color TEXT`);
    console.log("Added issue_statuses.color column");
  }

  const issueCols = sqlite
    .prepare("PRAGMA table_info(issues)")
    .all() as { name: string }[];
  if (!issueCols.some((col) => col.name === "color")) {
    sqlite.exec(`ALTER TABLE issues ADD COLUMN color TEXT`);
    console.log("Added issues.color column");
  }
}

const DELETED_ISSUE_RETENTION_DAYS = 7;

function purgeExpiredDeletedIssues(sqlite: Database.Database) {
  const issueCols = sqlite
    .prepare("PRAGMA table_info(issues)")
    .all() as { name: string }[];
  if (!issueCols.some((col) => col.name === "deleted_at")) return;

  const cutoff = new Date(
    Date.now() - DELETED_ISSUE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const expired = sqlite
    .prepare("SELECT id FROM issues WHERE deleted_at IS NOT NULL AND deleted_at < ?")
    .all(cutoff) as { id: string }[];

  if (expired.length === 0) return;

  const deleteIssue = sqlite.prepare("DELETE FROM issues WHERE id = ?");
  for (const issue of expired) {
    deleteIssue.run(issue.id);
  }
  console.log(`Purged ${expired.length} expired deleted issue(s)`);
}

function ensureExtendedTables(sqlite: Database.Database) {
  const issueCols = sqlite
    .prepare("PRAGMA table_info(issues)")
    .all() as { name: string }[];

  if (!issueCols.some((col) => col.name === "deleted_at")) {
    sqlite.exec(`ALTER TABLE issues ADD COLUMN deleted_at TEXT`);
    console.log("Added issues.deleted_at column");
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      profile TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS issue_assignees (
      issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(issue_id, user_id)
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS board_row_assignees (
      row_id TEXT NOT NULL REFERENCES board_rows(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(row_id, user_id)
    );
  `);

  const issueAssigneeCount = sqlite
    .prepare("SELECT COUNT(*) as count FROM issue_assignees")
    .get() as { count: number };
  if (issueAssigneeCount.count === 0) {
    const issuesWithAssignee = sqlite
      .prepare("SELECT id, assignee_id FROM issues WHERE assignee_id IS NOT NULL")
      .all() as { id: string; assignee_id: string }[];
    const insertIssueAssignee = sqlite.prepare(
      "INSERT OR IGNORE INTO issue_assignees (issue_id, user_id) VALUES (?, ?)",
    );
    for (const issue of issuesWithAssignee) {
      insertIssueAssignee.run(issue.id, issue.assignee_id);
    }
    if (issuesWithAssignee.length > 0) {
      console.log(`Migrated ${issuesWithAssignee.length} issue assignees`);
    }
  }

  const rowAssigneeCount = sqlite
    .prepare("SELECT COUNT(*) as count FROM board_row_assignees")
    .get() as { count: number };
  if (rowAssigneeCount.count === 0) {
    const rowsWithAssignee = sqlite
      .prepare("SELECT id, assignee_id FROM board_rows WHERE assignee_id IS NOT NULL")
      .all() as { id: string; assignee_id: string }[];
    const insertRowAssignee = sqlite.prepare(
      "INSERT OR IGNORE INTO board_row_assignees (row_id, user_id) VALUES (?, ?)",
    );
    for (const row of rowsWithAssignee) {
      insertRowAssignee.run(row.id, row.assignee_id);
    }
    if (rowsWithAssignee.length > 0) {
      console.log(`Migrated ${rowsWithAssignee.length} row assignees`);
    }
  }
}

const KEY_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateEntityKeyNode(prefix: "row" | "col") {
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]!;
  }
  return `${prefix}_${suffix}`;
}

function migrateEntityKeys(sqlite: Database.Database) {
  const rowCols = sqlite
    .prepare("PRAGMA table_info(board_rows)")
    .all() as { name: string }[];

  if (!rowCols.some((col) => col.name === "key")) {
    sqlite.exec(`ALTER TABLE board_rows ADD COLUMN key TEXT`);
    console.log("Added board_rows.key column");
  }

  const statusCols = sqlite
    .prepare("PRAGMA table_info(issue_statuses)")
    .all() as { name: string }[];

  if (!statusCols.some((col) => col.name === "key")) {
    sqlite.exec(`ALTER TABLE issue_statuses ADD COLUMN key TEXT`);
    console.log("Added issue_statuses.key column");
  }

  const rowKeysByTeam = new Map<string, Set<string>>();
  const existingRowKeys = sqlite
    .prepare("SELECT team_id, key FROM board_rows WHERE key IS NOT NULL AND key != ''")
    .all() as { team_id: string; key: string }[];

  for (const row of existingRowKeys) {
    const keys = rowKeysByTeam.get(row.team_id) ?? new Set<string>();
    keys.add(row.key);
    rowKeysByTeam.set(row.team_id, keys);
  }

  const rowsMissingKey = sqlite
    .prepare("SELECT id, team_id FROM board_rows WHERE key IS NULL OR key = ''")
    .all() as { id: string; team_id: string }[];

  for (const row of rowsMissingKey) {
    const keys = rowKeysByTeam.get(row.team_id) ?? new Set<string>();
    let key = generateEntityKeyNode("row");
    while (keys.has(key)) key = generateEntityKeyNode("row");
    keys.add(key);
    rowKeysByTeam.set(row.team_id, keys);
    sqlite.prepare("UPDATE board_rows SET key = ? WHERE id = ?").run(key, row.id);
  }

  if (rowsMissingKey.length > 0) {
    console.log(`Backfilled keys for ${rowsMissingKey.length} board row(s)`);
  }

  const colKeysByTeam = new Map<string, Set<string>>();
  const existingColKeys = sqlite
    .prepare("SELECT team_id, key FROM issue_statuses WHERE key IS NOT NULL AND key != ''")
    .all() as { team_id: string; key: string }[];

  for (const status of existingColKeys) {
    const keys = colKeysByTeam.get(status.team_id) ?? new Set<string>();
    keys.add(status.key);
    colKeysByTeam.set(status.team_id, keys);
  }

  const statusesMissingKey = sqlite
    .prepare("SELECT id, team_id FROM issue_statuses WHERE key IS NULL OR key = ''")
    .all() as { id: string; team_id: string }[];

  for (const status of statusesMissingKey) {
    const keys = colKeysByTeam.get(status.team_id) ?? new Set<string>();
    let key = generateEntityKeyNode("col");
    while (keys.has(key)) key = generateEntityKeyNode("col");
    keys.add(key);
    colKeysByTeam.set(status.team_id, keys);
    sqlite.prepare("UPDATE issue_statuses SET key = ? WHERE id = ?").run(key, status.id);
  }

  if (statusesMissingKey.length > 0) {
    console.log(`Backfilled keys for ${statusesMissingKey.length} column(s)`);
  }

  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS board_rows_team_key_unique ON board_rows(team_id, key)`,
  );
  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS issue_statuses_team_key_unique ON issue_statuses(team_id, key)`,
  );
}

function migrateStatusesToRows(sqlite: Database.Database) {
  const statusCols = sqlite
    .prepare("PRAGMA table_info(issue_statuses)")
    .all() as { name: string }[];

  if (!statusCols.some((col) => col.name === "row_id")) {
    sqlite.exec(
      `ALTER TABLE issue_statuses ADD COLUMN row_id TEXT REFERENCES board_rows(id) ON DELETE CASCADE`,
    );
    console.log("Added issue_statuses.row_id column");
  }

  const legacyStatuses = sqlite
    .prepare("SELECT * FROM issue_statuses WHERE row_id IS NULL")
    .all() as {
    id: string;
    team_id: string;
    name: string;
    type: string;
    position: number;
  }[];

  if (legacyStatuses.length === 0) return;

  const teams = [...new Set(legacyStatuses.map((status) => status.team_id))];

  for (const teamId of teams) {
    const teamStatuses = legacyStatuses
      .filter((status) => status.team_id === teamId)
      .sort((a, b) => a.position - b.position);

    const rows = sqlite
      .prepare(
        "SELECT id FROM board_rows WHERE team_id = ? ORDER BY position",
      )
      .all(teamId) as { id: string }[];

    for (const row of rows) {
      const existingCount = sqlite
        .prepare("SELECT COUNT(*) as count FROM issue_statuses WHERE row_id = ?")
        .get(row.id) as { count: number };

      if (existingCount.count > 0) continue;

      const idMap = new Map<string, string>();
      for (const status of teamStatuses) {
        const newId = randomUUID();
        idMap.set(status.id, newId);
        sqlite
          .prepare(
            "INSERT INTO issue_statuses (id, team_id, row_id, name, type, position) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(newId, teamId, row.id, status.name, status.type, status.position);
      }

      for (const [oldId, newId] of idMap) {
        sqlite
          .prepare(
            "UPDATE issues SET status_id = ? WHERE row_id = ? AND status_id = ?",
          )
          .run(newId, row.id, oldId);
      }
    }

    sqlite
      .prepare("DELETE FROM issue_statuses WHERE team_id = ? AND row_id IS NULL")
      .run(teamId);
    console.log(`Migrated team ${teamId} statuses to per-row columns`);
  }

  const rowsMissingStatuses = sqlite
    .prepare(
      `SELECT br.id, br.team_id
       FROM board_rows br
       LEFT JOIN issue_statuses s ON s.row_id = br.id
       GROUP BY br.id
       HAVING COUNT(s.id) = 0`,
    )
    .all() as { id: string; team_id: string }[];

  for (const row of rowsMissingStatuses) {
    for (const status of DEFAULT_STATUSES) {
      sqlite
        .prepare(
          "INSERT INTO issue_statuses (id, team_id, row_id, name, type, position) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          randomUUID(),
          row.team_id,
          row.id,
          status.name,
          status.type,
          status.position,
        );
    }
    console.log(`Seeded default columns for row ${row.id}`);
  }
}
