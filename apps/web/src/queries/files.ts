import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { queryKeys } from "./keys";

export function useTeamFilesQuery(teamId: string, trash: boolean, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.teamFiles(teamId, trash),
    queryFn: ({ signal }) => client.withSignal(signal).listTeamFiles(teamId, { trash }),
    enabled,
  });
}
