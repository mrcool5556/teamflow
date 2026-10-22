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

export function useDiscordSecretsQuery(teamId: string) {
  return useQuery({
    queryKey: queryKeys.discordSecrets(teamId),
    queryFn: async ({ signal }) =>
      (await client.withSignal(signal).getDiscordBotSecrets(teamId)).secrets,
  });
}

export function useDiscordServiceQuery(teamId: string) {
  return useQuery({
    queryKey: queryKeys.discordService(teamId),
    queryFn: async ({ signal }) =>
      (await client.withSignal(signal).getDiscordBotServiceStatus(teamId)).status,
  });
}
