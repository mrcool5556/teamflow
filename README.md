# Teamflow

Self-hosted issue tracker for teams — kanban boards, roles, Discord integration, and first-class **AI tooling** via MCP and CLI.

## Features

- Teams, projects, issues, statuses, assignees, comments
- Web UI: kanban board, issue drawer, roles & permissions
- **MCP server** for Cursor / Codex (create, update, complete issues from chat)
- **CLI** (`teamflow`) for scripts and terminal workflows
- **Discord bot** — slash commands, ticket threads, share links
- Personal access tokens (PATs) for AI and automation

## Deployment

**[Self-hosting guide](docs/SELF-HOSTING.md)** — install and update for Windows, Proxmox LXC, and Docker.

| Setup | Doc | Best for |
|-------|-----|----------|
| **Windows** | [deploy/windows/README.md](deploy/windows/README.md) | Dev machine or small team on one PC |
| **Proxmox LXC** | [deploy/proxmox-lxc/README.md](deploy/proxmox-lxc/README.md) | Always-on Linux server (`sudo update`) |
| **Docker** | [deploy/docker/README.md](deploy/docker/README.md) | VPS or any Docker host |
| **Remote access** | [deploy/relay/README.md](deploy/relay/README.md) | nginx / Cloudflare in front of the server |

## Quick start (development)

```powershell
git clone https://github.com/mrcool5556/teamflow.git
cd teamflow
pnpm install
cp .env.example .env
pnpm db:setup
pnpm dev
```

Open `http://localhost:5173` (API on `http://localhost:3000`).

Production single-port: set `SERVE_WEB=true`, run `pnpm build`, then start the server.

## AI integration (Cursor)

MCP runs on your machine and calls the Teamflow HTTP API.

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

Create a PAT in **Settings → API tokens**. Details: [docs/MCP.md](docs/MCP.md)

## Discord bot

```powershell
pnpm --filter @teamflow/discord-bot dev
```

Setup: [docs/discord-bot.md](docs/discord-bot.md)

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) | **Install & update** — Windows, LXC, Docker |
| [docs/API.md](docs/API.md) | HTTP API reference |
| [docs/CLI.md](docs/CLI.md) | CLI commands |
| [docs/MCP.md](docs/MCP.md) | MCP tools for AI assistants |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment overview |
| [docs/discord-bot.md](docs/discord-bot.md) | Discord bot setup |

## Support

Teamflow is free to use under [AGPL-3.0](LICENSE). Optional donations help fund development:

- [GitHub Sponsors](https://github.com/sponsors/mrcool5556)
- [Ko-fi](https://ko-fi.com/YOUR_KOFI_USERNAME) — replace `YOUR_KOFI_USERNAME` in `.github/FUNDING.yml` and `packages/core/src/about.ts`
- [PayPal](https://paypal.me/YOUR_PAYPAL_USERNAME) — replace `YOUR_PAYPAL_USERNAME` in the same files

## License

[GNU Affero General Public License v3.0](LICENSE) — free to use and modify. If you run a modified version for others over a network, you must share the source under the same license. This discourages proprietary forks while keeping the project open for everyone.
