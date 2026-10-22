import { useQuery } from "@tanstack/react-query";
import type { MaintenanceStatusPublic } from "@teamflow/core";
import { client } from "../api";
import { queryKeys } from "./keys";

/** While a job runs the status is polled; the server may drop out during an update. */
export const MAINTENANCE_POLL_MS = 2000;

export function useMaintenanceStatusQuery(teamId: string) {
  return useQuery({
    queryKey: queryKeys.maintenance(teamId),
    queryFn: async ({ signal }): Promise<MaintenanceStatusPublic> =>
      (await client.withSignal(signal).getServerMaintenanceStatus(teamId)).status,
    retry: false,
    refetchInterval: (query) => {
      const running = query.state.data?.job?.status === "running";
      // Keep polling through errors while a job was running (the app restarts mid-update).
      return running ? MAINTENANCE_POLL_MS : false;
    },
  });
}
