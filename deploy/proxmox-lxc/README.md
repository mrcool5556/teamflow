# Teamflow — Setup B: Proxmox LXC (no Docker)

Native install inside a Debian/Ubuntu LXC: `apt` + `systemd` + SQLite. (Postgres is not supported; `install.sh` still installs a PostgreSQL package that Teamflow does not use.)

## Overview

| Item | Value |
|------|-------|
| Template | Debian 12+ or Ubuntu 24.04 |
| Resources | 2 vCPU, 2–4 GB RAM, 20 GB disk |
| Services | Node 20, `teamflow` systemd unit, optional `teamflow-discord` |
| Data | `/opt/teamflow/data/teamflow.db`, `/opt/teamflow/data/uploads/` |

## Install

1. Create the LXC in Proxmox: [create-lxc.md](create-lxc.md)
2. SSH into the container
3. `git clone https://github.com/mrcool5556/teamflow.git /opt/teamflow`
4. `sudo bash /opt/teamflow/deploy/proxmox-lxc/install.sh`
5. Edit `/opt/teamflow/.env`: real `JWT_SECRET` (the service refuses the placeholder), `TEAMFLOW_SECRETS_KEY`, `PUBLIC_URL`, `CORS_ORIGINS` if the web runs on another origin, `TEAMFLOW_TRUST_PROXY=1` behind a proxy. Then `chmod 600 /opt/teamflow/.env`.
6. **Required once:** `sudo bash /opt/teamflow/deploy/proxmox-lxc/setup-maintenance-sudo.sh` (see [Maintenance sudo](#maintenance-sudo)). `install.sh` already calls it but ignores failures, so run it and read the output.
7. `systemctl restart teamflow && curl http://localhost:3000/health`
8. Open `http://<lxc-ip>:3000` and register. The first account becomes the instance admin; there is no demo user.

Full checklist: [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#production-checklist)

## Updating

```bash
sudo update
```

That stops the service, backs up the **database** (not uploads), `git pull`s as `teamflow`, runs `pnpm install`, `pnpm -r build` and `pnpm db:migrate`, starts the service, copies the systemd unit, re-runs `setup-maintenance-sudo.sh` and waits up to 30 s for `/health`. Output goes to `/opt/teamflow/data/maintenance.log`.

The same script is `teamflow-update`:

```bash
sudo teamflow-update
sudo teamflow-update --branch main
sudo teamflow-update --skip-backup   # not recommended
sudo teamflow-update --backup-full   # include uploads (slow)
```

Manual backup any time: `sudo teamflow-backup` (DB + uploads) or `sudo teamflow-backup --db-only`. Backups go to `/var/backups/teamflow`.

**Upgrading an install from before the October 2026 refactor:** pull, fix `.env` (step 5 above), run `setup-maintenance-sudo.sh` by hand once, then `sudo update`. Details: [SELF-HOSTING.md](../../docs/SELF-HOSTING.md#upgrading-from-before-the-refactor).

### Git pull as root

The repo is owned by `teamflow`. If `git pull` as root says **dubious ownership**, pull as that user:

```bash
sudo -u teamflow git -C /opt/teamflow pull
```

`sudo update` already does. If `git pull` fails with **local changes would be overwritten** on `deploy/proxmox-lxc/*.sh` (common after `sed` CRLF fixes), reset those scripts and update again:

```bash
sudo -u teamflow git -C /opt/teamflow checkout -- deploy/proxmox-lxc/*.sh
sudo update
```

## Maintenance sudo

Settings → Updates (backup, update) and the Discord bot service buttons run host scripts as root through `sudo -n`. `setup-maintenance-sudo.sh`:

- copies `backup.sh`, `update.sh` and `discord-bot.sh` to root-owned `/usr/local/lib/teamflow/` (mode 755);
- links `/usr/local/bin/teamflow-update`, `teamflow-backup`, `teamflow-discord` and `update` to those copies;
- writes `/etc/sudoers.d/teamflow-maintenance`, which lets `teamflow` run only those three copies, and validates it with `visudo`.

The checkout in `/opt/teamflow` is owned by `teamflow`, so it must never appear in sudoers (the app user could edit a script and run it as root). Re-run the helper after changing the scripts; `sudo update` does it for you.

```bash
sudo bash /opt/teamflow/deploy/proxmox-lxc/setup-maintenance-sudo.sh
systemctl restart teamflow
```

Test (this is how the app calls it):

```bash
sudo -u teamflow sudo -n /usr/local/lib/teamflow/backup.sh --db-only
sudo -u teamflow sudo -n /usr/local/lib/teamflow/update.sh --help
sudo -u teamflow sudo -n /usr/local/lib/teamflow/discord-bot.sh status
```

If you see `command not found`, the script may have Windows line endings or not be executable; re-run the helper (it fixes both).

Manual sudoers, only if you prefer not to use the helper (you still need the root-owned copies):

```bash
cat >/etc/sudoers.d/teamflow-maintenance <<'EOF'
teamflow ALL=(root) NOPASSWD: /usr/local/lib/teamflow/backup.sh *, /usr/local/lib/teamflow/update.sh *, /usr/local/lib/teamflow/discord-bot.sh *
EOF
chmod 440 /etc/sudoers.d/teamflow-maintenance
visudo -cf /etc/sudoers.d/teamflow-maintenance
```

### In-app updates (Settings → Updates)

Needs all of:

- `TEAMFLOW_MAINTENANCE_ENABLED=true` in `.env` (the template sets it);
- the instance-admin flag on your account (first account, or `TEAMFLOW_INSTANCE_ADMINS`) plus `server.maintenance.view` / `.run` in the team (Owner has them);
- the maintenance sudo step above.

Opening the panel shows cached status; **Refresh status** runs `git fetch` and the sudo probe.

### KillMode

The systemd unit must use `KillMode=process`. Otherwise `systemctl stop teamflow` (run by the update) kills the update script too: the log stops at `App dir:` and the site stays on 502. `sudo update` copies the current unit; to fix by hand:

```bash
cp /opt/teamflow/deploy/proxmox-lxc/teamflow.service /etc/systemd/system/teamflow.service
systemctl daemon-reload
systemctl restart teamflow
```

### 502 after an update

The service was stopped and did not come back (often a failed build, or a placeholder `JWT_SECRET` after upgrading):

```bash
systemctl status teamflow
journalctl -u teamflow -n 80 --no-pager
cat /opt/teamflow/data/maintenance.log
curl -s http://127.0.0.1:3000/health
```

Bring it back:

```bash
systemctl start teamflow

# If start fails, rebuild and start
cd /opt/teamflow
chown -R teamflow:teamflow /opt/teamflow   # fix root-owned dist/node_modules from manual root builds
sudo -u teamflow pnpm install
sudo -u teamflow pnpm -r build
sudo -u teamflow pnpm db:migrate
systemctl restart teamflow
```

If `pnpm -r build` fails with **EACCES** on `apps/web/dist`, run the `chown` line first.

**Requires a git clone** at `/opt/teamflow` (not a snapshot copy without `.git`).

## Data upkeep

Issues in the trash are purged only on demand:

```bash
cd /opt/teamflow && sudo -u teamflow pnpm db:maintenance
```

or add `TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true` to `.env` and restart. See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md#schema-patches-and-data-maintenance).

## SMTP (password reset)

```bash
sudo teamflow-smtp
```

Interactive prompts save SMTP settings to `.env` and restart Teamflow. Use your provider's SMTP (Gmail app password, SendGrid, ...). Without SMTP, production servers cannot send reset links.

## Files

| File | Purpose |
|------|---------|
| `create-lxc.md` | Proxmox UI checklist |
| `install.sh` | apt packages, Node 20, build, migrate, systemd, maintenance sudo, SMTP prompt |
| `configure-smtp.sh` | SMTP wizard (`teamflow-smtp`) |
| `update.sh` | pull → build → migrate → restart (`update`, `teamflow-update`) |
| `backup.sh` | SQLite (+ uploads) backups (`teamflow-backup`) |
| `setup-maintenance-sudo.sh` | Root-owned script copies and the sudoers rule |
| `discord-bot.sh` | Install/enable/restart/stop/status of `teamflow-discord` |
| `teamflow.service` | systemd unit (`EnvironmentFile=/opt/teamflow/.env`, `KillMode=process`) |
| `teamflow-discord.service` | systemd unit for the Discord bot (`EnvironmentFile=/opt/teamflow/data/discord-bot.env`) |
| `diagnose.sh` | Read-only health dump for [SERVER-TESTING.md](../../docs/SERVER-TESTING.md) |
| `.env.example` | Production env template |

Relay / remote access: [../relay/README.md](../relay/README.md)

Full guide: [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#setup-b-proxmox-lxc)
