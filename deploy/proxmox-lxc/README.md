# Teamflow — Setup B: Proxmox LXC (no Docker)

Native install inside a Debian/Ubuntu LXC: `apt` + `systemd` + SQLite or PostgreSQL.

## Overview

| Item | Value |
|------|-------|
| Template | Debian 12+ or Ubuntu 24.04 |
| Resources | 2 vCPU, 2–4 GB RAM, 20 GB disk |
| Services | Node 20, Teamflow systemd unit |

## Steps

1. Create LXC in Proxmox — see [create-lxc.md](create-lxc.md)
2. SSH into container
3. Clone repo to `/opt/teamflow`
4. Run `sudo bash deploy/proxmox-lxc/install.sh`
5. Open `http://<lxc-ip>:3000`

## Updating

On a dedicated Teamflow LXC, after `install.sh` you can run:

```bash
sudo update
```

That stops the service, backs up the **database** (not uploads — those stay on disk), `git pull`s, builds, runs migrations, and restarts.

Uploads are unchanged during an update. For a full backup including files, run `sudo teamflow-backup` (or `sudo update --backup-full`).

Same script is also available as `teamflow-update`:

```bash
sudo teamflow-update
sudo teamflow-update --branch main
sudo teamflow-update --skip-backup   # not recommended
sudo teamflow-update --backup-full # include uploads (slow)
```

If you installed before `update` existed, install the command once:

```bash
sudo install -m 755 /opt/teamflow/deploy/proxmox-lxc/update.sh /usr/local/bin/teamflow-update
sudo install -m 755 /opt/teamflow/deploy/proxmox-lxc/backup.sh /usr/local/bin/teamflow-backup
sudo ln -sf teamflow-update /usr/local/bin/update
```

Each `sudo update` refreshes these wrappers from the repo automatically.

### Git pull as root

The repo is owned by `teamflow`. If `git pull` as root says **dubious ownership**, either pull as that user:

```bash
sudo -u teamflow git -C /opt/teamflow pull
```

or allow the directory once (as root):

```bash
git config --global --add safe.directory /opt/teamflow
```

`sudo update` already runs `git pull` as `teamflow` — use that for routine updates.

If `git pull` fails with **local changes would be overwritten** on `deploy/proxmox-lxc/*.sh` (common after `sed` CRLF fixes on the server), reset those scripts and update again:

```bash
sudo -u teamflow git -C /opt/teamflow checkout -- deploy/proxmox-lxc/*.sh
sudo update
```

Manual backup anytime: `sudo teamflow-backup` (DB + uploads) or `sudo teamflow-backup --db-only`

**In-app updates (Settings → Updates):** enable `TEAMFLOW_MAINTENANCE_ENABLED=true` in `.env`, grant the **Owner** role, then install passwordless sudo for the `teamflow` user:

```bash
sudo bash /opt/teamflow/deploy/proxmox-lxc/setup-maintenance-sudo.sh
systemctl restart teamflow
```

Test (must match how the app invokes sudo — direct wrapper, no bash prefix):

```bash
sudo -u teamflow sudo -n /usr/local/bin/teamflow-backup --db-only
sudo -u teamflow sudo -n /usr/local/bin/teamflow-update --help
```

If you see `command not found`, the script may have Windows line endings or is not executable — re-run `setup-maintenance-sudo.sh` (it fixes both).

Manual sudoers (only if you prefer not to use the helper):

```bash
cat >/etc/sudoers.d/teamflow-maintenance <<'EOF'
teamflow ALL=(root) NOPASSWD: /usr/local/bin/teamflow-backup *, /usr/local/bin/teamflow-update *, /usr/bin/bash /opt/teamflow/deploy/proxmox-lxc/backup.sh *, /usr/bin/bash /opt/teamflow/deploy/proxmox-lxc/update.sh *
EOF
chmod 440 /etc/sudoers.d/teamflow-maintenance
visudo -cf /etc/sudoers.d/teamflow-maintenance
```

**Critical:** the systemd unit must use `KillMode=process`. Otherwise `systemctl stop teamflow` (run by `teamflow-update`) kills the update script too — the log stops at `App dir:` and the site stays on 502.

```bash
cp /opt/teamflow/deploy/proxmox-lxc/teamflow.service /etc/systemd/system/teamflow.service
systemctl daemon-reload
systemctl restart teamflow
```

If the unit file on disk is not updated yet:

```bash
grep -q '^KillMode=process' /etc/systemd/system/teamflow.service || \
  sed -i '/^ExecStart=/a KillMode=process' /etc/systemd/system/teamflow.service
systemctl daemon-reload
systemctl restart teamflow
```

If the site shows **502 Bad Gateway** after an in-app update, the service was stopped and may not have restarted (often a failed `pnpm build`). On the server:

```bash
systemctl status teamflow
journalctl -u teamflow -n 80 --no-pager
cat /opt/teamflow/data/maintenance.log
curl -s http://127.0.0.1:3000/health
```

Bring it back:

```bash
# If the service is inactive, try starting it
systemctl start teamflow

# If start fails, rebuild and start
cd /opt/teamflow
chown -R teamflow:teamflow /opt/teamflow   # fix root-owned dist/node_modules from manual root builds
sudo -u teamflow pnpm install
sudo -u teamflow pnpm -r build
sudo -u teamflow pnpm db:migrate
systemctl restart teamflow
```

If `pnpm -r build` fails with **EACCES** on `apps/web/dist`, run the `chown` line above first — some files were created as root.

Or fix git/deploy script drift and run `sudo update` from SSH.

**Requires a git clone** at `/opt/teamflow` (not a snapshot copy without `.git`).

## SMTP (password reset)

After install, run:

```bash
sudo teamflow-smtp
```

Interactive prompts save SMTP settings to `.env` and restart Teamflow. No local mail server is installed — use your provider's SMTP (Gmail app password, SendGrid, etc.).

## Files

| File | Purpose |
|------|---------|
| `create-lxc.md` | Proxmox UI checklist |
| `install.sh` | apt packages, build, systemd, `update` + SMTP prompt |
| `configure-smtp.sh` | SMTP wizard (`teamflow-smtp` on PATH) |
| `update.sh` | pull → build → migrate → restart |
| `teamflow.service` | systemd unit |
| `backup.sh` | SQLite / Postgres backups |
| `setup-maintenance-sudo.sh` | Passwordless sudo for in-app Updates |
| `.env.example` | Production env |

Relay / remote access: [../relay/README.md](../relay/README.md)

Full guide: [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#proxmox-lxc)
