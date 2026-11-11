import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { parseBody } from "../lib/validation.js";
import { validateParams } from "../middleware/params.js";
import { updateDiscordBotSecretsSchema, updateTeamDiscordSettingsSchema } from "@teamflow/core";
import { db } from "../db.js";
import { requireAuth, requireInstanceAdmin, requireWrite } from "../middleware/auth.js";
import { loadTeam, requirePermission } from "../middleware/team.js";
import {
  getDiscordGuildConfig,
  getTeamDiscordSettings,
  updateTeamDiscordSettings,
} from "../lib/discord.js";
import {
  getDiscordBotRuntimeConfig,
  getDiscordBotSecretsPublic,
  updateDiscordBotSecrets,
} from "../lib/discordSecrets.js";
import {
  enableDiscordBotService,
  getDiscordBotServiceStatus,
  restartDiscordBotService,
  stopDiscordBotService,
} from "../lib/discordBotService.js";
import { assertBotConfigKey } from "../lib/secretsCrypto.js";

/** Discord integration settings, bot secrets, bot service and bot config. */
const routes = new Hono<AppEnv>();

routes.get("/integrations/discord/bot-config", async (c) => {
  assertBotConfigKey(c.req.header("X-Teamflow-Bot-Key"));

  const config = await getDiscordBotRuntimeConfig(db);
  if (!config) {
    return c.json({ error: "Discord bot secrets are not configured in Settings" }, 404);
  }

  return c.json({ config });
});

routes.get(
  "/teams/:teamId/discord-settings",
  requireAuth,
  validateParams,
  loadTeam(),
  requirePermission("integrations.discord.view"),
  async (c) => {
    const teamId = c.var.teamId;

    const settings = await getTeamDiscordSettings(db, teamId);
    return c.json({ settings });
  },
);

routes.patch(
  "/teams/:teamId/discord-settings",
  requireAuth,
  requireWrite,
  validateParams,
  loadTeam(),
  requirePermission("integrations.discord.manage"),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;

    const body = await parseBody(c, updateTeamDiscordSettingsSchema);

    const settings = await updateTeamDiscordSettings(db, teamId, auth.userId, body);
    return c.json({ settings });
  },
);

/* Bot credentials and the teamflow-discord service are server-wide: the instance-admin flag alone
   decides, whichever Flow is open (or none) and whatever the role in it. */

routes.get("/integrations/discord/secrets", requireAuth, requireInstanceAdmin, async (c) => {
  return c.json({ secrets: await getDiscordBotSecretsPublic(db) });
});

routes.patch(
  "/integrations/discord/secrets",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    const body = await parseBody(c, updateDiscordBotSecretsSchema);
    return c.json({ secrets: await updateDiscordBotSecrets(db, c.var.auth.userId, body) });
  },
);

/** Bot service status for the server admin page. */
routes.get("/integrations/discord/service", requireAuth, requireInstanceAdmin, async (c) => {
  return c.json({ status: await getDiscordBotServiceStatus(db) });
});

/** The same status in a Flow's Settings → Integrations, for anyone who may view it there. */
routes.get(
  "/teams/:teamId/integrations/discord/service",
  requireAuth,
  validateParams,
  loadTeam(),
  requirePermission("integrations.discord.view"),
  async (c) => {
    return c.json({ status: await getDiscordBotServiceStatus(db) });
  },
);

routes.post(
  "/integrations/discord/service/enable",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    return c.json({ status: await enableDiscordBotService(db) });
  },
);

routes.post(
  "/integrations/discord/service/restart",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    return c.json({ status: await restartDiscordBotService(db) });
  },
);

routes.post(
  "/integrations/discord/service/stop",
  requireAuth,
  requireWrite,
  requireInstanceAdmin,
  async (c) => {
    return c.json({ status: await stopDiscordBotService(db) });
  },
);

routes.get("/discord/guilds/:guildId/config", requireAuth, validateParams, async (c) => {
  const auth = c.var.auth;

  const guildId = c.req.param("guildId");
  const config = await getDiscordGuildConfig(db, guildId, auth.userId);
  if (!config) return c.json({ error: "Discord server not linked to a team" }, 404);
  return c.json({ config });
});

export { routes as discordRoutes };
