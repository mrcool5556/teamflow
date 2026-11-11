# Teamflow

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=kofi&logoColor=black)](https://ko-fi.com/toters)

Self-hosted issue tracker for small teams: kanban boards with rows (swimlanes) and columns, roles and permissions, team files, a Discord bot, and first-class **AI tooling** through MCP and a CLI. One Node process serves the API and the web UI from a single SQLite file.

## Features

- **Flows** (teams), rows, columns, issues, assignees, comments, due dates, projects
- **First-time setup** in the browser (admin account with a one-time setup code, site name and address, email, storage rules) and a welcome page to Create a Flow or Join a Flow
- Web UI: kanban board, issue drawer, full-page settings, responsive layout
- **Make it yours**: ready-made Looks, a simple Appearance panel, and a Design page to mix colours, fonts, corners, cards, buttons, fields and switches, then save and share your mixes
- Roles and permissions per team (Owner, Admin, Member, Viewer, plus custom roles); running the server belongs to one Server Owner and the trusted admins they give powers to
- **Storage per Flow**: free Flows for users (up to 3, 1 GB each), uploads paused when the server runs low on disk, and a server admin page with an overview, setup checklist, people, site and email settings, how-tos and common fixes
- File attachments up to 4 GB with chunked, resumable uploads and seekable video; a trash with restore and Delete forever
- **MCP server** for Cursor / Codex / Claude (list, create, update, complete issues from chat)
- **CLI** (`teamflow`) for scripts and terminal work
- **Discord bot**: slash commands, ticket threads to issues, share links
- Personal access tokens (PATs) with read/write scope and optional team restriction
- One-line installers for Windows, Linux and Proxmox, a Windows tray app, and in-app backups and updates (Settings → Updates)

## Requirements (development)

- **Node 20** (pinned in `.nvmrc` and `engines`; `better-sqlite3` is built for Node 20, other majors fail to load it). With nvm: `nvm use`. With nvm-windows: `nvm use 20.19.2`.
- **pnpm 9** (`corepack enable` picks up the `packageManager` field; pnpm 10 is not tested).
- **Git**.
- **Native build tools only if needed:** `pnpm install` downloads a prebuilt `better-sqlite3` for Node 20 on Windows x64, Linux x64/arm64 and macOS. If that download fails (offline, unusual platform) it compiles from source and needs Python 3 and a C++ toolchain: `build-essential` on Debian/Ubuntu, Xcode Command Line Tools on macOS, Visual Studio Build Tools ("Desktop development with C++") on Windows.
- **Disk:** under 1 GB for the checkout, `node_modules` and builds, plus your data. Uploads pause on every team while the disk holding `data/uploads/` has less than **2 GB** free (`TEAMFLOW_MIN_FREE_DISK_BYTES`, see [docs/SPACES.md](docs/SPACES.md)).

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
- Demo login (only with `TEAMFLOW_SEED_DEMO=1`): `demo@teamflow.local` / `changeme123`, already the Server Owner. Without it, open the setup link the server prints at start (`/setup?code=…`) and create the Server Owner account; see [docs/SETUP.md](docs/SETUP.md). The admin finds the **Server admin** page in the account menu (`/admin`).
- The Vite proxy always targets port 3000; if you change `PORT` for the API, the dev web app will not reach it.
- A root `.env` is optional in development. If you copy `.env.example`, keep `NODE_ENV=development` set (its `JWT_SECRET` is a placeholder).

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

## Install on a server

Prebuilt releases, no build tools and no git checkout. Each command downloads and checks the newest release, generates secrets, starts Teamflow and prints a one-time setup link (`/setup?code=…`) where you create the admin account. **[Self-hosting guide](docs/SELF-HOSTING.md)** has the details, options and the production checklist.

**Windows 10/11:** download `TeamflowSetup-vX.Y.Z.exe` from the [latest release](https://github.com/mrcool5556/teamflow/releases/latest) (not code-signed yet: on "Windows protected your PC" click **More info → Run anyway**), or in PowerShell:

```powershell
irm https://github.com/mrcool5556/teamflow/releases/latest/download/install.ps1 | iex
```

**Proxmox VE**, in the host's shell (creates a Debian 12 container and installs Teamflow in it):

```bash
bash -c "$(curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/proxmox.sh)"
```

**Debian 12+ / Ubuntu 22.04+:**

```bash
curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh | sudo bash
```

Updates: **Settings → Updates** in the app (backup, switch, health check, automatic rollback).

| Setup | Doc | Best for |
|-------|-----|----------|
| **A. Windows** | [deploy/windows/README.md](deploy/windows/README.md) | A PC at home or in the office |
| **B. Linux / Proxmox** | [deploy/proxmox-lxc/README.md](deploy/proxmox-lxc/README.md) | Always-on server (`sudo update`, in-app updates) |
| Remote access | [deploy/relay/README.md](deploy/relay/README.md) | Tailscale, Caddy or Cloudflare in front of the server |

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
| [docs/RELEASING.md](docs/RELEASING.md) | Making a release (tags, workflow, checksums) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment index, schema versions, data maintenance |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Monorepo map, server and web layout, auth model, data flow |
| [docs/AUTH.md](docs/AUTH.md) | Login, roles, Server Owner and trusted admins, PATs, password reset, SMTP |
| [docs/API.md](docs/API.md) | HTTP API reference (generated) |
| [docs/ATTACHMENTS.md](docs/ATTACHMENTS.md) | Issue and row files, team files, trash |
| [docs/LARGE-FILES.md](docs/LARGE-FILES.md) | Chunked upload, streaming, move and link |
| [docs/SETUP.md](docs/SETUP.md) | First-time setup in the browser, the setup code, the installer contract |
| [docs/SPACES.md](docs/SPACES.md) | Flows (teams/spaces), upload caps, free Flows, the server admin page |
| [docs/APPEARANCE.md](docs/APPEARANCE.md) | Looks, the Appearance panel and the Design page |
| [docs/MCP.md](docs/MCP.md) | MCP tools for AI assistants |
| [docs/CLI.md](docs/CLI.md) | CLI commands |
| [docs/discord-bot.md](docs/discord-bot.md) | Discord bot setup |
| [docs/SERVER-TESTING.md](docs/SERVER-TESTING.md) | Diagnosing a production LXC over SSH |

## Appendix: Docker (optional)

A Docker setup exists for hosts that already run Docker: [deploy/docker/README.md](deploy/docker/README.md). It is not one of the supported setups above (A and B) and gets less testing.

## Support

Teamflow is free to use under [AGPL-3.0](LICENSE). If it saves you time, you can [buy me a coffee](https://ko-fi.com/toters).

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=kofi&logoColor=black)](https://ko-fi.com/toters)

The same link appears in the in-app **About** dialog. Donation links are configured in [`packages/core/src/about.ts`](packages/core/src/about.ts).

## License

[GNU Affero General Public License v3.0](LICENSE): free to use and modify. If you run a modified version for others over a network, you must share the source under the same license.
