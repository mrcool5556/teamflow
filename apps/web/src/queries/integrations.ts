import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { queryKeys } from "./keys";

export function useDiscordSettingsQuery(teamId: string) {
  return useQuery({
    queryKey: queryKeys.discordSettings(teamId),
    queryFn: async ({ signal }) =>
      (await client.withSignal(signal).getTeamDiscordSettings(teamId)).settings,
  });
}

/** Server-wide bot credentials (instance admins). */
export function useDiscordSecretsQuery() {
  return useQuery({
    queryKey: queryKeys.discordSecrets,
    queryFn: async ({ signal }) => (await client.withSignal(signal).getDiscordBotSecrets()).secrets,
  });
}

/** `teamId` null: the server admin page (instance admins); else through that Flow. */
export function useDiscordServiceQuery(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.discordService(teamId),
    queryFn: async ({ signal }) =>
      (await client.withSignal(signal).getDiscordBotServiceStatus(teamId)).status,
  });
}
