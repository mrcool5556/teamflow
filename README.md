# Teamflow

Self-hosted issue tracker for small teams: kanban boards with rows (swimlanes) and columns, roles and permissions, team files, a Discord bot, and first-class **AI tooling** through MCP and a CLI. One Node process serves the API and the web UI from a single SQLite file.

## Features

- Teams, rows, columns, issues, assignees, comments, due dates, timers, projects
- Web UI: kanban board, issue drawer, full-page settings, responsive layout
- Roles and permissions per team (Owner, Admin, Member, Viewer, plus custom roles); server-wide actions need an instance admin
- File attachments up to 4 GB with chunked, resumable uploads and seekable video
- **MCP server** for Cursor / Codex / Claude (list, create, update, complete issues from chat)
- **CLI** (`teamflow`) for scripts and terminal work
- **Discord bot**: slash commands, ticket threads to issues, share links
- Personal access tokens (PATs) with read/write scope and optional team restriction
- In-app backups and updates on Linux (Settings → Updates)

## Requirements

- **Node 20** (pinned in `.nvmrc` and `engines`; `better-sqlite3` is built for Node 20, other majors fail to load it). With nvm: `nvm use`. With nvm-windows: `nvm use 20.19.2`.
- **pnpm 9** (`corepack enable` picks up the `packageManager` field).

## Quick start (development)

The server loads `.env` from the repo root if it exists (variables in your shell win). In development it needs `NODE_ENV=development` (or `TEAMFLOW_ALLOW_DEV_SECRET=1`), otherwise it refuses to start without a real `JWT_SECRET`.

PowerShell:

```powershell
git clone https://github.com/mrcool5556/teamflow.git
cd teamflow
pnpm install
pnpm build                          # once: the server and web import the built packages/*
$env:NODE_ENV = "development"
$env:TEAMFLOW_SEED_DEMO = "1"       # optional: demo user + sample board
pnpm db:setup                       # migrate + seed (seed is a no-op without TEAMFLOW_SEED_DEMO=1)
pnpm dev
```

bash:

```bash
pnpm install && pnpm build
NODE_ENV=development TEAMFLOW_SEED_DEMO=1 pnpm db:setup
NODE_ENV=development pnpm dev
```

- Web (Vite): <http://localhost:5173>, proxies `/api` to the API
- API: <http://localhost:3000> (`GET /health`)
- Database: `data/teamflow.db` in the repo root (override with `DATABASE_URL=file:...`)
- Demo login (only with `TEAMFLOW_SEED_DEMO=1`): `demo@teamflow.local` / `changeme123`. Without it, register; the first account becomes the instance admin.

Rebuild a package (`pnpm --filter @teamflow/core build`, likewise `db`, `api-client`) after changing it; the apps import its `dist/`.

## Scripts

| Script | What it does |
|--------|--------------|
| `pnpm dev` | API (`tsx`, port 3000) and web (Vite, port 5173) in parallel |
| `pnpm dev:discord` | Discord bot via `tsx` (reads `apps/discord-bot/.env`) |
| `pnpm build` | Build every package and app |
| `pnpm test` | Vitest: server (in-memory SQLite), web (jsdom), core, db, api-client |
| `pnpm lint` / `pnpm lint:fix` | ESLint 9 |
| `pnpm format` / `pnpm format:check` | Prettier (Markdown, `docs/` and `deploy/` are ignored) |
| `pnpm typecheck` | `tsc --noEmit` in every package (build `packages/*` first) |
| `pnpm db:migrate` | Create or upgrade the SQLite schema to the current `schema_version` |
| `pnpm db:seed` | Demo data, only when `TEAMFLOW_SEED_DEMO=1` |
| `pnpm db:setup` | `db:migrate` then `db:seed` |
| `pnpm db:maintenance` | Data upkeep: purge trash older than 7 days, repair Owner roles, renumber duplicate issue numbers |
| `pnpm docs:api` / `pnpm docs:api:check` | Regenerate / verify [docs/API.md](docs/API.md) from the route files |

## Deployment

**[Self-hosting guide](docs/SELF-HOSTING.md)** covers install, update and the production checklist.

| Setup | Doc | Best for |
|-------|-----|----------|
| **A. Windows** | [deploy/windows/README.md](deploy/windows/README.md) | Dev machine or a small team on one PC |
| **B. Proxmox LXC** | [deploy/proxmox-lxc/README.md](deploy/proxmox-lxc/README.md) | Always-on Linux server (`sudo update`, in-app updates) |
| Remote access | [deploy/relay/README.md](deploy/relay/README.md) | Tailscale, Caddy or Cloudflare in front of the server |

Production needs a real `JWT_SECRET` (the server refuses placeholders), `PUBLIC_URL`, and on Linux one run of `setup-maintenance-sudo.sh`. See [SELF-HOSTING.md](docs/SELF-HOSTING.md#production-checklist).

## AI integration (MCP)

The MCP server runs on your machine (stdio) and calls the Teamflow HTTP API with a PAT.

```json
{
  "mcpServers": {
    "teamflow": {
      "command": "node",
      "args": ["path/to/teamflow/apps/mcp/dist/index.js"],
      "env": {
        "TEAMFLOW_URL": "http://localhost:3000",
        "TEAMFLOW_TOKEN": "pat_your_token_here"
      }
    }
  }
}
```

Create a PAT in **Settings → API tokens**. Tools and details: [docs/MCP.md](docs/MCP.md).

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) | Install, update, production checklist |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment index, schema versions, data maintenance |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Monorepo map, server and web layout, auth model, data flow |
| [docs/AUTH.md](docs/AUTH.md) | Login, roles, instance admin, PATs, password reset, SMTP |
| [docs/API.md](docs/API.md) | HTTP API reference (generated) |
| [docs/ATTACHMENTS.md](docs/ATTACHMENTS.md) | Issue and row files, team files, trash |
| [docs/LARGE-FILES.md](docs/LARGE-FILES.md) | Chunked upload, streaming, move and link |
| [docs/MCP.md](docs/MCP.md) | MCP tools for AI assistants |
| [docs/CLI.md](docs/CLI.md) | CLI commands |
| [docs/discord-bot.md](docs/discord-bot.md) | Discord bot setup |
| [docs/SERVER-TESTING.md](docs/SERVER-TESTING.md) | Diagnosing a production LXC over SSH |

## Appendix: Docker (optional)

A Docker setup exists for hosts that already run Docker: [deploy/docker/README.md](deploy/docker/README.md). It is not one of the supported setups above (A and B) and gets less testing.

## Support

Teamflow is free to use under [AGPL-3.0](LICENSE). Optional donation links (PayPal, Ko-fi) appear in the in-app **About** dialog when enabled in [`packages/core/src/about.ts`](packages/core/src/about.ts).

## License

[GNU Affero General Public License v3.0](LICENSE): free to use and modify. If you run a modified version for others over a network, you must share the source under the same license.
