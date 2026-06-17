# Build overview

Phased build order for Teamflow. Each step has a doc in this folder; update [STATUS.md](../STATUS.md) when a step ships.

## Phase 1 — Foundation

| Order | Step | Doc | Depends on |
|-------|------|-----|------------|
| 0 | Docs bootstrap | AI_CONTEXT, STATUS | — |
| 1 | Monorepo scaffold | [01-scaffold.md](01-scaffold.md) | 0 |
| 2 | Database | [02-database.md](02-database.md) | 1 |
| 3 | HTTP API | [03-api.md](03-api.md) | 2 |
| 4 | Web UI | [04-web.md](04-web.md) | 3 |
| 5 | MCP server | [05-mcp.md](05-mcp.md) | 3 |
| 6 | CLI | [06-cli.md](06-cli.md) | 3 |
| 7 | Windows deploy | [07-windows-deploy.md](07-windows-deploy.md) | 1–6 |
| 8 | Proxmox LXC deploy | [08-proxmox-lxc-deploy.md](08-proxmox-lxc-deploy.md) | 1–6 |
| 9 | Relay | [09-relay.md](09-relay.md) | 8 |

## Phase 2 — Team productivity (not started)

Search, saved views, webhooks, RBAC refinements.

## Phase 3 — Linear parity (not started)

Cycles, roadmaps, sub-issues, imports.

## For AI assistants

1. Read [../AI_CONTEXT.md](../AI_CONTEXT.md)
2. Read [../STATUS.md](../STATUS.md)
3. Work only the **Next action** step unless the user asks otherwise
4. Update STATUS + step doc when done
