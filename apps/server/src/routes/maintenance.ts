import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import {
  maintenanceSettingsSchema,
  runMaintenanceBackupSchema,
  runMaintenanceRestoreSchema,
  runMaintenanceUpdateSchema,
} from "@teamflow/core";
import { requireAuth, requireInstanceAdmin, requireWrite } from "../middleware/auth.js";
import {
  checkMaintenanceHost,
  dismissMaintenanceJob,
  getMaintenanceJob,
  getMaintenanceStatus,
  runMaintenanceBackup,
  runMaintenanceRestore,
  runMaintenanceUpdate,
  setMaintenanceChannel,
} from "../lib/maintenance.js";

/**
 * Server maintenance: status, backups, updates. Server-wide, so the instance-admin flag alone
 * decides; which Flow is open (or none) and the role in it do not matter.
 */
const routes = new Hono<AppEnv>();

routes.get("/server/maintenance", requireAuth, requireInstanceAdmin, async (c) => {
  return c.json({ status: await getMaintenanceStatus() });
});

/** Run the sudo probe and origin comparison now, cache them for GET, return the fresh status. */
routes.post(
  "/server/maintenance/check",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    return c.json({ status: await checkMaintenanceHost() });
  },
);

routes.get("/server/maintenance/job", requireAuth, requireInstanceAdmin, async (c) => {
  return c.json({ job: await getMaintenanceJob() });
});

routes.post(
  "/server/maintenance/backup",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    const body = await parseBody(c, runMaintenanceBackupSchema);
    return c.json({ job: await runMaintenanceBackup(body) }, 202);
  },
);

routes.post(
  "/server/maintenance/update",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    const body = await parseBody(c, runMaintenanceUpdateSchema);
    return c.json({ job: await runMaintenanceUpdate(body) }, 202);
  },
);

routes.post(
  "/server/maintenance/job/dismiss",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    return c.json({ job: await dismissMaintenanceJob() });
  },
);

/** Advanced → Backups → Restore: put a database backup back (stops the app briefly). */
routes.post(
  "/server/maintenance/restore",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    const body = await parseBody(c, runMaintenanceRestoreSchema);
    return c.json({ job: await runMaintenanceRestore(body) }, 202);
  },
);

/** Advanced → Release channel (stable or pre-release). */
routes.put(
  "/server/maintenance/settings",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    const body = await parseBody(c, maintenanceSettingsSchema);
    return c.json({ status: await setMaintenanceChannel(body.channel) });
  },
);

/**
 * The old per-team paths for the two reads a page polls during an update, so a page loaded
 * before the update keeps following it while the server restarts. The team is ignored.
 */
routes.get(
  "/teams/:teamId/server/maintenance",
  requireAuth,
  validateParams,
  requireInstanceAdmin,
  async (c) => {
    return c.json({ status: await getMaintenanceStatus() });
  },
);

routes.get(
  "/teams/:teamId/server/maintenance/job",
  requireAuth,
  validateParams,
  requireInstanceAdmin,
  async (c) => {
    return c.json({ job: await getMaintenanceJob() });
  },
);

export { routes as maintenanceRoutes };
