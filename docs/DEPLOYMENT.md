# Deployment index

**Start here for production:** [SELF-HOSTING.md](SELF-HOSTING.md) (setups A and B, and the [production checklist](SELF-HOSTING.md#production-checklist)). Every setup installs a prebuilt release from GitHub; how releases are built and published: [RELEASING.md](RELEASING.md).

| Setup | Path | Guide section |
|-------|------|---------------|
| **A. Windows** | [deploy/windows/](../deploy/windows/README.md) | [Self-hosting → Windows](SELF-HOSTING.md#setup-a-windows) |
| **A. Windows app** | [apps/desktop/](../apps/desktop/build.ps1) (built by the release workflow) | [Self-hosting → Windows](SELF-HOSTING.md#option-1-the-teamflow-app-easiest) |
| **B. Linux / Proxmox** | [deploy/install/](../deploy/install/install.sh), [deploy/proxmox-lxc/](../deploy/proxmox-lxc/README.md) | [Self-hosting → Linux or Proxmox](SELF-HOSTING.md#setup-b-linux-or-proxmox) |
| Relay (remote HTTPS) | [deploy/relay/](../deploy/relay/README.md) | [Self-hosting → Remote access](SELF-HOSTING.md#remote-access) |
| Docker (optional) | [deploy/docker/](../deploy/docker/README.md) | [Self-hosting → Appendix](SELF-HOSTING.md#appendix-docker-optional) |

| Doc | Purpose |
|-----|---------|
| [AUTH.md](AUTH.md) | Instance admin, roles, PATs, password reset, SMTP |
| [ATTACHMENTS.md](ATTACHMENTS.md) | Uploads, storage, team files and trash |
| [SPACES.md](SPACES.md) | Upload caps per team, free spaces, the server admin page |
| [SERVER-TESTING.md](SERVER-TESTING.md) | Diagnosing a production LXC |
| [RELEASING.md](RELEASING.md) | Version tags, the release workflow, checksums and attestations |
| [SETUP.md](SETUP.md) | First-time setup and the setup code the installers print |

## Local development

See the [README quick start](../README.md#quick-start-development). In short: Node 20, `pnpm install`, `pnpm build`, then `NODE_ENV=development pnpm dev`.

- Web dev: <http://localhost:5173> (Vite proxies `/api` to the API)
- API: <http://localhost:3000>

## Production from a checkout (single port, by hand)

Not needed with the installers. Build web and server; the server serves `apps/web/dist` when `SERVE_WEB=true` (or when `NODE_ENV=production` and the build exists):

```powershell
pnpm install
pnpm build
pnpm db:migrate
node apps/server/dist/index.js     # loads .env; it must set JWT_SECRET and SERVE_WEB=true
```

Open <http://localhost:3000>. At startup the server loads `TEAMFLOW_ENV_FILE` if set, else `.env` in the app folder if it exists. Variables already in the process environment always win over the file. Set `TEAMFLOW_ENV_FILE` to use another file.

## Schema patches and data maintenance

- On boot the server brings the SQLite schema up to `SCHEMA_VERSION` (`packages/db/src/patches.ts`, currently 4). Version 4 adds spaces: every existing team becomes an admin space with no upload cap, so nothing changes until an instance admin sets one ([SPACES.md](SPACES.md)). The version lives in the `schema_version` table; an up-to-date database skips the patch run, an older one runs every patch once inside a single transaction. `pnpm db:migrate` does the same without starting the server.
- A database written by a newer build is left untouched with a warning; update the app.
- A fresh install logs `Database schema at version 4 (was 0)`; an upgrade logs the old version instead.

  | Version | What it brings |
  |---------|----------------|
  | 2 | First tracked version: the `schema_version` table plus every earlier idempotent patch (roles, invites, stored files, instance admin, token version, ...); older databases show as 0 |
  | 3 | `board.edit` granted once to every existing role except the built-in Viewer ([AUTH.md](AUTH.md#editing-the-board-boardedit)) |
  | 4 | Spaces: every existing team becomes an admin space with no upload cap; new user teams are free spaces ([SPACES.md](SPACES.md)) |
- Boot no longer changes user data. These jobs run only on demand:
  - purge issues that have been in the trash for more than 7 days;
  - re-grant `team.data.transfer` to Owner roles that lack it;
  - promote the earliest Admin in a team that has no Owner;
  - renumber duplicate issue numbers, then add `UNIQUE(team_id, number)`.
- Run them by hand with `pnpm db:maintenance` in a checkout (uses `DATABASE_URL` like `pnpm db:migrate`). On a release install, from the install folder: `cd /opt/teamflow && sudo -u teamflow node current/apps/server/dist/db-maintenance.js` (Windows, in the install folder: `& .\node\node.exe current\apps\server\dist\db-maintenance.js`). Or set `TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true` to run them in the server every night at 03:00 local time.
- If the server logs "Duplicate issue number … UNIQUE(team_id, number) not created", run the data maintenance above once.
- Separately, the server purges trashed team files older than 7 days and expired chunked-upload sessions each time it starts.

## Postgres

Not supported. Only SQLite (`better-sqlite3`) is implemented. The unused PostgreSQL package and the systemd ordering on `postgresql.service` were removed in v0.2.0; an old install may still have PostgreSQL installed. Teamflow never used it, so it can be removed (`apt remove postgresql postgresql-contrib`) if nothing else on that machine uses it.
