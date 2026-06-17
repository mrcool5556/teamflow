# Teamflow — Agent Instructions

This file is the entry point for AI assistants (Cursor, Codex, etc.) working on the Teamflow codebase.

## Before you edit anything

1. Read [docs/STATUS.md](docs/STATUS.md) — current build state and active step
2. Read [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) — architecture, conventions, locked decisions
3. Read the relevant step doc in [docs/steps/](docs/steps/) for the area you are changing

## After you complete work

1. Update [docs/STATUS.md](docs/STATUS.md) — mark steps done/in-progress, add notes
2. Update the matching [docs/steps/NN-*.md](docs/steps/) — fill in decisions, files changed, verify checklist
3. If you changed the API, update [docs/API.md](docs/API.md)
4. If you changed MCP tools, update [docs/MCP.md](docs/MCP.md)
5. If you changed CLI commands, update [docs/CLI.md](docs/CLI.md)

## Rules

- **Do not** debate decisions already recorded in a completed step doc — extend or document a change instead
- **Do not** put Docker in the primary deployment path; Setup A (Windows) and Setup B (Proxmox LXC native) are first-class
- **Do not** duplicate architecture only in chat — if it matters, write it in `docs/`
- **Server is source of truth** — MCP and CLI call the HTTP API; they never touch the database directly
- **Minimize scope** — match existing patterns; one step at a time per STATUS.md

## Build order

See [docs/steps/00-overview.md](docs/steps/00-overview.md). Do not skip prerequisites.

## Deployment context

- **Setup A**: Windows + Node.js + SQLite + NSSM service — [deploy/windows/README.md](deploy/windows/README.md)
- **Setup B**: Proxmox LXC + apt + systemd + Postgres — [deploy/proxmox-lxc/README.md](deploy/proxmox-lxc/README.md)
- **Relay**: Tailscale / reverse proxy when Windows clients reach Setup B — [deploy/relay/README.md](deploy/relay/README.md)
