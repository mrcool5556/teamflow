# Step 02 — Database

## Goal

SQLite schema via Drizzle + `init.sql` migration path.

## Status: done (2026-06-16)

## Decisions made

- SQLite default at `data/teamflow.db` (repo root)
- `findRepoRoot()` resolves DB path from any package cwd
- Demo seed creates ENG team + 3 sample issues

## Files

- `packages/db/src/schema.ts`
- `packages/db/src/init.sql`
- `packages/db/src/migrate.ts`, `seed.ts`

## How to run

```powershell
pnpm db:setup
```

## How to verify

- [x] `data/teamflow.db` exists after migrate
- [x] Seed prints demo login

## Demo credentials

- Email: `demo@teamflow.local`
- Password: `changeme123`

## Next step

[03-api.md](03-api.md)
