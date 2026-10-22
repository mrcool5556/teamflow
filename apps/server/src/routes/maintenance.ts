import { Hono } from "hono";
import type { AppEnv } from "../types.js";
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
  loadTeam(),
  requirePermission("server.maintenance.run"),
  requireInstanceAdmin,
  async (c) => {
    const body = runMaintenanceBackupSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
    }

    const job = await runMaintenanceBackup(body.data);
    return c.json({ job }, 202);
  },
);

routes.post(
  "/teams/:teamId/server/maintenance/update",
  requireAuth,
  requireWrite,
  loadTeam(),
  requirePermission("server.maintenance.run"),
  requireInstanceAdmin,
  async (c) => {
    const body = runMaintenanceUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
    }

    const job = await runMaintenanceUpdate(body.data);
    return c.json({ job }, 202);
  },
);

routes.post(
  "/teams/:teamId/server/maintenance/job/dismiss",
  requireAuth,
  requireWrite,
  loadTeam(),
  requirePermission("server.maintenance.run"),
  requireInstanceAdmin,
  async (c) => {
    const job = await dismissMaintenanceJob();
    return c.json({ job });
  },
);

export { routes as maintenanceRoutes };
