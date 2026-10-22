import { QueryClient } from "@tanstack/react-query";

/** Every server-state cache key lives here so invalidation stays greppable. */
export const queryKeys = {
  teams: ["teams"] as const,
  board: (teamId: string) => ["board", teamId] as const,
  members: (teamId: string) => ["members", teamId] as const,
  permissions: (teamId: string) => ["permissions", teamId] as const,
  invites: (teamId: string) => ["invites", teamId] as const,
  roles: (teamId: string) => ["roles", teamId] as const,
  issue: (issueId: string) => ["issue", issueId] as const,
  issueAttachments: (issueId: string) => ["attachments", "issue", issueId] as const,
  rowAttachments: (rowId: string) => ["attachments", "row", rowId] as const,
  teamFiles: (teamId: string, trash: boolean) =>
    ["files", teamId, trash ? "trash" : "active"] as const,
  maintenance: (teamId: string) => ["maintenance", teamId] as const,
  discordSettings: (teamId: string) => ["discord", teamId, "settings"] as const,
  discordSecrets: (teamId: string) => ["discord", teamId, "secrets"] as const,
  discordService: (teamId: string) => ["discord", teamId, "service"] as const,
};

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
