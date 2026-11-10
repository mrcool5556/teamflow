/**
 * `node apps/server/dist/db-maintenance.js`: the data upkeep `pnpm db:maintenance` runs (purge
 * trash older than 7 days, re-grant Owner permissions, promote an Admin in teams without an
 * Owner, renumber duplicate issue numbers and add the unique index), for prebuilt releases,
 * which have no pnpm. Safe while the server runs (SQLite locking).
 */
import "./loadEnv.js";
import { createDb, resolveDatabasePath, runDataMaintenance } from "@teamflow/db";

const file = resolveDatabasePath(process.env.DATABASE_URL);
const db = createDb(process.env.DATABASE_URL);
try {
  const report = runDataMaintenance(db.$client);
  console.log(`Data maintenance on ${file}:`);
  console.log(`  purged trashed issues:       ${report.purgedIssues}`);
  console.log(`  Owner roles re-granted:      ${report.ownerGrants}`);
  console.log(`  Admins promoted to Owner:    ${report.promotedAdmins}`);
  console.log(`  duplicate issues renumbered: ${report.renumberedIssues}`);
  console.log(`  UNIQUE(team_id, number):     ${report.issueNumberIndex ? "present" : "missing"}`);
} finally {
  db.$client.close();
}
