# CLI reference

Binary: `teamflow` (from `apps/cli`)

Config file: `%USERPROFILE%\.teamflow\config.json`

## Login

```powershell
# With email (session token)
pnpm --filter @teamflow/cli exec tsx src/index.ts login --url http://localhost:3000 --email demo@teamflow.local --password changeme123

# With PAT
pnpm --filter @teamflow/cli exec tsx src/index.ts login --url http://localhost:3000 --token pat_...
```

## Commands

```powershell
teamflow whoami
teamflow issues list
teamflow issues list --team <team-uuid>
teamflow issues create --team <uuid> --title "Fix bug" --priority high
teamflow issues update <issue-uuid> --title "New title"
teamflow issues complete <issue-uuid>
teamflow issues comment <issue-uuid> --body "Shipped"
```

## Get team UUID

Login via web, open browser devtools → Network → `/teams` response, or use MCP `list_teams`.
