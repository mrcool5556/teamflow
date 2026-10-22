import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { queryKeys } from "./keys";

/** Team members; empty when the role may not list them (the board still works). */
export function useMembersQuery(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.members(teamId ?? ""),
    queryFn: async ({ signal }) => {
      try {
        return (await client.withSignal(signal).listTeamMembers(teamId!)).members;
      } catch (err) {
        if (signal.aborted) throw err;
        return [];
      }
    },
    enabled: Boolean(teamId),
  });
}

export function useInvitesQuery(teamId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.invites(teamId),
    queryFn: async ({ signal }) => (await client.withSignal(signal).listTeamInvites(teamId)).invites,
    enabled,
  });
}
