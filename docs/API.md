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

## Health

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | none |

## Auth

| Method | Path | Body |
|--------|------|------|
| GET | `/auth/config` | — → `{ inviteOnly, passwordResetEmail }` |
| POST | `/auth/register` | `{ email, name, password, inviteToken? }` |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/forgot-password` | `{ email }` |
| POST | `/auth/reset-password` | `{ token, password }` |
| GET | `/auth/me` | — |
| POST | `/auth/tokens` | `{ name, scopes?, teamId? }` → returns `token` once |

Details: [AUTH.md](AUTH.md)

## Teams

| Method | Path |
|--------|------|
| GET | `/teams` |
| POST | `/teams` | `{ name, key }` |
| GET | `/teams/:teamId/statuses` |

## Projects

| Method | Path |
|--------|------|
| GET | `/projects?teamId=` |
| POST | `/projects` | `{ teamId, name, description? }` |

## Issues

| Method | Path |
|--------|------|
| GET | `/issues?teamId&projectId&statusId&assigneeId&search` |
| GET | `/issues/:id` |
| POST | `/issues` | see `createIssueSchema` in `@teamflow/core` |
| PATCH | `/issues/:id` |
| POST | `/issues/:id/complete` |
| DELETE | `/issues/:id` |
| POST | `/issues/:id/comments` | `{ body }` |
| GET | `/issues/:issueId/attachments` | List file attachments |
| POST | `/issues/:issueId/attachments` | `multipart/form-data` field `file` |
| GET | `/attachments/:id/download` | Download attachment |
| DELETE | `/issues/:issueId/attachments/:id` | Remove attachment |

Attachments: [ATTACHMENTS.md](ATTACHMENTS.md)

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
