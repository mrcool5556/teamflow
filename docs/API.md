# REST API

Base URL: `http://localhost:3000`

Auth: `Authorization: Bearer <session_jwt | pat_...>`

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
