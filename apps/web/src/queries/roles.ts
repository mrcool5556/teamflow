import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { queryKeys } from "./keys";

export function useTeamRolesQuery(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.roles(teamId ?? ""),
    queryFn: async ({ signal }) => (await client.withSignal(signal).listTeamRoles(teamId!)).roles,
    enabled: Boolean(teamId),
  });
}
