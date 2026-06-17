# Step 03 — HTTP API

## Status: done (2026-06-16)

## Run

```powershell
cd D:\projects\teamflow\apps\server
npx tsx src/index.ts
```

Or from root after `pnpm db:setup`:

```powershell
pnpm --filter @teamflow/server dev
```

## Verify

```powershell
Invoke-RestMethod http://localhost:3000/health
```

See [../API.md](../API.md) for full contract.

## Next step

[04-web.md](04-web.md)
