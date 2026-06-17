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
| POST | `/auth/register` | `{ email, name, password }` |
| POST | `/auth/login` | `{ email, password }` |
| GET | `/auth/me` | — |
| POST | `/auth/tokens` | `{ name, scopes?, teamId? }` → returns `token` once |

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
