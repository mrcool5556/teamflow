import { TeamflowApiError, TeamflowClient } from "@teamflow/api-client";
import type { BotConfig } from "./config.js";
import { resolveTeamId } from "./config.js";

export function createTeamflowClient(config: BotConfig) {
  return new TeamflowClient({
    baseUrl: config.teamflowUrl,
    token: config.teamflowToken,
  });
}

export async function getDefaultRowId(client: TeamflowClient, teamId: string) {
  const { rows } = await client.listRows(teamId);
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  return sorted[0]?.id;
}

export function teamflowErrorMessage(err: unknown) {
  if (err instanceof TeamflowApiError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Unexpected Teamflow API error";
}

export function teamIdForGuild(config: BotConfig, guildId: string | null) {
  return resolveTeamId(config, guildId);
}
