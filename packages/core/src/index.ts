import { z } from "zod";
import { TEAM_PERMISSIONS } from "./permissions.js";

export * from "./profile.js";
export * from "./refs.js";
export * from "./permissions.js";

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TEAM_ROLES = ["admin", "member", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TOKEN_SCOPES = ["read", "write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const DEFAULT_STATUSES = [
  { name: "Backlog", type: "backlog" as const, position: 0 },
  { name: "Todo", type: "todo" as const, position: 1 },
  { name: "In Progress", type: "in_progress" as const, position: 2 },
  { name: "Done", type: "done" as const, position: 3 },
  { name: "Canceled", type: "canceled" as const, position: 4 },
];

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
  inviteToken: z.string().min(1).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createTokenSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1).default(["read", "write"]),
  teamId: z.string().uuid().optional(),
});

export const createTeamSchema = z.object({
  name: z.string().min(1).max(120),
  key: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9]+$/, "Team key must be uppercase letters and numbers"),
});

export const createTeamInviteSchema = z.object({
  roleId: z.string().uuid().optional(),
  role: z.enum(TEAM_ROLES).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  maxUses: z.union([z.literal(1), z.null()]).optional().default(1),
});

export const createTeamRoleSchema = z.object({
  name: z.string().min(1).max(60),
  permissions: z.array(z.enum(TEAM_PERMISSIONS)).min(1),
});

export const updateTeamRoleSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  permissions: z.array(z.enum(TEAM_PERMISSIONS)).min(1).optional(),
});

export const updateTeamMemberRoleSchema = z.object({
  roleId: z.string().uuid(),
});

const discordSnowflakeSchema = z.string().regex(/^\d{17,20}$/, "Invalid Discord ID");

export const updateTeamDiscordSettingsSchema = z.object({
  guildId: discordSnowflakeSchema.nullable().optional(),
  allowedRoleIds: z.array(discordSnowflakeSchema).optional(),
  ticketChannelIds: z.array(discordSnowflakeSchema).optional(),
  allowDiscordAdministrators: z.boolean().optional(),
});

export type UpdateTeamDiscordSettingsInput = z.infer<
  typeof updateTeamDiscordSettingsSchema
>;

export type TeamDiscordSettingsPublic = {
  teamId: string;
  guildId: string | null;
  allowedRoleIds: string[];
  ticketChannelIds: string[];
  allowDiscordAdministrators: boolean;
  updatedAt: string;
  /** True when guild is linked and at least one allowed role is configured. */
  commandsReady: boolean;
};

export type DiscordGuildConfigPublic = {
  teamId: string;
  allowedRoleIds: string[];
  ticketChannelIds: string[];
  allowDiscordAdministrators: boolean;
};

export const updateDiscordBotSecretsSchema = z.object({
  botToken: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  pat: z.string().min(1).optional(),
  teamflowUrl: z.string().url().optional(),
  publicUrl: z.string().url().optional(),
  messageContentIntent: z.boolean().optional(),
});

export type UpdateDiscordBotSecretsInput = z.infer<typeof updateDiscordBotSecretsSchema>;

export type DiscordBotSecretsPublic = {
  configured: boolean;
  clientId: string | null;
  hasBotToken: boolean;
  hasPat: boolean;
  teamflowUrl: string;
  publicUrl: string;
  messageContentIntent: boolean;
  botConfigKeyConfigured: boolean;
  updatedAt: string | null;
};

export type DiscordBotRuntimeConfig = {
  botToken: string;
  clientId: string;
  pat: string;
  teamflowUrl: string;
  publicUrl: string;
  messageContentIntent: boolean;
};

export const createProjectSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
});

export const boardColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .nullable();

export const ROW_COLOR_PRESETS = [
  "#ff5500",
  "#00d8ff",
  "#a855f7",
  "#22c55e",
  "#eab308",
  "#f43f5e",
  "#3b82f6",
] as const;

export const BOARD_COLOR_PRESETS = ROW_COLOR_PRESETS;

export const createIssueSchema = z.object({
  teamId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(50000).optional(),
  statusId: z.string().uuid().optional(),
  priority: z.enum(PRIORITIES).default("none"),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  rowId: z.string().uuid().optional(),
});

export const updateIssueSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(50000).optional(),
  projectId: z.string().uuid().nullable().optional(),
  statusId: z.string().uuid().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  rowId: z.string().uuid().nullable().optional(),
  boardSort: z.number().int().min(0).optional(),
  timerActiveAt: z.string().datetime().nullable().optional(),
  timerElapsedSec: z.number().int().min(0).optional(),
  timerTargetSec: z.number().int().min(0).nullable().optional(),
  color: boardColorSchema.optional(),
});

export const listIssuesSchema = z.object({
  teamId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  statusId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  rowId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
});

export const createCommentSchema = z.object({
  body: z.string().min(1).max(10000),
});

export const createStatusSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.string().max(40).default("custom"),
});

export const updateStatusSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    position: z.number().int().min(0).optional(),
    color: boardColorSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.position !== undefined ||
      data.color !== undefined,
    { message: "No updates provided" },
  );

export const createBoardRowSchema = z.object({
  name: z.string().min(1).max(80),
});

export const updateBoardRowSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  color: boardColorSchema.optional(),
});

export const createLabelSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#666666"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type UpdateBoardRowInput = z.infer<typeof updateBoardRowSchema>;
export type ListIssuesInput = z.infer<typeof listIssuesSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateTeamInviteInput = z.infer<typeof createTeamInviteSchema>;
export type CreateTeamRoleInput = z.infer<typeof createTeamRoleSchema>;
export type UpdateTeamRoleInput = z.infer<typeof updateTeamRoleSchema>;
export type UpdateTeamMemberRoleInput = z.infer<typeof updateTeamMemberRoleSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateTokenInput = z.infer<typeof createTokenSchema>;

export type UserPublic = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type TeamPublic = {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  createdAt: string;
};

export type ProjectPublic = {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  createdAt: string;
};

export type IssueStatusPublic = {
  id: string;
  teamId: string;
  rowId: string;
  key: string;
  name: string;
  type: string;
  position: number;
  color: string | null;
};

/** Map a status in one row to the best matching column in another row (by type, then position). */
export function mapStatusToRow(
  statuses: IssueStatusPublic[],
  statusId: string,
  targetRowId: string,
): string | null {
  const source = statuses.find((status) => status.id === statusId);
  if (!source) return null;

  const targetStatuses = statuses
    .filter((status) => status.rowId === targetRowId)
    .sort((a, b) => a.position - b.position);

  if (targetStatuses.length === 0) return null;

  return (
    targetStatuses.find((status) => status.type === source.type)?.id ??
    targetStatuses.find((status) => status.position === source.position)?.id ??
    targetStatuses[0]!.id
  );
}

export type TeamMemberPublic = {
  id: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  /** Legacy alias for roleSlug */
  role: string;
};

export type TeamInvitePublic = {
  id: string;
  teamId: string;
  token: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  /** @deprecated Use roleSlug */
  role: TeamRole;
  expiresAt: string;
  createdAt: string;
  createdByName: string;
  revoked: boolean;
  expired: boolean;
  maxUses: number | null;
  useCount: number;
  exhausted: boolean;
};

export type TeamInvitePreview = {
  team: Pick<TeamPublic, "id" | "name" | "key">;
  roleId: string;
  roleName: string;
  roleSlug: string;
  /** @deprecated Use roleSlug */
  role: TeamRole;
  expired: boolean;
  revoked: boolean;
  exhausted: boolean;
  alreadyMember: boolean;
};

export type AuthConfigPublic = {
  inviteOnly: boolean;
};

export type AssigneePublic = {
  userId: string;
  name: string;
};

export type BoardRowPublic = {
  id: string;
  teamId: string;
  key: string;
  name: string;
  position: number;
  assigneeId: string | null;
  assigneeName: string | null;
  assignees: AssigneePublic[];
  color: string | null;
};

export type IssuePublic = {
  id: string;
  identifier: string;
  teamId: string;
  projectId: string | null;
  rowId: string | null;
  number: number;
  title: string;
  description: string | null;
  statusId: string;
  statusName: string;
  priority: Priority;
  assigneeId: string | null;
  assigneeName: string | null;
  assignees: AssigneePublic[];
  creatorId: string;
  creatorName: string;
  dueDate: string | null;
  boardSort: number;
  timerActiveAt: string | null;
  timerElapsedSec: number;
  timerTargetSec: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  color: string | null;
};

export type CommentPublic = {
  id: string;
  issueId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type ApiTokenCreated = {
  id: string;
  name: string;
  prefix: string;
  scopes: TokenScope[];
  teamId: string | null;
  token: string;
  createdAt: string;
};

export type ApiError = {
  error: string;
  code?: string;
};
