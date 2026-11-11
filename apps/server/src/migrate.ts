/**
 * `node apps/server/dist/migrate.js`: bring the database schema up to date and exit. The server
 * does the same on start (createDb applies init.sql and the schema patches); the updater runs
 * this first so a failing migration is caught before the new release is switched in.
 * Needs no dev tools, so it works from a prebuilt release.
 */
import "./loadEnv.js";
import { createDb, resolveDatabasePath } from "@teamflow/db";

const file = resolveDatabasePath(process.env.DATABASE_URL);
const db = createDb(process.env.DATABASE_URL);
db.$client.close();
console.log(`Database up to date: ${file}`);
