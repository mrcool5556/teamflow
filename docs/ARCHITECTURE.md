# Architecture

High-level system design for Teamflow. See [AI_CONTEXT.md](AI_CONTEXT.md) for conventions and locked decisions.

## System diagram

```mermaid
flowchart LR
  subgraph clients [Clients]
    Web[WebApp]
    MCP[MCP_stdio]
    CLI[CLI]
  end
  subgraph teamflow [TeamflowServer]
    API[HonoAPI]
    Static[StaticWebAssets]
    DB[(SQLite_or_Postgres)]
  end
  Web --> API
  MCP --> API
  CLI --> API
  API --> DB
  Web --> Static
```

## Request flow — create issue via MCP

```mermaid
sequenceDiagram
  participant User
  participant Cursor
  participant MCP as MCP_local_stdio
  participant API as TeamflowAPI
  participant DB as Database

  User->>Cursor: Create high priority issue for auth bug
  Cursor->>MCP: create_issue tool call
  MCP->>API: POST /issues Bearer PAT
  API->>API: Validate Zod schema auth PAT
  API->>DB: Insert issue
  API->>DB: Log activity
  API-->>MCP: 201 issue JSON
  MCP-->>Cursor: Tool result
  Cursor-->>User: Created ENG-42
```

## Package boundaries

| Package | Responsibility | Depends on |
|---------|----------------|------------|
| `packages/core` | Types, Zod schemas, constants | — |
| `packages/db` | Drizzle schema, migrations, seed | core |
| `packages/api-client` | Typed fetch wrapper | core |
| `apps/server` | HTTP routes, auth, static files | core, db, api-client |
| `apps/web` | React UI | core, api-client |
| `apps/mcp` | MCP tool definitions | core, api-client |
| `apps/cli` | Command-line interface | core, api-client |

**Rule:** `apps/mcp` and `apps/cli` never import `packages/db`. All data access goes through the API.

## Deployment topologies

### Setup A — Windows

```mermaid
flowchart TB
  subgraph win [WindowsHost]
    NSSM[NSSM_Service]
    Node[NodeAPI]
    SQLite[(SQLite_file)]
    NSSM --> Node
    Node --> SQLite
  end
  Cursor[CursorMCP] -->|localhost:3000| Node
```

### Setup B — Proxmox LXC

```mermaid
flowchart TB
  subgraph lxc [ProxmoxLXC]
    Systemd[systemd]
    Node[NodeAPI]
    PG[(Postgres)]
    Systemd --> Node
    Node --> PG
  end
  Cursor[CursorMCP_Windows] -->|tailnet_or_proxy| Node
```

## Auth layers

1. **Session auth** — web UI only; cookie-based
2. **PAT auth** — MCP, CLI, future webhooks; `Bearer` header
3. **Team membership** — authorization after authentication

## Production static assets

In production, `apps/server` serves the built `apps/web/dist` files. In development, Vite dev server proxies API calls (or runs on separate port).
