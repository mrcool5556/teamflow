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
  /** Server-wide (instance admins), so not per Flow. */
  maintenance: ["maintenance"] as const,
  discordSettings: (teamId: string) => ["discord", teamId, "settings"] as const,
  discordSecrets: ["discord", "secrets"] as const,
  /** Per Flow in Settings → Integrations; `null` = the server admin page. */
  discordService: (teamId: string | null) => ["discord", teamId ?? "server", "service"] as const,
  teamStorage: (teamId: string) => ["storage", teamId] as const,
  instanceOverview: ["instance", "overview"] as const,
  instanceSpaces: ["instance", "spaces"] as const,
  instanceSpace: (teamId: string) => ["instance", "spaces", teamId] as const,
  instanceSettings: ["instance", "settings"] as const,
  instanceUsers: (query: string) => ["instance", "users", query] as const,
  serverAdmins: ["instance", "admins"] as const,
  backupList: ["maintenance", "backups"] as const,
  instanceSite: ["instance", "site"] as const,
  instanceMail: ["instance", "mail"] as const,
  instanceSignup: ["instance", "signup"] as const,
  setupChecklist: ["instance", "setup-checklist"] as const,
  authConfig: ["auth-config"] as const,
  spaceAllowance: ["space-allowance"] as const,
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
