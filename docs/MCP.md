# MCP integration

The MCP server (`apps/mcp`) runs **locally** over stdio, next to your AI client (Cursor, Codex, Claude Code, Claude Desktop). It calls the Teamflow HTTP API with a personal access token; it never touches the database.

## Environment

The server reads exactly two variables:

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `TEAMFLOW_TOKEN` | yes (exits with `TEAMFLOW_TOKEN is required` otherwise) | — | `pat_...` |
| `TEAMFLOW_URL` | no | `http://localhost:3000` | `https://tasks.example.com` |

There is no token-file option: put the PAT itself in `TEAMFLOW_TOKEN`. Create one in the web UI under **Settings → API tokens**. Give it `read` only if the assistant should never change the board, and a `teamId` to keep it on one team (see [AUTH.md](AUTH.md#api-tokens-pats)). The token acts as its user, so that user needs `board.edit` on the team for create/update/complete/comment.

## Build

```powershell
pnpm install
pnpm build          # builds packages/* and apps/mcp/dist
```

## Cursor config

`.cursor/mcp.json` (copy [`.cursor/mcp.json.example`](../.cursor/mcp.json.example); it holds your token, so do not commit it; `.gitignore` does not cover it):

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

The example file uses `${workspaceFolder}`; if your client does not expand it, use an absolute path as above.

Dev (without building the MCP app; `packages/*` still need a build):

```json
"command": "npx",
"args": ["tsx", "D:/projects/teamflow/apps/mcp/src/index.ts"]
```

## Tools

All ids are UUIDs. Results are JSON text.

| Tool | Parameters | Description |
|------|------------|-------------|
| `list_teams` | — | Teams the token's user belongs to |
| `list_projects` | `teamId?` | Projects, optionally for one team |
| `list_rows` | `teamId` | Board rows (swimlanes) |
| `list_statuses` | `teamId`, `rowId?` | Workflow columns for the whole team, or only one row's columns when `rowId` is given |
| `list_team_members` | `teamId` | Members (for assignment); the token's user needs `team.members.view` |
| `list_issues` | `teamId?`, `projectId?`, `statusId?`, `assigneeId?`, `assigneeEmail?`, `rowId?`, `rowName?`, `search?`, `compact?` | Filtered issues. Compact by default (description cut to 280 chars); `compact: false` returns full issues |
| `get_my_work` | `teamId`, `rowId?`, `rowName?`, `includeRowOwned?` | Issues assigned to you; `includeRowOwned` adds issues in rows assigned to you |
| `get_board_summary` | `teamId` | Per row: columns, count per column, open and total |
| `get_issue` | `issueId` | One issue with full description and comments |
| `create_issue` | `teamId`, `title`, `description?`, `projectId?`, `statusId?`, `rowId?`, `rowName?`, `priority?`, `assigneeId?`, `assigneeEmail?` | New issue. `priority` is `none`, `low`, `medium`, `high` or `urgent` |
| `update_issue` | `issueId`, `title?`, `description?`, `statusId?`, `rowId?` (null clears), `priority?`, `assigneeId?` (null clears) | Patch fields |
| `complete_issue` | `issueId` | Move to the issue row's `done`-type column (400 if the row has none) |
| `add_comment` | `issueId`, `body` | Add a comment |

### Behaviour to know

- `rowName` and `assigneeEmail` are matched case-insensitively against the team's rows and members. In `list_issues` they only work together with `teamId`; without it they are ignored. A name that matches nothing is dropped silently, so `create_issue` then lands in the default row and the filter in `list_issues` is not applied.
- `get_board_summary` counts an issue as open when its column is not named "Done", and puts issues without a row in the first row.
- Not available through MCP (use the web UI or [API.md](API.md)): deleting or restoring issues, row and column changes, attachments, due dates, multiple assignees, colors, ref lookup.

## Remote API

When the API runs on a server, change only `TEAMFLOW_URL` (Tailscale name, or your HTTPS domain). MCP still runs on your machine. See [deploy/relay/README.md](../deploy/relay/README.md).
