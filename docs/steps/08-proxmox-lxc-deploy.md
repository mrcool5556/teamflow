# Step 08 — Proxmox LXC deploy (Setup B)

## Goal

Always-on Teamflow on Proxmox using native `apt` + `systemd` — no Docker.

## Status: ready (scripts + docs)

## Prerequisites

- Steps 01–06 complete
- Proxmox host with LXC support
- Git or scp to copy repo to `/opt/teamflow`

## How to run

1. Follow [deploy/proxmox-lxc/create-lxc.md](../../deploy/proxmox-lxc/create-lxc.md)
2. Clone repo to `/opt/teamflow`
3. `sudo bash deploy/proxmox-lxc/install.sh`
4. `curl http://localhost:3000/health`

## Note on PostgreSQL

Postgres user/DB are created by `install.sh`. Full Drizzle Postgres driver support is **Phase 2**. For v1 on LXC, use SQLite in `.env`:

```
DATABASE_URL=file:./data/teamflow.db
```

Then `pnpm db:setup` before starting the service.

## Verify

- [ ] LXC created and reachable on LAN
- [ ] `systemctl status teamflow` is active
- [ ] `/health` returns `{"ok":true}`
- [ ] Web UI loads from another machine on LAN

## Next step

[09-relay.md](09-relay.md) — remote access from Windows / Cursor
