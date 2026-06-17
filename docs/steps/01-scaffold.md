# Step 01 — Monorepo scaffold

## Goal

pnpm workspace with `apps/` and `packages/` layout.

## Status: done (2026-06-16)

## Decisions made

- pnpm workspaces (not npm/yarn)
- TypeScript strict mode via shared `tsconfig.base.json`
- Node >= 20

## Files created

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- `packages/core`, `packages/db`, `packages/api-client`
- `apps/server`, `apps/web`, `apps/mcp`, `apps/cli`

## How to run

```powershell
cd D:\projects\teamflow
corepack enable
pnpm install
pnpm -r build
```

## How to verify

- [x] `pnpm install` succeeds
- [x] `pnpm -r build` succeeds (web, server, mcp, cli, packages)

## Next step

[02-database.md](02-database.md)
