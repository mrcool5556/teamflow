import type { DiscordBotRuntimeConfig } from "@teamflow/core";

export type BotConfig = {
  discordToken: string;
  discordClientId: string;
  teamflowUrl: string;
  teamflowToken: string;
  publicUrl: string;
  defaultTeamId: string | null;
  guildTeams: Record<string, string>;
  ticketChannelIds: Set<string>;
  registerGuildIds: string[];
  /** When true, bot requests Message Content intent (must also be enabled in Discord Developer Portal). */
  messageContentIntent: boolean;
  /** Env fallback when guild is not linked in Teamflow settings UI. */
  allowedRoleIds: string[];
  allowDiscordAdministrators: boolean;
  configSource: "settings" | "env";
};

function parseJsonRecord(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object");
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  } catch (err) {
    throw new Error(
      `Invalid DISCORD_GUILD_TEAMS: ${err instanceof Error ? err.message : "parse failed"}`,
    );
  }
}

function parseIdList(raw: string | undefined) {
  if (!raw?.trim()) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function loadEnvOptionalFields(
  teamflowUrl: string,
  publicUrl: string,
  requireTeamMapping = true,
) {
  const defaultTeamId = process.env.TEAMFLOW_TEAM_ID?.trim() || null;
  const guildTeams = parseJsonRecord(process.env.DISCORD_GUILD_TEAMS);

  if (requireTeamMapping && !defaultTeamId && Object.keys(guildTeams).length === 0) {
    throw new Error(
      "Set TEAMFLOW_TEAM_ID or DISCORD_GUILD_TEAMS so the bot knows which board to use",
    );
  }

  return {
    teamflowUrl,
    publicUrl,
    defaultTeamId,
    guildTeams,
    ticketChannelIds: parseIdList(process.env.DISCORD_TICKET_CHANNEL_IDS),
    registerGuildIds: [...parseIdList(process.env.DISCORD_REGISTER_GUILD_IDS)],
    messageContentIntent:
      process.env.DISCORD_MESSAGE_CONTENT_INTENT === "true",
    allowedRoleIds: [...parseIdList(process.env.DISCORD_ALLOWED_ROLE_IDS)],
    allowDiscordAdministrators: process.env.DISCORD_ALLOW_ADMINISTRATORS === "true",
  };
}

function buildConfigFromRemote(
  remote: DiscordBotRuntimeConfig,
  optional: ReturnType<typeof loadEnvOptionalFields>,
): BotConfig {
  return {
    discordToken: remote.botToken,
    discordClientId: remote.clientId,
    teamflowUrl: remote.teamflowUrl,
    teamflowToken: remote.pat,
    publicUrl: remote.publicUrl,
    defaultTeamId: optional.defaultTeamId,
    guildTeams: optional.guildTeams,
    ticketChannelIds: optional.ticketChannelIds,
    registerGuildIds: optional.registerGuildIds,
    messageContentIntent: remote.messageContentIntent,
    allowedRoleIds: optional.allowedRoleIds,
    allowDiscordAdministrators: optional.allowDiscordAdministrators,
    configSource: "settings",
  };
}

function loadConfigFromEnv(): BotConfig {
  const discordToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const discordClientId = process.env.DISCORD_CLIENT_ID?.trim();
  const teamflowToken = process.env.TEAMFLOW_TOKEN?.trim();

  if (!discordToken) {
    throw new Error(
      "DISCORD_BOT_TOKEN is required — save secrets in Teamflow Settings or copy apps/discord-bot/.env.example to .env",
    );
  }
  if (!discordClientId) {
    throw new Error("DISCORD_CLIENT_ID is required");
  }
  if (!teamflowToken) {
    throw new Error("TEAMFLOW_TOKEN is required (create a PAT in Teamflow Settings)");
  }

  const teamflowUrl = (process.env.TEAMFLOW_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const publicUrl = (process.env.TEAMFLOW_PUBLIC_URL ?? "http://localhost:5173").replace(
    /\/$/,
    "",
  );
  const optional = loadEnvOptionalFields(teamflowUrl, publicUrl);

  return {
    discordToken,
    discordClientId,
    teamflowToken,
    ...optional,
    configSource: "env",
  };
}

async function loadConfigFromSettings(teamflowUrl: string, configKey: string) {
  const response = await fetch(`${teamflowUrl}/integrations/discord/bot-config`, {
    headers: { "X-Teamflow-Bot-Key": configKey },
  });

  if (response.status === 503) {
    throw new Error(
      "Server has no TEAMFLOW_BOT_CONFIG_KEY — set the same random key in Teamflow .env and apps/discord-bot/.env",
    );
  }
  if (response.status === 404) {
    throw new Error(
      "Discord bot secrets are not saved in Settings → Integrations yet",
    );
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `bot-config request failed (${response.status})`);
  }

  const { config } = (await response.json()) as { config: DiscordBotRuntimeConfig };
  const optional = loadEnvOptionalFields(config.teamflowUrl, config.publicUrl, false);
  return buildConfigFromRemote(config, optional);
}

export async function loadConfig(): Promise<BotConfig> {
  const teamflowUrl = (process.env.TEAMFLOW_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const configKey = process.env.TEAMFLOW_BOT_CONFIG_KEY?.trim();

  if (configKey) {
    try {
      return await loadConfigFromSettings(teamflowUrl, configKey);
    } catch (err) {
      console.warn(
        "[teamflow-discord] Could not load secrets from Teamflow Settings:",
        err instanceof Error ? err.message : err,
      );
      console.warn("[teamflow-discord] Falling back to apps/discord-bot/.env");
    }
  }

  return loadConfigFromEnv();
}

export function resolveTeamId(config: BotConfig, guildId: string | null) {
  if (guildId && config.guildTeams[guildId]) {
    return config.guildTeams[guildId];
  }
  if (config.defaultTeamId) {
    return config.defaultTeamId;
  }
  throw new Error(
    "No Teamflow team configured for this Discord server. Link the guild in Settings → Integrations or set TEAMFLOW_TEAM_ID.",
  );
}
