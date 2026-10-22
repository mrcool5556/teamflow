import { Hono } from "hono";
import type { AppEnv } from "../types.js";
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
  loadTeam(),
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;

    const body = updateTeamDiscordSettingsSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
    }

    const settings = await updateTeamDiscordSettings(db, teamId, auth.userId, body.data);
    return c.json({ settings });
  },
);

routes.get(
  "/teams/:teamId/integrations/discord/secrets",
  requireAuth,
  loadTeam(),
  requirePermission("integrations.discord.secrets"),
  requireInstanceAdmin,
  async (c) => {
    const secrets = await getDiscordBotSecretsPublic(db);
    return c.json({ secrets });
  },
);

routes.patch(
  "/teams/:teamId/integrations/discord/secrets",
  requireAuth,
  requireWrite,
  loadTeam(),
  requireInstanceAdmin,
  async (c) => {
    const auth = c.var.auth;

    const teamId = c.var.teamId;

    const body = updateDiscordBotSecretsSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return c.json({ error: body.error.issues[0]?.message ?? "Invalid input" }, 400);
    }

    const secrets = await updateDiscordBotSecrets(db, teamId, auth.userId, body.data);
    return c.json({ secrets });
  },
);

routes.get(
  "/teams/:teamId/integrations/discord/service",
  requireAuth,
  loadTeam(),
  requirePermission("integrations.discord.view"),
  async (c) => {
    const status = await getDiscordBotServiceStatus(db);
    return c.json({ status });
  },
);

routes.post(
  "/teams/:teamId/integrations/discord/service/enable",
  requireAuth,
  requireWrite,
  loadTeam(),
  requirePermission("integrations.discord.secrets"),
  requireInstanceAdmin,
  async (c) => {
    const status = await enableDiscordBotService(db);
    return c.json({ status });
  },
);

routes.post(
  "/teams/:teamId/integrations/discord/service/restart",
  requireAuth,
  requireWrite,
  loadTeam(),
  requirePermission("integrations.discord.secrets"),
  requireInstanceAdmin,
  async (c) => {
    const status = await restartDiscordBotService(db);
    return c.json({ status });
  },
);

routes.post(
  "/teams/:teamId/integrations/discord/service/stop",
  requireAuth,
  requireWrite,
  loadTeam(),
  requirePermission("integrations.discord.secrets"),
  requireInstanceAdmin,
  async (c) => {
    const status = await stopDiscordBotService(db);
    return c.json({ status });
  },
);

routes.get("/discord/guilds/:guildId/config", requireAuth, async (c) => {
  const auth = c.var.auth;

  const guildId = c.req.param("guildId");
  const config = await getDiscordGuildConfig(db, guildId, auth.userId);
  if (!config) return c.json({ error: "Discord server not linked to a team" }, 404);
  return c.json({ config });
});

export { routes as discordRoutes };
