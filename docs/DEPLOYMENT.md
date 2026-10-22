# Deployment index

**Start here for production:** [SELF-HOSTING.md](SELF-HOSTING.md)

| Setup | Path | Guide section |
|-------|------|---------------|
| **Windows** | [deploy/windows/](../deploy/windows/) | [Self-hosting → Windows](SELF-HOSTING.md#windows) |
| **Proxmox LXC** | [deploy/proxmox-lxc/](../deploy/proxmox-lxc/) | [Self-hosting → LXC](SELF-HOSTING.md#proxmox-lxc) |
| **Docker** | [deploy/docker/](../deploy/docker/) | [Self-hosting → Docker](SELF-HOSTING.md#docker) |
| **Relay** (remote HTTPS) | [deploy/relay/](../deploy/relay/) | [Self-hosting → Remote access](SELF-HOSTING.md#remote-access) |

| Doc | Purpose |
|-----|---------|
| [AUTH.md](AUTH.md) | Password reset, SMTP, invites, PATs |
| [ATTACHMENTS.md](ATTACHMENTS.md) | Issue file uploads |

## Local development

```powershell
pnpm db:setup
pnpm dev
```

- Web dev: http://localhost:5173 (Vite proxies `/api`)
- API: http://localhost:3000

## Production (single port, no Docker)

Build web + server; server serves `apps/web/dist`:

```powershell
pnpm build
$env:SERVE_WEB = "true"
node apps/server/dist/index.js
```

Open http://localhost:3000

## Schema patches and data maintenance

- On boot the server brings the SQLite schema up to `SCHEMA_VERSION` (`packages/db/src/patches.ts`). The current version lives in the `schema_version` table; an up-to-date database skips the patch run, an older one runs every patch once inside a single transaction.
- Boot no longer changes user data. These jobs run only on demand:
  - purge issues that have been in the trash for more than 7 days;
  - re-grant `team.data.transfer` to Owner roles that lack it;
  - promote the earliest Admin in a team that has no Owner;
  - renumber duplicate issue numbers, then add `UNIQUE(team_id, number)`.
- Run them by hand with `pnpm db:maintenance` (uses `DATABASE_URL` like `pnpm db:migrate`), or set `TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true` to run them in the server every night at 03:00 local time.
- If the server logs "Duplicate issue number … UNIQUE(team_id, number) not created", run `pnpm db:maintenance` once.
