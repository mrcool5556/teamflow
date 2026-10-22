# CLI reference

Binary: `teamflow` (`apps/cli`, built to `apps/cli/dist/index.js`). It calls the HTTP API through `@teamflow/api-client`.

## Running it

From the repo after `pnpm build`:

```powershell
node apps/cli/dist/index.js <command>
# or, without building the CLI itself:
pnpm --filter @teamflow/cli exec tsx src/index.ts <command>
```

To get a `teamflow` command on PATH: `pnpm --filter @teamflow/cli link --global` (or add an alias). The examples below assume `teamflow`.

## Config

`teamflow login` writes `~/.teamflow/config.json` (`%USERPROFILE%\.teamflow\config.json` on Windows):

```json
{ "baseUrl": "http://localhost:3000", "token": "pat_..." }
```

Every other command reads that file; there are no environment-variable overrides and no `--url`/`--token` flags on other commands. The file is written with default permissions, so on a shared machine restrict it yourself (`chmod 600`).

## Login

```powershell
# With a PAT (recommended): Settings → API tokens
teamflow login --url http://localhost:3000 --token pat_...

# With email and password: stores a 7-day session JWT
teamflow login --url http://localhost:3000 --email you@example.com --password '...'
```

| Option | Required | Notes |
|--------|----------|-------|
| `--url <url>` | yes | API base URL (trailing slash removed) |
| `--token <token>` | one of | PAT or session JWT |
| `--email <email>` + `--password <password>` | one of | Logs in and saves the returned session token. The password lands in shell history; prefer a PAT |

## Commands

| Command | Options | Output |
|---------|---------|--------|
| `teamflow whoami` | — | `Name <email>` |
| `teamflow issues list` | `--team <teamId>`, `--search <query>`, `--assignee <userId>`, `--assignee-me`, `--row <rowId>` | One line per issue: identifier, status, priority, assignee, title (tab-separated) |
| `teamflow issues create` | `--team <teamId>` (required), `--title <title>` (required), `--description <text>`, `--priority <none\|low\|medium\|high\|urgent>` (default `none`) | `Created ENG-42: title` |
| `teamflow issues update <issueId>` | `--status <statusId>`, `--title <title>`, `--priority <priority>` | `Updated ENG-42` |
| `teamflow issues complete <issueId>` | — | Moves the issue to its row's done column |
| `teamflow issues comment <issueId>` | `--body <text>` (required) | Comment timestamp |
| `teamflow board rows` | `--team <teamId>` (required) | Row id, position, assignee, color, name |
| `teamflow board summary` | `--team <teamId>` (required) | Per row: open / total and count per column |
| `teamflow --version`, `teamflow --help` | — | |

All ids are UUIDs (not `ENG-42` identifiers). Writes need a token with `write` scope and the `board.edit` permission on the team.

## Finding ids

There is no `teams list` command yet. Get team ids from the MCP `list_teams` tool, or `GET /teams` with your token:

```powershell
curl -H "Authorization: Bearer pat_..." http://localhost:3000/teams
```

Row ids come from `teamflow board rows`; status ids from `GET /teams/:teamId/statuses` or MCP `list_statuses`.

## Known gaps

- No `teams list`, no issue delete/restore, no assignee or row on `issues create`, no `--description` on `issues update`.
- Errors surface as unhandled promise rejections with a stack trace rather than a short message.
