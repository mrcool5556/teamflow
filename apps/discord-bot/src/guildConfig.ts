import type { DiscordGuildConfigPublic } from "@teamflow/core";
import { TeamflowApiError, type TeamflowClient } from "@teamflow/api-client";
import type { BotConfig } from "./config.js";
import { resolveTeamId } from "./config.js";

export type GuildRuntimeConfig = {
  teamId: string;
  allowedRoleIds: string[];
  ticketChannelIds: Set<string>;
  allowDiscordAdministrators: boolean;
  source: "api" | "env";
};

const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { config: GuildRuntimeConfig; expiresAt: number }>();

function envFallback(config: BotConfig, guildId: string): GuildRuntimeConfig {
  return {
    teamId: resolveTeamId(config, guildId),
    allowedRoleIds: config.allowedRoleIds,
    ticketChannelIds: config.ticketChannelIds,
    allowDiscordAdministrators: config.allowDiscordAdministrators,
    source: "env",
  };
}

function fromApiConfig(config: DiscordGuildConfigPublic): GuildRuntimeConfig {
  return {
    teamId: config.teamId,
    allowedRoleIds: config.allowedRoleIds,
    ticketChannelIds: new Set(config.ticketChannelIds),
    allowDiscordAdministrators: config.allowDiscordAdministrators,
    source: "api",
  };
}

export async function getGuildRuntimeConfig(
  client: TeamflowClient,
  config: BotConfig,
  guildId: string,
): Promise<GuildRuntimeConfig> {
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  try {
    const { config: apiConfig } = await client.getDiscordGuildConfig(guildId);
    const runtime = fromApiConfig(apiConfig);
    cache.set(guildId, { config: runtime, expiresAt: Date.now() + CACHE_TTL_MS });
    return runtime;
  } catch (err) {
    if (err instanceof TeamflowApiError && err.status === 404) {
      const runtime = envFallback(config, guildId);
      cache.set(guildId, { config: runtime, expiresAt: Date.now() + CACHE_TTL_MS });
      return runtime;
    }
    throw err;
  }
}

export function clearGuildConfigCache(guildId?: string) {
  if (guildId) cache.delete(guildId);
  else cache.clear();
}
