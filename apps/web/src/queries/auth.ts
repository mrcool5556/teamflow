import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { queryKeys } from "./keys";

/** Public auth settings for the login page (site name, invite-only, reset by email, setup). */
export function useAuthConfigQuery() {
  return useQuery({
    queryKey: queryKeys.authConfig,
    queryFn: ({ signal }) => client.withSignal(signal).getAuthConfig(),
    staleTime: Infinity,
    retry: false,
  });
}
