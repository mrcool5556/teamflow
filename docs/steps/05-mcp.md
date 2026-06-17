# Step 05 — MCP server

## Status: done (2026-06-16)

## Build & run

```powershell
pnpm --filter @teamflow/mcp build
$env:TEAMFLOW_URL="http://localhost:3000"
$env:TEAMFLOW_TOKEN="pat_..."
node apps/mcp/dist/index.js
```

See [../MCP.md](../MCP.md) for Cursor config.

## Next step

[06-cli.md](06-cli.md)
