# Teamflow on Linux and Proxmox (no Docker)

Teamflow runs a prebuilt release under systemd with SQLite, inside a Proxmox container, a VM or on bare metal (Debian 12+ or Ubuntu 22.04+, x64). Nothing is built on the server and no git checkout is needed.

## Install

On the **Proxmox host** (node → Shell), one line creates the container and installs Teamflow in it:

```bash
bash -c "$(curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/proxmox.sh)"
```

On a **Debian/Ubuntu machine or an existing container**:

```bash
curl -fsSL https://github.com/mrcool5556/teamflow/releases/latest/download/install.sh | sudo bash
```

Both end by printing the address and the one-time setup link (`http://<ip>:3000/setup?code=XXXX-XXXX`). Open it and create the instance admin account; there is no demo user. Lost it? The code is in `/opt/teamflow/data/setup-code` and the service log ([docs/SETUP.md](../../docs/SETUP.md)).

Options, dry runs and what each step does: [docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md#setup-b-linux-or-proxmox). Creating the container by hand instead of `proxmox.sh`: [create-lxc.md](create-lxc.md).

| Item | Value |
|------|-------|
| Container | Debian 12, unprivileged, `nesting=1` (systemd needs it), starts at boot |
| Resources | `proxmox.sh` default: 2 cores, 1 GB RAM, 8 GB disk. Teamflow needs under 1 GB of disk; uploads pause below 2 GB free |
| Packages | `curl`, `sudo`, `util-linux` if missing, Node 20 from NodeSource; needs internet |
| Port | 3000 (`--port`, `PORT` in `.env`) |
| Services | `teamflow` systemd unit, optional `teamflow-discord` |
| Data | `/opt/teamflow/.env`, `/opt/teamflow/data/` (database, uploads), backups in `/var/backups/teamflow` |

## Updating

**Settings → Updates** (instance admins): **Update now** when a new version shows. From the shell:

```bash
sudo update                          # same as sudo teamflow-update
sudo teamflow-update --version 0.2.1
sudo teamflow-update --channel prerelease
sudo teamflow-update --backup-full   # include uploads (slow)
sudo teamflow-update --help
```

An update downloads the release and checks it against `SHA256SUMS`, backs up the database, stops the service, runs migrations, switches `/opt/teamflow/current` to the new release, starts the service and waits for `/health` to report the new version. If migrations fail or the new version doesn't answer, it puts the previous release and database back and starts that. The newest two releases stay on disk. Output goes to `/opt/teamflow/data/maintenance.log`, one `STEP …` line per stage and `DONE <version>` or `FAIL <code> <message>` at the end.

## Backup and restore

```bash
sudo teamflow-backup                 # database (online, safe while running) + uploads
sudo teamflow-backup --db-only
sudo teamflow-restore --file teamflow_2026-11-12_140201.db
```

Backups go to `/var/backups/teamflow` (the newest 10 database backups are kept). A restore backs up the current database first, so it can be undone the same way. Both are also on Settings → Updates → Advanced.

## Coming from a git checkout

Servers installed before v0.2.0 ran from a clone in `/opt/teamflow`. Run the install line above on that server: it offers to switch, backs up the database, moves the checkout aside to `/opt/teamflow.git-<date>`, keeps `.env`, `data/` and uploads, and installs the release in its place. `apps/` and `deploy/` in `/opt/teamflow` become links into the release, so the systemd unit, `sudo update` and the Discord bot unit keep their paths. Once it runs, the old checkout can be deleted. `sudo update` on a checkout refuses and says to run the installer.

`deploy/proxmox-lxc/install.sh` in a checkout now runs the release installer too.

## Maintenance sudo

Settings → Updates and the Discord bot service buttons run host scripts as root through `sudo -n`. The installer runs `setup-maintenance-sudo.sh`, which:

- copies `backup.sh`, `update.sh`, `restore.sh` and `discord-bot.sh` to root-owned `/usr/local/lib/teamflow/`;
- links `/usr/local/bin/teamflow-update`, `teamflow-backup`, `teamflow-restore`, `teamflow-discord` and `update` to those copies;
- writes `/etc/sudoers.d/teamflow-maintenance`, which lets `teamflow` run only those four copies, and validates it with `visudo`.

Each file is written to a temp name, checked and renamed into place, so a script or the rule is never missing; a sudoers file that fails validation leaves the working one alone. Updates re-run it from the new release.

Test it the way the app calls it:

```bash
sudo -u teamflow sudo -n /usr/local/lib/teamflow/backup.sh --db-only
sudo -u teamflow sudo -n /usr/local/lib/teamflow/update.sh --help
sudo -u teamflow sudo -n /usr/local/lib/teamflow/discord-bot.sh status
```

In-app updates also need `TEAMFLOW_MAINTENANCE_ENABLED=true` in `.env` (the installer sets it) and the instance-admin flag on your account (the account made on `/setup`, someone made admin on Server admin → People, or `TEAMFLOW_INSTANCE_ADMINS`). Your role in the Flow that is open does not matter: Server admin → Updates & backups works from any Flow, or with none.

### KillMode

The unit must use `KillMode=process`, or `systemctl stop teamflow` (run by the update) kills the update script too. The shipped unit does; to restore it:

```bash
cp /opt/teamflow/deploy/proxmox-lxc/teamflow.service /etc/systemd/system/teamflow.service
systemctl daemon-reload
systemctl restart teamflow
```

### Not answering after an update

An update that fails rolls back by itself, so this is rare. To look:

```bash
systemctl status teamflow
journalctl -u teamflow -n 80 --no-pager
tail -n 40 /opt/teamflow/data/maintenance.log
readlink /opt/teamflow/current
curl -s http://127.0.0.1:3000/health
```

To go back to the previous release by hand: `sudo teamflow-update --version <previous> --allow-downgrade`, then restore the database backup taken before the update with `sudo teamflow-restore` if the newer version migrated it.

## Data upkeep

Issues in the trash are purged only on demand:

```bash
cd /opt/teamflow && sudo -u teamflow node current/apps/server/dist/db-maintenance.js
```

or nightly with `TEAMFLOW_DB_MAINTENANCE_NIGHTLY=true` in `.env` (then `systemctl restart teamflow`). See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md#schema-patches-and-data-maintenance).

## SMTP (password reset)

Set it on Server admin → Site & email (with a test send), or:

```bash
sudo teamflow-smtp
```

The prompts save `SMTP_*` to `.env` and restart Teamflow. Without email, an admin sends reset links from Server admin → People.

## Files

| File | Purpose |
|------|---------|
| `../install/install.sh` | The installer (`curl … \| sudo bash`) |
| `../install/proxmox.sh` | Proxmox host: create the container and run the installer in it |
| `create-lxc.md` | Creating the container by hand in the Proxmox UI |
| `install.sh` | Runs `../install/install.sh` (for old instructions and checkouts) |
| `update.sh` | Release update with rollback (`update`, `teamflow-update`) |
| `backup.sh` / `restore.sh` | Database (+ uploads) backups (`teamflow-backup`) / put one back (`teamflow-restore`) |
| `setup-maintenance-sudo.sh` | Root-owned script copies and the sudoers rule |
| `configure-smtp.sh` | SMTP wizard (`teamflow-smtp`) |
| `discord-bot.sh` | Install/enable/restart/stop/status of `teamflow-discord` |
| `teamflow.service` | systemd unit (`EnvironmentFile=/opt/teamflow/.env`, `KillMode=process`) |
| `teamflow-discord.service` | systemd unit for the Discord bot (`EnvironmentFile=/opt/teamflow/data/discord-bot.env`) |
| `diagnose.sh` | Read-only health dump for [SERVER-TESTING.md](../../docs/SERVER-TESTING.md) |
| `.env.example` | Settings reference |

Relay / remote access: [../relay/README.md](../relay/README.md)
