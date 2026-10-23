# REST API

Base URL: `http://localhost:3000`

Auth: `Authorization: Bearer <session_jwt | pat_...>`

## Errors

Every error response is JSON `{ "error": "<human message>", "code": "<code>" }` with the status
below. Every response (success or error) carries an `X-Request-Id` header; send one in and it is
echoed back. Unexpected failures return a generic `Internal Server Error` and are logged on the
server together with the request id.

| Status | `code` | When |
|--------|--------|------|
| 400 | `validation_error` | Body, query or path parameter failed its schema |
| 400 | `bad_request` | Request is well-formed but cannot be applied (e.g. row belongs to another team, invite expired) |
| 401 | `unauthorized` | Missing or invalid session / PAT / stream token / bot config key |
| 403 | `forbidden` | Not a member, PAT scoped to another team, missing permission or write scope, instance admin required |
| 404 | `not_found` | Team, row, column, issue, comment, file, invite, role or member does not exist |
| 409 | `conflict` | Email already registered, column/row still has issues, last row on a board |
| 410 | `gone` | Removed endpoint |
| 413 | `payload_too_large` | Body over the JSON (1 MB), attachment or bundle limit |
| 429 | `rate_limited` | Too many login/register/forgot-password attempts (see `Retry-After`) |
| 500 | `internal_error` | Unexpected server error |
| 503 | `service_unavailable` | Feature disabled on this host (e.g. bot config endpoint without `TEAMFLOW_BOT_CONFIG_KEY`) |

Server code throws `ApiError` from `apps/server/src/lib/errors.ts` (`badRequest`, `forbidden`,
`notFound`, `conflict`, ...); one `onError` handler renders it.

## Deprecated fields

- **Issue timer** (`timerActiveAt`, `timerElapsedSec`, `timerTargetSec`): the web app removed its timer on 2026-10-23 and uses the due date (`dueDate`) instead. The columns are kept, so no data is lost: issues still return these fields and `PATCH /issues/:id` (`updateIssueSchema`) still accepts them, so MCP, the CLI and older clients keep working. Do not build on them; they are planned to be dropped in a later schema version.

<!-- BEGIN GENERATED ROUTES (scripts/gen-api-docs.mjs) -->

## Routes (92)

Generated from `apps/server/src/routes/*.ts` by `pnpm docs:api`; do not edit by hand.

- **Auth**: `bearer` = session JWT or PAT required; `optional` = works signed out too; `none` = public; `bot key` = `X-Teamflow-Bot-Key` header; `stream token` = `?token=` from `POST /attachments/:id/stream-token`.
- **Write**: needs a token with the `write` scope.
- **Team**: caller must be a member of the owning team (resolved from the path, or from the row/issue/column/upload/attachment named in it); a team-scoped PAT must match it.
- **Input**: schema names are exports of `@teamflow/core`. Path ids are UUIDs (`idParamSchema`).

### Health

Liveness probe.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/health` | none |  |  |  |  |

### Auth and profile

Registration, login, password reset and the signed-in user's profile.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/auth/config` | none |  |  |  |  |
| POST | `/auth/register` | none |  |  |  | body `registerSchema` |
| POST | `/auth/login` | none |  |  |  | body `loginSchema` |
| POST | `/auth/forgot-password` | none |  |  |  | body `forgotPasswordSchema` |
| POST | `/auth/reset-password` | none |  |  |  | body `resetPasswordSchema` |
| GET | `/auth/me` | bearer |  |  |  |  |
| GET | `/auth/profile` | bearer |  |  |  |  |
| PUT | `/auth/profile` | bearer | yes |  |  | body `userProfileSchema` |
| PATCH | `/auth/profile` | bearer | yes |  |  | body `userProfilePatchSchema` |
| GET | `/auth/profile/export` | bearer |  |  |  |  |
| POST | `/auth/profile/import` | bearer | yes |  |  | body profile export → `userProfileSchema` |

### API tokens

Personal access tokens (list, create, revoke).

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/auth/tokens` | bearer |  |  |  |  |
| DELETE | `/auth/tokens/:id` | bearer | yes |  |  |  |
| POST | `/auth/tokens` | bearer | yes |  |  | body `createTokenSchema` |

### Teams

Team list/create/delete, bundle export/import, permissions and ref resolution.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/teams` | bearer |  |  |  |  |
| POST | `/teams` | bearer | yes |  |  | body `createTeamSchema` |
| DELETE | `/teams/:teamId` | bearer | yes | member | `team.delete` |  |
| GET | `/teams/:teamId/export` | bearer |  | member | `team.data.transfer` | query `teamBundleExportQuerySchema` |
| POST | `/teams/:teamId/import` | bearer | yes | member | `team.data.transfer` | query `teamBundleImportOptionsSchema` (`force`), multipart field `bundle` |
| GET | `/teams/:teamId/permissions/me` | bearer |  | member |  |  |
| GET | `/teams/:teamId/resolve` | bearer |  | member |  | query `resolveRefSchema` (`ref`) |

### Board rows and columns

Board rows and columns (statuses).

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/teams/:teamId/statuses` | bearer |  | member |  |  |
| GET | `/rows/:rowId/statuses` | bearer |  | member (via row) |  |  |
| POST | `/rows/:rowId/statuses` | bearer | yes | member (via row) | `board.edit` | body `createStatusSchema` |
| PATCH | `/statuses/:statusId` | bearer | yes | member (via status) | `board.edit` | body `updateStatusSchema` |
| DELETE | `/statuses/:statusId` | bearer | yes | member (via status) | `board.edit` |  |
| GET | `/teams/:teamId/rows` | bearer |  | member |  |  |
| POST | `/teams/:teamId/rows` | bearer | yes | member | `board.edit` | body `createBoardRowSchema` |
| PATCH | `/rows/:rowId` | bearer | yes | member (via row) | `board.edit` | body `updateBoardRowSchema` |
| DELETE | `/rows/:rowId` | bearer | yes | member (via row) | `board.edit` |  |

### Members

Team membership: list, change role, remove, leave.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/teams/:teamId/members` | bearer |  | member | `team.members.view` |  |
| PATCH | `/teams/:teamId/members/:memberId` | bearer | yes | member | `team.members.manage` | body `updateTeamMemberRoleSchema` |
| DELETE | `/teams/:teamId/members/:memberId` | bearer | yes | member |  |  |

### Invites

Team invites and invite acceptance.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/teams/:teamId/invites` | bearer |  | member | `team.invites.manage` |  |
| POST | `/teams/:teamId/invites` | bearer | yes | member | `team.invites.manage` | body `createTeamInviteSchema` |
| DELETE | `/teams/:teamId/invites/:inviteId` | bearer | yes | member | `team.invites.manage` |  |
| GET | `/invites/:token` | optional |  |  |  |  |
| POST | `/invites/:token/accept` | bearer | yes |  |  |  |

### Roles

Team roles and their permissions.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/teams/:teamId/roles` | bearer |  | member | `team.roles.view` or `team.members.manage` or `team.invites.manage` |  |
| POST | `/teams/:teamId/roles` | bearer | yes | member | `team.roles.manage` | body `createTeamRoleSchema` |
| PATCH | `/teams/:teamId/roles/:roleId` | bearer | yes | member | `team.roles.manage` | body `updateTeamRoleSchema` |
| DELETE | `/teams/:teamId/roles/:roleId` | bearer | yes | member | `team.roles.manage` |  |

### Discord integration

Discord integration settings, bot secrets, bot service and bot config.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/integrations/discord/bot-config` | bot key |  |  |  |  |
| GET | `/teams/:teamId/discord-settings` | bearer |  | member | `integrations.discord.view` |  |
| PATCH | `/teams/:teamId/discord-settings` | bearer | yes | member | `integrations.discord.manage` | body `updateTeamDiscordSettingsSchema` |
| GET | `/teams/:teamId/integrations/discord/secrets` | bearer |  | member | `integrations.discord.secrets` + instance admin |  |
| PATCH | `/teams/:teamId/integrations/discord/secrets` | bearer | yes | member | `integrations.discord.secrets` + instance admin | body `updateDiscordBotSecretsSchema` |
| GET | `/teams/:teamId/integrations/discord/service` | bearer |  | member | `integrations.discord.view` |  |
| POST | `/teams/:teamId/integrations/discord/service/enable` | bearer | yes | member | `integrations.discord.secrets` + instance admin |  |
| POST | `/teams/:teamId/integrations/discord/service/restart` | bearer | yes | member | `integrations.discord.secrets` + instance admin |  |
| POST | `/teams/:teamId/integrations/discord/service/stop` | bearer | yes | member | `integrations.discord.secrets` + instance admin |  |
| GET | `/discord/guilds/:guildId/config` | bearer |  |  |  |  |

### Server maintenance

Server maintenance: status, backups, updates (instance admin only).

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/teams/:teamId/server/maintenance` | bearer |  | member | `server.maintenance.view` + instance admin |  |
| POST | `/teams/:teamId/server/maintenance/check` | bearer | yes | member | `server.maintenance.view` + instance admin |  |
| GET | `/teams/:teamId/server/maintenance/job` | bearer |  | member | `server.maintenance.view` + instance admin |  |
| POST | `/teams/:teamId/server/maintenance/backup` | bearer | yes | member | `server.maintenance.run` + instance admin | body `runMaintenanceBackupSchema` |
| POST | `/teams/:teamId/server/maintenance/update` | bearer | yes | member | `server.maintenance.run` + instance admin | body `runMaintenanceUpdateSchema` |
| POST | `/teams/:teamId/server/maintenance/job/dismiss` | bearer | yes | member | `server.maintenance.run` + instance admin |  |

### Team files

Team file library: list, rename, trash, restore.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/teams/:teamId/files` | bearer |  | member |  | query `listTeamFilesQuerySchema` |
| PATCH | `/teams/:teamId/files/:fileId` | bearer | yes | member | `board.edit` | body `renameTeamFileSchema` |
| DELETE | `/teams/:teamId/files/:fileId` | bearer | yes | member | `board.edit` |  |
| POST | `/teams/:teamId/files/:fileId/restore` | bearer | yes | member | `board.edit` |  |

### Projects

Projects.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/projects` | bearer |  |  |  | query `listProjectsQuerySchema` |
| POST | `/projects` | bearer | yes |  |  | body `createProjectSchema` |

### Issues

Issues: list, read, create, update, complete, trash, restore.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/issues` | bearer |  |  |  | query `listIssuesSchema` |
| GET | `/issues/:id` | bearer |  | member (via issue) |  |  |
| POST | `/issues` | bearer | yes |  |  | body `createIssueSchema` |
| PATCH | `/issues/:id` | bearer | yes | member (via issue) | `board.edit` | body `updateIssueSchema` |
| POST | `/issues/:id/complete` | bearer | yes | member (via issue) | `board.edit` |  |
| DELETE | `/issues/:id` | bearer | yes | member (via issue) | `board.edit` |  |
| POST | `/issues/:id/restore` | bearer | yes | member (via issue) | `board.edit` |  |

### Comments

Issue comments.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| POST | `/issues/:id/comments` | bearer | yes | member (via issue) | `board.edit` | body `createCommentSchema` |
| DELETE | `/issues/:issueId/comments/:commentId` | bearer | yes | member (via issue) | `board.edit` |  |

### Attachments

Issue/row attachments, linking, moving, streaming and downloads.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| GET | `/issues/:issueId/attachments` | bearer |  | member (via issue) |  |  |
| POST | `/issues/:issueId/attachments` | bearer | yes | member (via issue) | `board.edit` | multipart field `file` |
| GET | `/rows/:rowId/attachments` | bearer |  | member (via row) |  |  |
| POST | `/rows/:rowId/attachments` | bearer | yes | member (via row) | `board.edit` | multipart field `file` |
| DELETE | `/rows/:rowId/attachments/:id` | bearer | yes | member (via row) | `board.edit` |  |
| POST | `/rows/:rowId/attachments/link` | bearer | yes | member (via row) | `board.edit` | body `linkAttachmentSchema` |
| POST | `/issues/:issueId/attachments/:id/move` | bearer | yes |  |  | body `moveAttachmentSchema` |
| POST | `/issues/:issueId/attachments/link` | bearer | yes | member (via issue) | `board.edit` | body `linkAttachmentSchema` |
| POST | `/attachments/:id/stream-token` | bearer |  | member (via attachment) |  |  |
| GET | `/attachments/:id/stream` | stream token |  |  |  | query `token` |
| GET | `/attachments/:id/download` | bearer |  | member (via attachment) |  |  |
| DELETE | `/issues/:issueId/attachments/:id` | bearer | yes | member (via issue) | `board.edit` |  |

### Chunked uploads

Chunked upload sessions for issue and row attachments.

| Method | Path | Auth | Write | Team | Permission | Input |
|--------|------|------|-------|------|------------|-------|
| POST | `/issues/:issueId/uploads` | bearer | yes | member (via issue) | `board.edit` | body `createUploadSessionSchema` |
| GET | `/uploads/:sessionId` | bearer |  | member (via upload) |  |  |
| PUT | `/uploads/:sessionId/chunks/:index` | bearer | yes | member (via upload) | `board.edit` | raw bytes |
| POST | `/uploads/:sessionId/complete` | bearer | yes | member (via upload) | `board.edit` |  |
| DELETE | `/uploads/:sessionId` | bearer | yes | member (via upload) | `board.edit` |  |
| POST | `/rows/:rowId/uploads` | bearer | yes | member (via row) | `board.edit` | body `createUploadSessionSchema` |

<!-- END GENERATED ROUTES -->

Auth details: [AUTH.md](AUTH.md). Attachments and uploads: [ATTACHMENTS.md](ATTACHMENTS.md).

## Issue response shape

```json
{
  "id": "uuid",
  "identifier": "ENG-1",
  "title": "...",
  "statusName": "In Progress",
  "priority": "high"
}
```

Full types in `packages/core/src/index.ts`.
