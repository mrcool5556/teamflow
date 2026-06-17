# Teamflow — Setup B: Proxmox LXC (no Docker)

Native install inside a Debian/Ubuntu LXC: `apt` + `systemd` + PostgreSQL.

## Overview

| Item | Value |
|------|-------|
| Template | Debian 12 or Ubuntu 24.04 |
| Resources | 2 vCPU, 2–4 GB RAM, 20 GB disk |
| Services | Node 20, PostgreSQL, Teamflow systemd unit |

## Steps

1. Create LXC in Proxmox — see [create-lxc.md](create-lxc.md)
2. SSH into container
3. Clone repo to `/opt/teamflow`
4. Run `sudo bash deploy/proxmox-lxc/install.sh`
5. Open `http://<lxc-ip>:3000`

## Files

| File | Purpose |
|------|---------|
| `create-lxc.md` | Proxmox UI checklist |
| `install.sh` | apt packages, build, Postgres, systemd |
| `teamflow.service` | systemd unit |
| `backup.sh` | pg_dump backups |
| `.env.example` | Production env |

Relay / remote access: [../relay/README.md](../relay/README.md)

See [docs/steps/08-proxmox-lxc-deploy.md](../../docs/steps/08-proxmox-lxc-deploy.md)
