import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { TeamPublic } from "@teamflow/core";
import { client } from "../api";
import { queryKeys } from "./keys";

export function useTeamsQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.teams,
    queryFn: async ({ signal }) => (await client.withSignal(signal).listTeams()).teams,
    enabled,
  });
}

/** Re-read the team list (after create, join, leave or delete) and return it. */
export async function refreshTeams(queryClient: QueryClient): Promise<TeamPublic[]> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.teams,
    queryFn: async () => (await client.listTeams()).teams,
    staleTime: 0,
  });
}

/** The signed-in user's role and permission set in a team. */
export function useTeamPermissionsQuery(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.permissions(teamId ?? ""),
    queryFn: async ({ signal }) =>
      (await client.withSignal(signal).getTeamPermissions(teamId!)).permissions,
    enabled: Boolean(teamId),
    retry: false,
  });
}
