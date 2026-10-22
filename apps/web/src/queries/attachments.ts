import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { queryKeys } from "./keys";

export function useIssueAttachmentsQuery(issueId: string) {
  return useQuery({
    queryKey: queryKeys.issueAttachments(issueId),
    queryFn: ({ signal }) => client.withSignal(signal).listAttachments(issueId),
  });
}

export function useRowAttachmentsQuery(rowId: string) {
  return useQuery({
    queryKey: queryKeys.rowAttachments(rowId),
    queryFn: ({ signal }) => client.withSignal(signal).listRowAttachments(rowId),
  });
}
