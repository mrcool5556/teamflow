# Deployment index

**Start here for production:** [SELF-HOSTING.md](SELF-HOSTING.md) (setups A and B, and the [production checklist](SELF-HOSTING.md#production-checklist)).

| Setup | Path | Guide section |
|-------|------|---------------|
| **A. Windows** | [deploy/windows/](../deploy/windows/README.md) | [Self-hosting → Windows](SELF-HOSTING.md#setup-a-windows) |
| **B. Proxmox LXC** | [deploy/proxmox-lxc/](../deploy/proxmox-lxc/README.md) | [Self-hosting → LXC](SELF-HOSTING.md#setup-b-proxmox-lxc) |
| Relay (remote HTTPS) | [deploy/relay/](../deploy/relay/README.md) | [Self-hosting → Remote access](SELF-HOSTING.md#remote-access) |
| Docker (optional) | [deploy/docker/](../deploy/docker/README.md) | [Self-hosting → Appendix](SELF-HOSTING.md#appendix-docker-optional) |

| Doc | Purpose |
|-----|---------|
| [AUTH.md](AUTH.md) | Instance admin, roles, PATs, password reset, SMTP |
| [ATTACHMENTS.md](ATTACHMENTS.md) | Uploads, storage, team files and trash |
| [SERVER-TESTING.md](SERVER-TESTING.md) | Diagnosing a production LXC |

## Local development

See the [README quick start](../README.md#quick-start-development). In short: Node 20, `pnpm install`, `pnpm build`, then `NODE_ENV=development pnpm dev`.

- Web dev: <http://localhost:5173> (Vite proxies `/api` to the API)
- API: <http://localhost:3000>

## Production (single port, by hand)

Build web and server; the server serves `apps/web/dist` when `SERVE_WEB=true` (or when `NODE_ENV=production` and the build exists):

```powershell
pnpm install
pnpm build
pnpm db:migrate
node apps/server/dist/index.js     # loads .env; it must set JWT_SECRET and SERVE_WEB=true
```

Open <http://localhost:3000>. At startup the server loads `TEAMFLOW_ENV_FILE` if set, else `.env` in the app folder if it exists. Variables already in the process environment always win over the file. Set `TEAMFLOW_ENV_FILE` to use another file.

## Schema patches and data maintenance

- On boot the server brings the SQLite schema up to `SCHEMA_VERSION` (`packages/db/src/patches.ts`, currently 3). The version lives in the `schema_version` table; an up-to-date database skips the patch run, an older one runs every patch once inside a single transaction. `pnpm db:migrate` does the same without starting the server.
- A database written by a newer build is left untouched with a warning; update the app.
- Boot no longer changes user data. These jobs run only on demand:
  - purge issues that have been in the trash for more than 7 days;
  - re-grant `team.data.transfer` to Owner roles that lack it;
  - promote the earliest Admin in a team that has no Owner;
  - renumber duplicate issue numbers, then add `UNIQUE(team_id, number)`.
- Run them by hand with `pnpm db:maintenance` (uses `DATABASE_URL` like `pnpm db:migrate`; on the LXC: `cd /opt/teamflow && sudo -u teamflow pnpm db:maintenance`), or set `TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true` to run them in the server every night at 03:00 local time.
- If the server logs "Duplicate issue number … UNIQUE(team_id, number) not created", run `pnpm db:maintenance` once.
- Separately, the server purges trashed team files older than 7 days and expired chunked-upload sessions each time it starts.

## Postgres

Not supported. Only SQLite (`better-sqlite3`) is implemented; Postgres support is deferred. The LXC installer still installs a PostgreSQL package and the unit still orders after `postgresql.service`, but nothing connects to it.
