import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { queryKeys } from "./keys";

/** Issue detail; the drawer reads the comments from it (the board has the issue itself). */
export function useIssueQuery(issueId: string) {
  return useQuery({
    queryKey: queryKeys.issue(issueId),
    queryFn: ({ signal }) => client.withSignal(signal).getIssue(issueId),
  });
}
