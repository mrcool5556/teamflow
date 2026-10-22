import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { purgeExpiredDeletedFiles } from "./lib/attachments.js";
import { purgeExpiredUploadSessions } from "./lib/chunkedUpload.js";

// config.ts validated every env var (and refused a placeholder JWT_SECRET) when it was imported.
void purgeExpiredUploadSessions(db);
void purgeExpiredDeletedFiles(db);

export { app };

if (!process.env.VITEST) {
  const { port, host } = config;
  console.log(`Teamflow API listening on http://${host}:${port}`);
  serve({ fetch: app.fetch, port, hostname: host });
}
