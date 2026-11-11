/**
 * `node apps/server/dist/backup-db.js <destination.db>`: copy the database with SQLite's online
 * backup, which is consistent while the server is running (a plain `cp` of a WAL database is
 * not). Used by deploy/proxmox-lxc/backup.sh and the Windows backup. Prints the destination.
 */
import "./loadEnv.js";
import path from "node:path";
import { backupDatabase } from "@teamflow/db";

const destination = process.argv[2];
if (!destination) {
  console.error("Usage: node backup-db.js <destination.db>");
  process.exit(2);
}

try {
  await backupDatabase(destination, process.env.DATABASE_URL);
  console.log(path.resolve(destination));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
