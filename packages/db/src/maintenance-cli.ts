import Database from "better-sqlite3";
import { resolveDatabasePath } from "./index.js";
import { runDataMaintenance } from "./maintenance.js";
import { applySchemaPatches } from "./patches.js";

/**
 * `pnpm db:maintenance`: purge trash older than 7 days, re-grant Owner permissions, promote an
 * Admin in teams without an Owner, renumber duplicate issue numbers and add the unique index.
 */
function main() {
  const filePath = resolveDatabasePath();
  const sqlite = new Database(filePath);
  sqlite.pragma("foreign_keys = ON");
  try {
    applySchemaPatches(sqlite);
    const report = runDataMaintenance(sqlite);
    console.log(`Data maintenance on ${filePath}:`);
    console.log(`  purged trashed issues:      ${report.purgedIssues}`);
    console.log(`  Owner roles re-granted:     ${report.ownerGrants}`);
    console.log(`  Admins promoted to Owner:   ${report.promotedAdmins}`);
    console.log(`  duplicate issues renumbered: ${report.renumberedIssues}`);
    console.log(`  UNIQUE(team_id, number):    ${report.issueNumberIndex ? "present" : "missing"}`);
  } finally {
    sqlite.close();
  }
}

main();
