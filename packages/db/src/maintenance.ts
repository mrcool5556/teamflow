import type Database from "better-sqlite3";

/**
 * Data upkeep that used to run on every boot inside the schema patches. It changes user data,
 * so it now runs only when asked: `pnpm db:maintenance`, or nightly in the server when
 * TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true. Everything runs in one transaction.
 */

export const DELETED_ISSUE_RETENTION_DAYS = 7;

export type DataMaintenanceReport = {
  /** Issues in the trash longer than DELETED_ISSUE_RETENTION_DAYS, deleted for good. */
  purgedIssues: number;
  /** Owner roles that were missing team.data.transfer. */
  ownerGrants: number;
  /** Teams without any Owner whose earliest Admin became Owner. */
  promotedAdmins: number;
  /** Issues moved to a fresh number because another issue in the team had the same one. */
  renumberedIssues: number;
  /** Whether UNIQUE(team_id, number) exists after the run. */
  issueNumberIndex: boolean;
};

function purgeExpiredDeletedIssues(sqlite: Database.Database, now: number) {
  const cutoff = new Date(now - DELETED_ISSUE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return sqlite
    .prepare("DELETE FROM issues WHERE deleted_at IS NOT NULL AND deleted_at < ?")
    .run(cutoff).changes;
}

function grantOwnerDataTransfer(sqlite: Database.Database) {
  const ownerRoles = sqlite
    .prepare("SELECT id, permissions FROM team_roles WHERE slug = 'owner'")
    .all() as { id: string; permissions: string }[];
  const update = sqlite.prepare(
    "UPDATE team_roles SET permissions = ?, updated_at = datetime('now') WHERE id = ?",
  );
  let granted = 0;
  for (const role of ownerRoles) {
    let permissions: string[] = [];
    try {
      permissions = JSON.parse(role.permissions) as string[];
    } catch {
      permissions = [];
    }
    if (!permissions.includes("team.data.transfer")) {
      permissions.push("team.data.transfer");
      update.run(JSON.stringify(permissions), role.id);
      granted += 1;
    }
  }
  return granted;
}

function promoteFirstAdminWhereNoOwner(sqlite: Database.Database) {
  const teams = sqlite
    .prepare(
      `SELECT t.id AS team_id, owner_role.id AS owner_role_id
       FROM teams t
       INNER JOIN team_roles owner_role
         ON owner_role.team_id = t.id AND owner_role.slug = 'owner'
       WHERE NOT EXISTS (
         SELECT 1
         FROM team_members tm
         INNER JOIN team_roles tr ON tr.id = tm.role_id
         WHERE tm.team_id = t.id AND tr.slug = 'owner'
       )`,
    )
    .all() as { team_id: string; owner_role_id: string }[];

  const firstAdmin = sqlite.prepare(
    `SELECT tm.id
     FROM team_members tm
     INNER JOIN team_roles tr ON tr.id = tm.role_id
     WHERE tm.team_id = ? AND tr.slug = 'admin'
     ORDER BY tm.created_at ASC
     LIMIT 1`,
  );
  const promote = sqlite.prepare(
    "UPDATE team_members SET role_id = ?, role = 'owner' WHERE id = ?",
  );

  let promoted = 0;
  for (const team of teams) {
    const admin = firstAdmin.get(team.team_id) as { id: string } | undefined;
    if (!admin) continue;
    promoted += promote.run(team.owner_role_id, admin.id).changes;
  }
  return promoted;
}

/** Give every duplicate (team, number) but the oldest a new number from the team counter. */
function renumberDuplicateIssues(sqlite: Database.Database) {
  const duplicates = sqlite
    .prepare(
      `SELECT i.id, i.team_id
       FROM issues i
       WHERE EXISTS (
         SELECT 1 FROM issues older
         WHERE older.team_id = i.team_id AND older.number = i.number AND older.rowid < i.rowid
       )
       ORDER BY i.rowid`,
    )
    .all() as { id: string; team_id: string }[];

  const bump = sqlite.prepare(
    "UPDATE teams SET issue_counter = issue_counter + 1 WHERE id = ? RETURNING issue_counter",
  );
  const setNumber = sqlite.prepare("UPDATE issues SET number = ? WHERE id = ?");
  for (const issue of duplicates) {
    const { issue_counter } = bump.get(issue.team_id) as { issue_counter: number };
    setNumber.run(issue_counter, issue.id);
  }
  return duplicates.length;
}

export function runDataMaintenance(
  sqlite: Database.Database,
  now = Date.now(),
): DataMaintenanceReport {
  return sqlite.transaction(() => {
    const report: DataMaintenanceReport = {
      purgedIssues: purgeExpiredDeletedIssues(sqlite, now),
      ownerGrants: grantOwnerDataTransfer(sqlite),
      promotedAdmins: promoteFirstAdminWhereNoOwner(sqlite),
      renumberedIssues: renumberDuplicateIssues(sqlite),
      issueNumberIndex: false,
    };
    sqlite.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS issues_team_number_unique ON issues(team_id, number)",
    );
    report.issueNumberIndex = true;
    return report;
  })();
}
