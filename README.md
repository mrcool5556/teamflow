# Teamflow

Self-hosted issue tracker for teams — Linear-style task delegation with first-class **AI integration** via MCP and CLI. No LLM API keys required to manage tasks; your AI chat tool connects directly to Teamflow.

## Features (planned)

- Teams, projects, issues, statuses, assignees, labels, comments
- Web UI: list view, kanban board, issue detail
- **MCP server** for Cursor / Codex (create, update, complete issues from chat)
- **CLI** (`teamflow`) for scripts and terminal workflows
- Personal access tokens (PATs) for AI and automation — not OpenAI/Anthropic keys

## Deployment paths

Pick one setup. **Docker is not required.**

| Setup | Doc | Best for |
|-------|-----|----------|
| **A — Windows self-host** | [deploy/windows/README.md](deploy/windows/README.md) | Solo/small team, same PC as Cursor |
| **B — Proxmox LXC** | [deploy/proxmox-lxc/README.md](deploy/proxmox-lxc/README.md) | Always-on team server (native install, no Docker) |

Remote access to Setup B: [deploy/relay/README.md](deploy/relay/README.md)

## Quick start (development)

> Application code is not scaffolded yet. See [docs/STATUS.md](docs/STATUS.md) for build progress.

When the monorepo exists:

```powershell
cd D:\projects\teamflow
pnpm install
pnpm dev
```

Open `http://localhost:3000`

## AI integration (Cursor)

MCP runs **locally** on your machine. It calls the Teamflow HTTP API (localhost or your server URL).

```json
{
  "mcpServers": {
    "teamflow": {
      "command": "node",
      "args": ["D:/projects/teamflow/apps/mcp/dist/index.js"],
      "env": {
        "TEAMFLOW_URL": "http://localhost:3000",
        "TEAMFLOW_TOKEN": "pat_your_token_here"
      }
    }
  }
}
```

Create a PAT in the web UI under **Settings → API tokens**. Full details: [docs/MCP.md](docs/MCP.md)

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/STATUS.md](docs/STATUS.md) | **Start here** — what is done vs pending |
| [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) | Architecture and conventions for AI assistants |
| [docs/steps/00-overview.md](docs/steps/00-overview.md) | Build phases and step order |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment index |
| [AGENTS.md](AGENTS.md) | Rules for AI agents working on this repo |

## Project layout (target)

```
teamflow/
  apps/          server, web, mcp, cli
  packages/      core, db, api-client
  deploy/        windows, proxmox-lxc, relay
  docs/          living documentation
```

## License

TBD
