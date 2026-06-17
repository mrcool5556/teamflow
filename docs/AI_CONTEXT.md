# AI Context — Teamflow

North-star document for architecture and conventions. Update when major decisions change.

## What Teamflow is

A self-hosted, Linear-style issue tracker for teams with three clients on one HTTP API:

| Client | Runs where | Auth |
|--------|------------|------|
| Web UI | Browser | Session cookie |
| MCP server | Local machine (stdio) | Personal access token |
| CLI | Local machine | Personal access token |

AI assistants use **MCP or CLI** to manage issues. They do **not** need OpenAI/Anthropic API keys for task management — only a Teamflow PAT.

## Monorepo structure (target)

```
apps/
  server/     Hono HTTP API, auth, serves built web in production
  web/        React + Vite UI
  mcp/        @modelcontextprotocol/sdk stdio server
  cli/        teamflow CLI binary
packages/
  core/       Zod schemas, shared types, constants
  db/         Drizzle ORM schema, migrations, seed
  api-client/ Typed HTTP client (shared by web, mcp, cli)
deploy/
  windows/    Setup A — PowerShell + NSSM + SQLite
  proxmox-lxc/ Setup B — install.sh + systemd + Postgres
  relay/      Remote access options
  docker/     OPTIONAL appendix — not primary docs path
docs/         Living documentation — update every step
```

## Stack (locked)

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| Monorepo | pnpm workspaces |
| API | Hono on Node.js 22 |
| ORM | Drizzle |
| DB (dev / Windows) | SQLite |
| DB (Proxmox prod) | PostgreSQL |
| Web | React + Vite |
| MCP | @modelcontextprotocol/sdk (stdio) |

## Data model (v1)

- **Workspace** → **Teams** → **Projects**, **Issues**, **IssueStatuses**
- **Users** join teams via **TeamMembers**
- **Issues**: title, description, status, priority, assignee, project, labels, due date
- **Comments** on issues
- **ApiTokens** (PATs) for MCP/CLI
- **Activity** log for audit (who changed what)

Default issue workflow per team: `Backlog` → `Todo` → `In Progress` → `Done` → `Canceled`

## Auth model

- Web: register/login → httpOnly session or JWT cookie
- MCP/CLI: `Authorization: Bearer <pat_...>`
- PATs hashed at rest; shown once on creation
- Scopes: `read`, `write`; optional team restriction

## Deployment (locked — no Docker in main path)

### Setup A — Windows self-host

- SQLite at `C:\ProgramData\Teamflow\data\teamflow.db` (default)
- Windows Service via NSSM
- `TEAMFLOW_URL=http://localhost:3000` for local MCP

### Setup B — Proxmox LXC

- Native `apt install` + `systemd` — **not Docker**
- PostgreSQL on the same LXC
- Optional Caddy for TLS

### Relay

- MCP stays on Windows; only API URL must be reachable remotely
- Options: Tailscale (recommended), reverse proxy, dedicated relay LXC

## Conventions

- Validate all API input with Zod (shared schemas in `packages/core`)
- API errors: `{ error: string, code?: string }` with appropriate HTTP status
- Issue IDs in UI: team prefix + number (e.g. `ENG-42`) — Phase 2; use UUID internally in v1 if needed
- AI actions should write to activity log; optional auto-comment "via MCP"

## What NOT to do

- Do not require Docker for Setup A or B
- Do not let MCP/CLI write to the database directly
- Do not store PATs in plaintext
- Do not skip updating STATUS.md and step docs after completing work
- Do not add LLM/AI inference inside Teamflow — external agents call our API

## Related docs

- [STATUS.md](STATUS.md) — build progress
- [ARCHITECTURE.md](ARCHITECTURE.md) — diagrams and flows
- [API.md](API.md) — REST contract
- [MCP.md](MCP.md) — MCP tools and config
- [CLI.md](CLI.md) — CLI reference
- [DEPLOYMENT.md](DEPLOYMENT.md) — deploy index
