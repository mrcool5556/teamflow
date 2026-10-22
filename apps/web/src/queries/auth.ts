import { useQuery } from "@tanstack/react-query";
import { client } from "../api";

/** Public auth settings for the login page (invite-only, reset by email). */
export function useAuthConfigQuery() {
  return useQuery({
    queryKey: ["auth-config"],
    queryFn: ({ signal }) => client.withSignal(signal).getAuthConfig(),
    staleTime: Infinity,
    retry: false,
  });
}
