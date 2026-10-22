import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { runMaintenanceBackupSchema, runMaintenanceUpdateSchema } from "@teamflow/core";
import { requireAuth, requireInstanceAdmin, requireWrite } from "../middleware/auth.js";
import { loadTeam, requirePermission } from "../middleware/team.js";
import {
  dismissMaintenanceJob,
  getMaintenanceJob,
  getMaintenanceStatus,
  runMaintenanceBackup,
  runMaintenanceUpdate,
} from "../lib/maintenance.js";

/** Server maintenance: status, backups, updates (instance admin only). */
const routes = new Hono<AppEnv>();

routes.get(
  "/teams/:teamId/server/maintenance",
  requireAuth,
  validateParams,
  loadTeam(),
  requirePermission("server.maintenance.view"),
  requireInstanceAdmin,
  async (c) => {
    const status = await getMaintenanceStatus();
    return c.json({ status });
  },
);

routes.get(
  "/teams/:teamId/server/maintenance/job",
  requireAuth,
  validateParams,
  loadTeam(),
  requirePermission("server.maintenance.view"),
  requireInstanceAdmin,
  async (c) => {
    const job = await getMaintenanceJob();
    return c.json({ job });
  },
);

routes.post(
  "/teams/:teamId/server/maintenance/backup",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("server.maintenance.run"),
  requireInstanceAdmin,
  async (c) => {
    const body = await parseBody(c, runMaintenanceBackupSchema);

    const job = await runMaintenanceBackup(body);
    return c.json({ job }, 202);
  },
);

routes.post(
  "/teams/:teamId/server/maintenance/update",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("server.maintenance.run"),
  requireInstanceAdmin,
  async (c) => {
    const body = await parseBody(c, runMaintenanceUpdateSchema);

    const job = await runMaintenanceUpdate(body);
    return c.json({ job }, 202);
  },
);

routes.post(
  "/teams/:teamId/server/maintenance/job/dismiss",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("server.maintenance.run"),
  requireInstanceAdmin,
  async (c) => {
    const job = await dismissMaintenanceJob();
    return c.json({ job });
  },
);

export { routes as maintenanceRoutes };
