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

That stops the service, backs up the database, `git pull`s, builds, runs migrations, and restarts.

Same script is also available as `teamflow-update`:

```bash
sudo teamflow-update
sudo teamflow-update --branch main
sudo teamflow-update --skip-backup   # not recommended
```

If you installed before `update` existed, install the command once:

```bash
sudo install -m 755 /opt/teamflow/deploy/proxmox-lxc/update.sh /usr/local/bin/teamflow-update
sudo ln -sf teamflow-update /usr/local/bin/update
```

**Requires a git clone** at `/opt/teamflow` (not a snapshot copy without `.git`).

## Files

| File | Purpose |
|------|---------|
| `create-lxc.md` | Proxmox UI checklist |
| `install.sh` | apt packages, build, systemd, `update` command |
| `update.sh` | pull → build → migrate → restart |
| `teamflow.service` | systemd unit |
| `backup.sh` | SQLite / Postgres backups |
| `.env.example` | Production env |

Relay / remote access: [../relay/README.md](../relay/README.md)
