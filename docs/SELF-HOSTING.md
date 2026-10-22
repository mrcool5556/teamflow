# Self-hosting Teamflow

Teamflow runs on your hardware. **Teammates only need a browser**: they open your URL and accept an invite. This guide is for the person who runs the server.

## Pick a setup

| Setup | Best for | Install | Update |
|-------|----------|---------|--------|
| **[A. Windows](#setup-a-windows)** | Dev machine, small team on one PC | `install.ps1` | `.\deploy\windows\update.ps1` |
| **[B. Proxmox LXC](#setup-b-proxmox-lxc)** | Always-on Linux server | `install.sh` | `sudo update` or Settings → Updates |

Both run the same app: one Node 20 process, SQLite in `data/teamflow.db`, files in `data/uploads/`, API and web UI on port **3000**. Docker is available as an [optional appendix](#appendix-docker-optional). Postgres is not supported (deferred).

```text
You (host)                         Teammates
──────────                         ──────────
install once  →  run server  →  https://your-domain
git push      →  update       →  refresh browser
```

---

## Production checklist

Do these on every production install, and once when upgrading an install from before the October 2026 refactor:

1. **Node 20** on the server (`node -v` → `v20.x`). `better-sqlite3` is built for Node 20; other majors fail at start.
2. **`JWT_SECRET`**: a real random value, at least 16 characters (`openssl rand -hex 32`). The server **refuses to start** while it is unset, short, or one of the shipped placeholders (`change-me-...`, `dev-secret`).
3. **`TEAMFLOW_SECRETS_KEY`** (recommended): a second random value that encrypts Discord secrets at rest. Same rules; when unset, `JWT_SECRET` is used.
4. **`PUBLIC_URL`**: the address users open, e.g. `https://tasks.example.com`. Used for invite and reset links and as the allowed browser origin.
5. **`CORS_ORIGINS`**: only if the web UI is served from a different origin than `PUBLIC_URL` (comma-separated). Default is same-origin only.
6. **Behind a reverse proxy:** `TEAMFLOW_TRUST_PROXY=1`, so login rate limiting sees real client IPs.
7. **Setup B only:** run `sudo bash /opt/teamflow/deploy/proxmox-lxc/setup-maintenance-sudo.sh` once after deploying. It installs root-owned copies of the backup, update and Discord bot scripts in `/usr/local/lib/teamflow/` and the only sudoers rule the app user gets. Without it Settings → Updates and the Discord bot service buttons fail. `install.sh` and `sudo update` run it too, but ignore its errors, so check the output.
8. **Admin account:** there is **no demo user**. The first account registered on a fresh install becomes the **instance admin** (Updates, Discord bot secrets and service). On an upgraded install the oldest account is promoted once. To grant more, set `TEAMFLOW_INSTANCE_ADMINS=you@example.com,other@example.com` (applied at their next login).
9. **Trash purge:** issues in the trash are no longer purged at boot. Run `pnpm db:maintenance` now and then, or set `TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true` (03:00 server time). See [DEPLOYMENT.md](DEPLOYMENT.md#schema-patches-and-data-maintenance).
10. **SMTP** for password reset. Without it, reset links are only logged when `NODE_ENV=development`, so in production nobody can reset a password.
11. **`.env` permissions** on Linux: `chmod 600`, owned by `teamflow`.

Useful but optional: `NODE_ENV=production` (turns off the localhost dev origins in CORS), `TEAMFLOW_INVITE_ONLY=true`.

**The server does not read `.env` by itself.** On Setup B systemd loads it (`EnvironmentFile=/opt/teamflow/.env`). On Setup A you must pass it (see below).

---

## Before you install (all setups)

1. Clone the repo (or let `clone-install.ps1` do it):
   ```bash
   git clone https://github.com/mrcool5556/teamflow.git
   ```
2. Fill in `.env` from the checklist above. Templates: [`deploy/proxmox-lxc/.env.example`](../deploy/proxmox-lxc/.env.example), [`deploy/windows/env.example`](../deploy/windows/env.example), and the full list in the root [`.env.example`](../.env.example).

### Remote access

Friends need **HTTPS** on a real domain (or a LAN IP for testing):

```text
Browser → Caddy / Cloudflare / Tailscale → Teamflow :3000
```

Details: [deploy/relay/README.md](../deploy/relay/README.md)

---

## Setup A: Windows

**Good for:** your dev/gaming PC, testing, MCP on the same machine.

### Requirements

- Windows 10/11
- [Git](https://git-scm.com/): `winget install Git.Git`
- **Node 20** (not 22 or 24): the v20 installer from <https://nodejs.org/en/download> or nvm-windows (`nvm install 20.19.2; nvm use 20.19.2`)

### Install

From an existing clone:

```powershell
cd D:\teamflow
.\deploy\windows\install.ps1        # creates .env from env.example, pnpm install, build, migrate
notepad .env                        # set JWT_SECRET (and PUBLIC_URL if others connect)
```

Fresh machine (clone + install):

```powershell
.\deploy\windows\clone-install.ps1 -RepoUrl "https://github.com/mrcool5556/teamflow.git" -InstallPath "D:\teamflow"
```

### Start

`start.ps1` and the NSSM service do **not** load `.env`, and the server refuses to start without `JWT_SECRET`. Until the scripts are fixed, start it with Node's own env-file loader:

```powershell
cd D:\teamflow
$env:SERVE_WEB = "true"
node --env-file=.env apps/server/dist/index.js
```

or set the variables in the session first and use `.\deploy\windows\start.ps1`:

```powershell
$env:JWT_SECRET = "<your secret>"
.\deploy\windows\start.ps1
```

Open <http://localhost:3000> and register; the first account becomes the instance admin.

### Update

```powershell
cd D:\teamflow
.\deploy\windows\update.ps1
```

Stops the app, backs up `data\teamflow.db`, `git pull`, `pnpm install`, `pnpm build`, `pnpm db:migrate`. Start it again as above (`-StartAfter` uses `start.ps1`, which needs `JWT_SECRET` in the environment).

### Optional: Windows service (NSSM)

```powershell
.\deploy\windows\install-service.ps1
nssm set Teamflow AppEnvironmentExtra PORT=3000 DATABASE_URL=file:./data/teamflow.db SERVE_WEB=true JWT_SECRET=<your secret> PUBLIC_URL=http://localhost:3000
nssm restart Teamflow
```

`install-service.ps1` only sets `PORT` and `DATABASE_URL`; the second line replaces that list with everything the server needs.

More: [deploy/windows/README.md](../deploy/windows/README.md)

---

## Setup B: Proxmox LXC

**Good for:** a dedicated always-on server on Proxmox.

### Requirements

- Proxmox VE with an LXC container, Debian 12+ or Ubuntu 24.04
- About 2 CPU, 2–4 GB RAM, 20 GB disk

### Install

1. Create the LXC: [deploy/proxmox-lxc/create-lxc.md](../deploy/proxmox-lxc/create-lxc.md)
2. In the container:

   ```bash
   git clone https://github.com/mrcool5556/teamflow.git /opt/teamflow
   cd /opt/teamflow
   sudo bash deploy/proxmox-lxc/install.sh
   ```

   `install.sh` installs Node 20 and pnpm, creates the `teamflow` user, builds, runs `pnpm db:migrate` (no demo data), installs the systemd unit, runs `setup-maintenance-sudo.sh`, links `teamflow-smtp` and offers SMTP setup. (It also installs a PostgreSQL package that Teamflow does not use.)

3. Edit `/opt/teamflow/.env` (the service will not start with the placeholder secret):

   ```bash
   nano /opt/teamflow/.env       # JWT_SECRET, TEAMFLOW_SECRETS_KEY, PUBLIC_URL, CORS_ORIGINS if needed
   chmod 600 /opt/teamflow/.env
   systemctl restart teamflow
   curl http://localhost:3000/health
   ```

4. Open the site and register the first (admin) account.

### SMTP (password reset emails)

`install.sh` asks at the end. Later:

```bash
sudo teamflow-smtp
```

Use your provider's SMTP (no mail server is installed in the LXC):

| Provider | SMTP host | Port |
|----------|-----------|------|
| Gmail (app password) | `smtp.gmail.com` | 587 |
| Outlook / Microsoft 365 | `smtp.office365.com` | 587 |
| SendGrid | `smtp.sendgrid.net` | 587 |

Values go into `/opt/teamflow/.env` and the service restarts. Without SMTP, production servers log nothing usable for **Forgot password**.

### Update

```bash
sudo update            # same as sudo teamflow-update
```

Stops the service, backs up the database (`--backup-full` adds uploads), `git pull` as `teamflow`, `pnpm install`, `pnpm -r build`, `pnpm db:migrate`, starts the service, refreshes the systemd unit and re-runs `setup-maintenance-sudo.sh`, then waits for `/health`.

**In-app updates (Settings → Updates)** need `TEAMFLOW_MAINTENANCE_ENABLED=true`, the instance-admin flag and the sudoers step. Progress is logged to `/opt/teamflow/data/maintenance.log`.

`/opt/teamflow` must be a **git clone**. More, including 502 recovery and `KillMode=process`: [deploy/proxmox-lxc/README.md](../deploy/proxmox-lxc/README.md)

### Upgrading from before the refactor

The first update onto this release changes how the server starts. On the LXC:

```bash
sudo -u teamflow git -C /opt/teamflow pull
nano /opt/teamflow/.env                 # replace placeholder JWT_SECRET; add TEAMFLOW_SECRETS_KEY, CORS_ORIGINS as needed
sudo bash /opt/teamflow/deploy/proxmox-lxc/setup-maintenance-sudo.sh
sudo update
```

Changing `JWT_SECRET` signs everyone out once. Unless `TEAMFLOW_SECRETS_KEY` was already set, saved Discord bot credentials were encrypted with the old `JWT_SECRET`: keep that value as `TEAMFLOW_SECRETS_KEY` if it was a real secret (placeholders are refused), otherwise re-enter the bot credentials in Settings → Integrations after the upgrade.

---

## Inviting teammates

1. Log in on your public `PUBLIC_URL` (not localhost).
2. **Settings → Team → Invite link** → create a link (pick a role; you cannot invite above your own role).
3. Send the link. They register, join, and bookmark the page.

---

## Password reset

**Forgot password?** on the login screen:

- With SMTP → the reset link is emailed.
- Without SMTP → only logged when `NODE_ENV=development`.

A reset signs the user out everywhere. Details: [AUTH.md](AUTH.md#forgot-password)

---

## Environment variables

Full list with comments: root [`.env.example`](../.env.example). The ones a production install usually sets:

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_SECRET` | yes | Signs sessions; placeholders refused |
| `PUBLIC_URL` | yes for a public host | Links in invites and emails; allowed CORS origin |
| `TEAMFLOW_SECRETS_KEY` | recommended | Encrypts Discord secrets; falls back to `JWT_SECRET` |
| `DATABASE_URL` | no | Default `file:./data/teamflow.db` (relative to the repo root) |
| `SERVE_WEB` | set by installers | Serve the built web UI from the API port |
| `CORS_ORIGINS` | no | Extra allowed browser origins |
| `TEAMFLOW_TRUST_PROXY` | behind a proxy | Use `X-Forwarded-For` for rate limiting |
| `TEAMFLOW_AUTH_RATE_LIMIT` | no | Login/register/forgot attempts per minute per IP (default 10) |
| `TEAMFLOW_INSTANCE_ADMINS` | no | Emails that get the instance-admin flag at login |
| `TEAMFLOW_INVITE_ONLY` | no | `true` = registration only through an invite |
| `TEAMFLOW_MAINTENANCE_ENABLED` | Setup B | Enables Settings → Updates |
| `TEAMFLOW_DB_MAINTENANCE_NIGHTLY` | no | Nightly trash purge and data upkeep |
| `TEAMFLOW_BOT_CONFIG_KEY` | Discord bot | Generated when bot credentials are saved |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | for email reset | Provider settings |
| `ATTACHMENT_MAX_*`, `UPLOAD_CHUNK_*`, `UPLOAD_DIR` | no | See [ATTACHMENTS.md](ATTACHMENTS.md) |
| `PORT` / `HOST` | no | Default `3000` / `0.0.0.0` |
| `NODE_ENV` | no | `production` drops the localhost dev origins; `development` allows a dev secret |

Invalid values (e.g. `PORT=abc`) stop the server at start with a list of problems.

Discord bot and MCP have their own docs: [discord-bot.md](discord-bot.md), [MCP.md](MCP.md).

---

## Moving your board to another machine

Stop the server, then copy:

- `data/teamflow.db` (and `-wal` / `-shm` if present)
- `data/uploads/`
- `.env` (secrets, `PUBLIC_URL`; keep the same `JWT_SECRET` / `TEAMFLOW_SECRETS_KEY` or saved Discord secrets become unreadable)

Install on the new machine, put `data/` and `.env` in place, then start. A single team can also move as a bundle: Settings → Team → Export & import (`team.data.transfer`, Owner by default).

---

## Development

Not for production. See the [README quick start](../README.md#quick-start-development).

---

## Quick reference

| Action | Windows (A) | LXC (B) |
|--------|-------------|---------|
| Install | `install.ps1` | `install.sh` |
| Start | `node --env-file=.env apps/server/dist/index.js` or NSSM | `systemctl start teamflow` |
| Update | `update.ps1` | `sudo update` or Settings → Updates |
| Logs | terminal / NSSM | `journalctl -u teamflow -f`, `data/maintenance.log` |
| Config | `.env` in repo root (passed explicitly) | `/opt/teamflow/.env` (systemd) |
| Backup | `backup.ps1` | `sudo teamflow-backup` |
| Data upkeep | `pnpm db:maintenance` | `sudo -u teamflow pnpm db:maintenance` in `/opt/teamflow` |

---

## Appendix: Docker (optional)

Not one of the supported setups; use it only if you already run Docker.

```bash
git clone https://github.com/mrcool5556/teamflow.git
cd teamflow/deploy/docker
cp .env.example .env
nano .env   # JWT_SECRET (real value), PUBLIC_URL
docker compose up -d --build
```

The entrypoint runs migrations (and the demo seed only with `TEAMFLOW_SEED_DEMO=1`) on each start; data stays in the `teamflow-data` volume. Update with `git pull` then `docker compose up -d --build`. In-app updates and the Discord bot service do not work in Docker. More: [deploy/docker/README.md](../deploy/docker/README.md)
