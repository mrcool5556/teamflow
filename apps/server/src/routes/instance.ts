import { Hono } from "hono";
import { z } from "zod";
import {
  createSpaceSchema,
  normalisePublicUrl,
  sendTestMailSchema,
  updateMailSettingsSchema,
  updateInstanceUserSchema,
  updateSetupProgressSchema,
  updateSignupSettingsSchema,
  updateSiteSettingsSchema,
  updateSpaceSchema,
  updateSpaceSettingsSchema,
  type SiteSettingsAdminPublic,
} from "@teamflow/core";
import type { Context } from "hono";
import { schema } from "@teamflow/db";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { badRequest } from "../lib/errors.js";
import { sendTestEmail } from "../lib/mail.js";
import { getSetupChecklist, updateSetupProgress } from "../lib/setupChecklist.js";
import {
  clearMailSettings,
  getMailSettings,
  getSignupSettings,
  getSiteSettings,
  updateMailSettings,
  updateSignupSettings,
  updateSiteSettings,
} from "../lib/siteSettings.js";
import type { AppEnv } from "../types.js";
import { db } from "../db.js";
import { parseBody, parseQuery } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { requireAuth, requireInstanceAdmin, requireWrite } from "../middleware/auth.js";
import {
  cancelSpaceUploads,
  checkPublicUrl,
  createSpace,
  emptySpaceTrash,
  getInstanceOverview,
  getSpaceDetail,
  listInstanceUsers,
  listSpaces,
  setInstanceAdmin,
  updateSpace,
} from "../lib/instanceAdmin.js";
import { issuePasswordResetForAdmin } from "../lib/passwordReset.js";
import { getSpaceSettings, updateSpaceSettings } from "../lib/spaceSettings.js";

/** Instance admin page (web /admin): server status, spaces, caps and space settings. */
const routes = new Hono<AppEnv>();

const listInstanceUsersQuerySchema = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

routes.get("/instance/overview", requireAuth, requireInstanceAdmin, async (c) => {
  return c.json({ overview: await getInstanceOverview(db) });
});

const publicUrlCheckQuerySchema = z.object({ url: z.string().max(500).optional() });

/**
 * Fetch <address>/health from the server (proxy, DNS, TLS); up to 5 seconds. `?url=` checks an
 * address before it is saved (setup step 2); otherwise the address in force.
 */
routes.get("/instance/checks/public-url", requireAuth, requireInstanceAdmin, async (c) => {
  const query = parseQuery(c, publicUrlCheckQuerySchema);
  let url: string | undefined;
  if (query.url !== undefined) {
    url = normalisePublicUrl(query.url) ?? undefined;
    if (!url) throw badRequest("Enter a full address starting with http:// or https://");
  }
  return c.json({ check: await checkPublicUrl(fetch, url) });
});

/** The address this request arrived on; X-Forwarded-Proto/Host only behind a trusted proxy. */
function requestOrigin(c: Context): string | null {
  const url = new URL(c.req.url);
  let proto = url.protocol.replace(":", "");
  let host = c.req.header("host") ?? url.host;
  if (config.trustProxy) {
    proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() || proto;
    host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || host;
  }
  return normalisePublicUrl(`${proto}://${host}`);
}

/* ---------- site name, address, email, sign-up (.env wins; see lib/siteSettings.ts) ---------- */

routes.get("/instance/site", requireAuth, requireInstanceAdmin, async (c) => {
  const site: SiteSettingsAdminPublic = {
    ...getSiteSettings(),
    suggestedPublicUrl: requestOrigin(c),
  };
  return c.json({ site });
});

routes.patch("/instance/site", requireAuth, requireWrite, requireInstanceAdmin, async (c) => {
  const body = await parseBody(c, updateSiteSettingsSchema);
  updateSiteSettings(body);
  const site: SiteSettingsAdminPublic = {
    ...getSiteSettings(),
    suggestedPublicUrl: requestOrigin(c),
  };
  return c.json({ site });
});

routes.get("/instance/mail", requireAuth, requireInstanceAdmin, async (c) =>
  c.json({ mail: getMailSettings() }),
);

routes.put("/instance/mail", requireAuth, requireWrite, requireInstanceAdmin, async (c) => {
  const body = await parseBody(c, updateMailSettingsSchema);
  return c.json({ mail: updateMailSettings(body) });
});

routes.delete("/instance/mail", requireAuth, requireWrite, requireInstanceAdmin, async (c) =>
  c.json({ mail: clearMailSettings() }),
);

/** Send a test email (to the admin by default). Reports the SMTP server's answer, never throws 500. */
routes.post("/instance/mail/test", requireAuth, requireWrite, requireInstanceAdmin, async (c) => {
  const body = await parseBody(c, sendTestMailSchema);
  const [me] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, c.var.auth.userId))
    .limit(1);
  const to = body.to ?? me?.email;
  if (!to) throw badRequest("No address to send to");
  try {
    await sendTestEmail(to);
    return c.json({ result: { ok: true, to, error: null } });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ result: { ok: false, to, error } });
  }
});

routes.get("/instance/signup", requireAuth, requireInstanceAdmin, async (c) =>
  c.json({ signup: getSignupSettings() }),
);

routes.patch("/instance/signup", requireAuth, requireWrite, requireInstanceAdmin, async (c) => {
  const body = await parseBody(c, updateSignupSettingsSchema);
  return c.json({ signup: updateSignupSettings(body) });
});

/* ---------- setup checklist ---------- */

routes.get("/instance/setup-checklist", requireAuth, requireInstanceAdmin, async (c) =>
  c.json({ checklist: await getSetupChecklist(db, c.var.auth.userId) }),
);

routes.patch(
  "/instance/setup-checklist",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    const body = await parseBody(c, updateSetupProgressSchema);
    updateSetupProgress(body);
    return c.json({ checklist: await getSetupChecklist(db, c.var.auth.userId) });
  },
);

routes.get("/instance/settings", requireAuth, requireInstanceAdmin, async (c) =>
  c.json({ settings: getSpaceSettings(db) }),
);

routes.patch("/instance/settings", requireAuth, requireWrite, requireInstanceAdmin, async (c) => {
  const body = await parseBody(c, updateSpaceSettingsSchema);
  return c.json({ settings: updateSpaceSettings(db, body) });
});

/** Users for the owner picker, with how many free spaces each holds. */
routes.get("/instance/users", requireAuth, requireInstanceAdmin, async (c) => {
  const query = parseQuery(c, listInstanceUsersQuerySchema);
  return c.json({ users: listInstanceUsers(db, query.q, query.limit) });
});

/** People panel: make someone a server admin, or stop them being one (never the last). */
routes.patch(
  "/instance/users/:userId",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    const body = await parseBody(c, updateInstanceUserSchema);
    return c.json({ user: setInstanceAdmin(db, c.req.param("userId"), body.isInstanceAdmin) });
  },
);

/** People panel: a one-hour password reset link, emailed when email is set up and always shown. */
routes.post(
  "/instance/users/:userId/reset-link",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    return c.json({ reset: await issuePasswordResetForAdmin(db, c.req.param("userId")) });
  },
);

routes.get("/instance/spaces", requireAuth, requireInstanceAdmin, async (c) =>
  c.json({ spaces: listSpaces(db) }),
);

routes.post("/instance/spaces", requireAuth, requireWrite, requireInstanceAdmin, async (c) => {
  const body = await parseBody(c, createSpaceSchema);
  return c.json({ space: createSpace(db, c.var.auth.userId, body) }, 201);
});

routes.get(
  "/instance/spaces/:teamId",
  requireAuth,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    return c.json({ space: getSpaceDetail(db, c.req.param("teamId")) });
  },
);

/** Change type or cap; lowering a cap deletes nothing, it only blocks new uploads. */
routes.patch(
  "/instance/spaces/:teamId",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    const body = await parseBody(c, updateSpaceSchema);
    return c.json({ space: updateSpace(db, c.var.auth.userId, c.req.param("teamId"), body) });
  },
);

routes.post(
  "/instance/spaces/:teamId/empty-trash",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    const teamId = c.req.param("teamId");
    const result = await emptySpaceTrash(db, c.var.auth.userId, teamId);
    return c.json({ ...result, space: getSpaceDetail(db, teamId) });
  },
);

routes.post(
  "/instance/spaces/:teamId/cancel-uploads",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  validateParams,
  async (c) => {
    const teamId = c.req.param("teamId");
    const result = await cancelSpaceUploads(db, c.var.auth.userId, teamId);
    return c.json({ ...result, space: getSpaceDetail(db, teamId) });
  },
);

export { routes as instanceRoutes };
