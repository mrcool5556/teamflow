# MCP integration

MCP runs **locally** (stdio). It calls the Teamflow HTTP API using a personal access token.

## Environment

| Variable | Required | Example |
|----------|----------|---------|
| `TEAMFLOW_URL` | yes | `http://localhost:3000` |
| `TEAMFLOW_TOKEN` | yes | `pat_...` |

Create a PAT in the web UI: **API Tokens** → Create token.

## Cursor config

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

Dev (without build):

```json
"command": "npx",
"args": ["tsx", "D:/projects/teamflow/apps/mcp/src/index.ts"]
```

## Tools

| Tool | Description |
|------|-------------|
| `list_teams` | Teams for authenticated user |
| `list_projects` | Projects, optional `teamId` |
| `list_rows` | Board swimlanes for a team |
| `list_statuses` | Workflow columns for a team |
| `list_team_members` | Users on a team |
| `list_issues` | Filter by team, project, status, assignee, row, search |
| `get_my_work` | Issues assigned to you (+ optional row-owned lane) |
| `get_board_summary` | Compact row/column counts for AI orientation |
| `get_issue` | Issue + comments (full description) |
| `create_issue` | New issue (`rowName`, `description` for doc source) |
| `update_issue` | Patch fields |
| `complete_issue` | Mark Done |
| `add_comment` | Add comment |

See [AI-DOC-WORKFLOW.md](AI-DOC-WORKFLOW.md) for using Teamflow as an action layer over large doc repos (e.g. 3dfriend).

## Remote API (Proxmox)

When API runs on your server, only change `TEAMFLOW_URL` to your relay URL (Tailscale, etc.). MCP still runs on Windows.
