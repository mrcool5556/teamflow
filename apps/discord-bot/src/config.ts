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

export function loadConfig(): BotConfig {
  const discordToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const discordClientId = process.env.DISCORD_CLIENT_ID?.trim();
  const teamflowToken = process.env.TEAMFLOW_TOKEN?.trim();

  if (!discordToken) {
    throw new Error(
      "DISCORD_BOT_TOKEN is required — copy apps/discord-bot/.env.example to .env and fill in values",
    );
  }
  if (!discordClientId) {
    throw new Error("DISCORD_CLIENT_ID is required");
  }
  if (!teamflowToken) {
    throw new Error("TEAMFLOW_TOKEN is required (create a PAT in Teamflow Settings)");
  }

  const defaultTeamId = process.env.TEAMFLOW_TEAM_ID?.trim() || null;
  const guildTeams = parseJsonRecord(process.env.DISCORD_GUILD_TEAMS);

  if (!defaultTeamId && Object.keys(guildTeams).length === 0) {
    throw new Error(
      "Set TEAMFLOW_TEAM_ID or DISCORD_GUILD_TEAMS so the bot knows which board to use",
    );
  }

  return {
    discordToken,
    discordClientId,
    teamflowUrl: (process.env.TEAMFLOW_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    teamflowToken,
    publicUrl: (process.env.TEAMFLOW_PUBLIC_URL ?? "http://localhost:5173").replace(
      /\/$/,
      "",
    ),
    defaultTeamId,
    guildTeams,
    ticketChannelIds: parseIdList(process.env.DISCORD_TICKET_CHANNEL_IDS),
    registerGuildIds: parseIdList(process.env.DISCORD_REGISTER_GUILD_IDS)
      ? [...parseIdList(process.env.DISCORD_REGISTER_GUILD_IDS)]
      : [],
    messageContentIntent: process.env.DISCORD_MESSAGE_CONTENT_INTENT === "true",
    allowedRoleIds: [...parseIdList(process.env.DISCORD_ALLOWED_ROLE_IDS)],
    allowDiscordAdministrators: process.env.DISCORD_ALLOW_ADMINISTRATORS === "true",
  };
}

export function resolveTeamId(config: BotConfig, guildId: string | null) {
  if (guildId && config.guildTeams[guildId]) {
    return config.guildTeams[guildId];
  }
  if (config.defaultTeamId) {
    return config.defaultTeamId;
  }
  throw new Error(
    "No Teamflow team configured for this Discord server. Set DISCORD_GUILD_TEAMS or TEAMFLOW_TEAM_ID.",
  );
}
